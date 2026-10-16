import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  behaviorAssertions, EXTENSION_LOAD_ERROR_PATTERN, parseJsonLines, SDK_NAMES,
  UNHANDLED_ERROR_PATTERN, VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = process.argv.includes("--update-curated-report")
  ? resolve(root, "docs/verification/pi-sdk-smoke.json")
  : resolve(root, ".tmp/pi-sdk-smoke.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const expectedVersions = Object.fromEntries(SDK_NAMES.map((name) => [name, "1.2.0"]));
const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) =>
  [name, readJson(resolve(root, "node_modules", name, "package.json")).version]));
for (const name of SDK_NAMES) {
  if (manifest.devDependencies?.[name] !== expectedVersions[name] || sdkVersions[name] !== expectedVersions[name]) {
    throw new Error(`Smoke requires exact Pi SDK 1.2.0 dev/test pin for ${name}: manifest=${manifest.devDependencies?.[name]}, installed=${sdkVersions[name]}`);
  }
}

const piManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piManifest.bin.pi);
const piCommand = resolve(root, "node_modules/.bin", process.platform === "win32" ? "pi.cmd" : "pi");
const agentDir = mkdtempSync(resolve(tmpdir(), "pi-spawnkit-sdk-smoke-"));
const baseEnv = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_BIN: piCommand,
  PI_SPAWNKIT_DISABLE_SESSION_PATCH: "1" };
const rpcArgs = [piCli, "--offline", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
  "--no-context-files", "--no-prompt-templates", "--no-mcp", "-e", ".", "--mode", "rpc"];
const timeoutMs = 15_000;

function parseLine(line) {
  try { return JSON.parse(line); } catch { return undefined; }
}

async function runRpc(name, env = baseEnv, runFeature = true) {
  const child = spawn(process.execPath, rpcArgs, { cwd: root, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  let stdoutPending = "";
  let stderrPending = "";
  let closeResult;
  let failure;
  const rows = [];
  const waiters = new Set();
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const closePromise = new Promise((resolveClose) => child.once("close", (code, signal) => {
    closeResult = { code, signal };
    resolveClose(closeResult);
    checkWaiters();
  }));
  async function waitForClose(timeout) {
    let timer;
    const closed = await Promise.race([
      closePromise.then(() => true),
      new Promise((resolveWait) => { timer = setTimeout(() => resolveWait(false), timeout); }),
    ]);
    if (timer) clearTimeout(timer);
    return closed;
  }

  function consume(stream, chunk) {
    const text = chunk.toString("utf8");
    if (stream === "stdout") stdout += text;
    else stderr += text;
    let pending = stream === "stdout" ? stdoutPending : stderrPending;
    pending += text;
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    if (stream === "stdout") stdoutPending = pending;
    else stderrPending = pending;
    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed) rows.push(parsed);
    }
    checkWaiters();
  }
  function checkWaiters() {
    for (const waiter of [...waiters]) waiter.check();
  }
  child.stdout.on("data", (chunk) => consume("stdout", chunk));
  child.stderr.on("data", (chunk) => consume("stderr", chunk));
  child.on("error", (error) => { failure = error.message; checkWaiters(); });
  let commandNames = [];
  let promptResponse;

  function waitFor(predicate, label) {
    return new Promise((resolveWait, rejectWait) => {
      let timer;
      const finish = (error, value) => {
        clearTimeout(timer);
        waiters.delete(waiter);
        error ? rejectWait(error) : resolveWait(value);
      };
      const waiter = {
        check() {
          const value = predicate();
          if (value) return finish(undefined, value);
          if (failure) return finish(new Error(failure));
          if (closeResult) return finish(new Error(`Pi host exited before ${label} (exit ${closeResult.code})`));
        },
      };
      waiters.add(waiter);
      const remaining = Math.max(1, deadline - Date.now());
      timer = setTimeout(() => finish(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`)), remaining);
      waiter.check();
    });
  }

  async function request(type, id, fields = {}) {
    const responsePromise = waitFor(() => rows.find((row) => row?.type === "response" && row.id === id), `${type} response`);
    child.stdin.write(`${JSON.stringify({ type, id, ...fields })}\n`);
    return responsePromise;
  }

  try {
    const commandsResponse = await request("get_commands", "smoke-commands");
    commandNames = commandsResponse.success === true
      ? (commandsResponse.data?.commands ?? []).filter((command) => command.source === "extension").map((command) => command.name)
      : [];
    if (runFeature) {
      const promptResponsePromise = waitFor(() => rows.find((row) => row?.type === "response"
        && row.id === "smoke-prompt" && row.command === "prompt"), "doctor prompt response");
      child.stdin.write(`${JSON.stringify({ type: "prompt", id: "smoke-prompt", message: "/spawnkit:doctor --json" })}\n`);
      await waitFor(() => rows.find((row) => row?.type === "extension_ui_request" && row.method === "notify"
        && typeof row.message === "string" && row.message.startsWith("{")), "doctor notification");
      promptResponse = await promptResponsePromise;
    }
    child.stdin.end();
    let exited = await waitForClose(1_000);
    if (!exited) {
      failure ??= "Pi host did not shut down within the 1s grace period after stdin end.";
      child.kill("SIGKILL");
      exited = await waitForClose(1_000);
    }
    if (!exited) failure ??= "Pi host process remained alive after SIGKILL cleanup.";
    if (closeResult?.code !== 0 || closeResult?.signal !== null) failure ??= `Pi host shutdown was not clean: ${JSON.stringify(closeResult)}`;
    const fullOutput = `${stdout}${stderr}${failure ? `\n${failure}` : ""}`;
    const hasUnhandledError = UNHANDLED_ERROR_PATTERN.test(fullOutput);
    const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput) || rows.some((row) => row?.type === "extension_error");
    const assertions = behaviorAssertions(name, {
      responses: rows, commandNames, promptResponse, fullOutput, exit_code: closeResult?.code ?? 1,
      processExited: closeResult !== undefined, expectedVersion: "1.2.0", piCli: piCommand,
    });
    return {
      name, command: "npm run smoke:pi", exit_code: closeResult?.code ?? 1,
      passed: !failure && !hasUnhandledError && !hasLoadError && assertions.every((item) => item.passed),
      evidence: evidenceRows(rows), assertions, hasUnhandledError, hasLoadError, fullOutput,
      responses: rows, commandNames, promptResponse, processExited: closeResult !== undefined,
    };
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    try { child.stdin.end(); } catch { /* cleanup below */ }
    if (!closeResult) {
      const closed = await waitForClose(1_000);
      if (!closed) {
        child.kill("SIGKILL");
        const forcedExit = await waitForClose(1_000);
        if (!forcedExit) failure += "; Pi host remained alive after SIGKILL cleanup";
      }
    }
    const fullOutput = `${stdout}${stderr}\n${failure}`;
    const hasUnhandledError = UNHANDLED_ERROR_PATTERN.test(fullOutput);
    const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput) || rows.some((row) => row?.type === "extension_error");
    const assertions = behaviorAssertions(name, {
      responses: rows, commandNames: [], fullOutput, exit_code: closeResult?.code ?? 1,
      processExited: closeResult !== undefined, expectedVersion: "1.2.0", piCli: piCommand,
    });
    return { name, command: "npm run smoke:pi", exit_code: closeResult?.code ?? 1, passed: false,
      evidence: evidenceRows(rows, failure), assertions, hasUnhandledError, hasLoadError, fullOutput,
      responses: rows, commandNames, promptResponse, processExited: closeResult !== undefined };
  }
}

function evidenceRows(rows, failure) {
  const output = rows.map((row) => {
    if (row?.type === "response" && row.command === "get_commands") {
      return { type: row.type, command: row.command, success: row.success,
        registered_extension_commands: (row.data?.commands ?? []).filter((command) => command.source === "extension").map((command) => command.name) };
    }
    if (row?.type === "extension_ui_request" && row.method === "notify" && typeof row.message === "string") {
      let data;
      try { data = JSON.parse(row.message); } catch { return { type: row.type, method: row.method, message: row.message.slice(0, 200) }; }
      return { type: row.type, method: row.method, diagnostics: {
        platform: data.platform,
        sessionEnvPatch: { status: data.sessionEnvPatch?.status, smokeStatus: data.sessionEnvPatch?.smokeStatus },
        spawnPlan: { command: data.spawnPlan?.command?.split(/[\\/]/u).at(-1), confidence: data.spawnPlan?.confidence },
        smoke: { status: data.smoke?.status, versionText: data.smoke?.versionText,
          exitCode: data.smoke?.exitCode, errorCode: data.smoke?.errorCode },
      } };
    }
    if (row?.type === "response") return { type: row.type, command: row.command, success: row.success,
      disposition: row.data?.disposition, error: row.error };
    if (row?.type === "extension_error") return { type: row.type, event: row.event, error: row.error };
    return { type: row?.type };
  });
  const safeFailure = failure?.replaceAll(agentDir, "<isolated-agent-dir>").replaceAll(root, "<checkout>");
  return JSON.stringify({ output, ...(safeFailure ? { failure: safeFailure } : {}) });
}

function runHostShell() {
  let shell;
  let shellArgs;
  if (process.platform === "win32") {
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    shellArgs = ["-NoProfile", "-NonInteractive", "-Command",
      `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`];
  } else {
    shell = "/bin/sh";
    shellArgs = ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", process.execPath, piCli];
  }
  const result = spawnSync(shell, shellArgs, { cwd: root, env: baseEnv, encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  return { result, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}` };
}

try {
  const cases = [
    await runRpc("extension_load", baseEnv, false),
    await runRpc("happy_path"),
    await runRpc("error_path", { ...baseEnv, PI_BIN: resolve(agentDir, process.platform === "win32" ? "missing-pi.exe" : "missing-pi") }),
  ];
  const firstReloadHost = await runRpc("happy_path");
  const secondReloadHost = await runRpc("happy_path");
  const firstSummary = JSON.parse(firstReloadHost.evidence);
  const secondSummary = JSON.parse(secondReloadHost.evidence);
  const reloaded = behaviorAssertions("reload_cleanup", {
    responses: firstReloadHost.responses,
    commandNames: firstReloadHost.commandNames,
    promptResponse: firstReloadHost.promptResponse,
    fullOutput: firstReloadHost.fullOutput,
    exit_code: firstReloadHost.exit_code,
    secondResponses: secondReloadHost.responses,
    secondCommandNames: secondReloadHost.commandNames,
    secondPromptResponse: secondReloadHost.promptResponse,
    secondOutput: secondReloadHost.fullOutput,
    secondExitCode: secondReloadHost.exit_code,
    firstExited: firstReloadHost.processExited,
    secondExited: secondReloadHost.processExited,
    processExited: firstReloadHost.processExited,
    expectedVersion: "1.2.0",
    piCli: piCommand,
  });
  const reloadOutput = `${firstSummary.output.map((row) => JSON.stringify(row)).join("\n")}\n--- second Pi host ---\n${secondSummary.output.map((row) => JSON.stringify(row)).join("\n")}`;
  cases.push({
    name: "reload_cleanup", command: "npm run smoke:pi",
    exit_code: firstReloadHost.exit_code === 0 && secondReloadHost.exit_code === 0 ? 0 : 1,
    passed: firstReloadHost.passed && secondReloadHost.passed && reloaded.every((item) => item.passed),
    evidence: reloadOutput, assertions: reloaded,
    hasUnhandledError: firstReloadHost.hasUnhandledError || secondReloadHost.hasUnhandledError,
    hasLoadError: firstReloadHost.hasLoadError || secondReloadHost.hasLoadError,
  });

  const shell = runHostShell();
  const shellExitCode = shell.result.status ?? 1;
  const shellAssertions = behaviorAssertions("host_shell", {
    fullOutput: shell.output, exit_code: shellExitCode, processExited: shell.result.status !== null && !shell.result.error,
    expectedVersion: "1.2.0", piCli,
  });
  cases.push({ name: "host_shell", command: "npm run smoke:pi", exit_code: shellExitCode,
    passed: shellExitCode === 0 && !shell.result.error && shellAssertions.every((item) => item.passed),
    evidence: shell.output.slice(-1000) || "No output captured", assertions: shellAssertions,
    hasUnhandledError: UNHANDLED_ERROR_PATTERN.test(shell.output), hasLoadError: false });

  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: sdkVersions,
    platform: process.platform,
    model_inference: "none; actual Pi host loads the package and handles /spawnkit:doctor RPC; no extension lifecycle or feature mocks",
    unhandled_errors: cases.filter((item) => item.hasUnhandledError).length,
    extension_load_errors: cases.filter((item) => item.hasLoadError || (item.name === "extension_load" && !item.passed)).length,
    cases: cases.map(({ name, command, exit_code, passed, evidence, assertions }) =>
      ({ name, command, exit_code, passed, evidence, assertions })),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform,
    cases: cases.map((item) => ({ name: item.name, passed: item.passed, exit_code: item.exit_code })) }));
  if (cases.some((item) => !item.passed)) process.exitCode = 1;
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
