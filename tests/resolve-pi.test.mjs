import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";

const resolver = await import("../lib/resolve-pi.ts");

function normalizeVirtualPath(candidatePath) {
  return candidatePath.replace(/\\/gu, "/").replace(/\/+$/u, "").toLowerCase();
}

function virtualFileExists(paths) {
  const existing = new Set(paths.map(normalizeVirtualPath));
  return (candidatePath) => existing.has(normalizeVirtualPath(candidatePath));
}

function resolveWithVirtualFiles(options, paths) {
  return resolver.resolvePiExecutable({
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists(paths),
    ...options,
  });
}

test("spawnkit_resolve_pi returns a stable SpawnPlan shape", async () => {
  const piPath = "/opt/node/bin/pi";
  const spawnPlan = await resolver.spawnkit_resolve_pi({
    platform: "linux",
    env: { PATH: "", npm_config_prefix: "/opt/node" },
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists([piPath]),
  });

  assert.deepEqual(Object.keys(spawnPlan), ["command", "argsPrefix", "envPatch", "confidence", "warnings"]);
  assert.equal(spawnPlan.command, piPath);
  assert.deepEqual(spawnPlan.argsPrefix, []);
  assert.deepEqual(spawnPlan.envPatch, { PI_BIN: piPath, PATH: "/opt/node/bin" });
  assert.equal(spawnPlan.confidence, "high");
  assert.deepEqual(spawnPlan.warnings, []);
});

test("Windows resolver selects %APPDATA%/npm/pi.cmd before other names", async () => {
  const appData = String.raw`C:\Users\alice\AppData\Roaming`;
  const npmBin = String.raw`C:\Users\alice\AppData\Roaming\npm`;
  const piCmd = String.raw`C:\Users\alice\AppData\Roaming\npm\pi.cmd`;
  const piExe = String.raw`C:\Users\alice\AppData\Roaming\npm\pi.exe`;
  const barePi = String.raw`C:\Users\alice\AppData\Roaming\npm\pi`;

  const result = await resolveWithVirtualFiles({ platform: "win32", env: { Path: "", APPDATA: appData } }, [piCmd, piExe, barePi]);

  assert.equal(result.spawnPlan.command, piCmd);
  assert.equal(result.spawnPlan.confidence, "high");
  assert.deepEqual(result.spawnPlan.envPatch, { PI_BIN: piCmd, Path: npmBin });
});

test("Windows resolver falls back to pi.exe when pi.cmd is absent", async () => {
  const appData = String.raw`C:\Users\alice\AppData\Roaming`;
  const piExe = String.raw`C:\Users\alice\AppData\Roaming\npm\pi.exe`;

  const result = await resolveWithVirtualFiles({ platform: "win32", env: { Path: "", APPDATA: appData } }, [piExe]);

  assert.equal(result.spawnPlan.command, piExe);
  assert.equal(result.spawnPlan.confidence, "high");
});

test("Windows resolver accepts Git Bash npm shim paths with bare pi", async () => {
  const npmBin = "/c/Users/alice/AppData/Roaming/npm";
  const gitBashPi = "/c/Users/alice/AppData/Roaming/npm/pi";

  const result = await resolveWithVirtualFiles({ platform: "win32", env: { Path: npmBin } }, [gitBashPi]);

  assert.equal(result.spawnPlan.command, gitBashPi);
  assert.equal(result.spawnPlan.envPatch.Path, npmBin);
});

test("Windows PI_BIN=pi resolves the npm cmd shim instead of preserving an unusable bare command", async () => {
  const appData = String.raw`C:\Users\alice\AppData\Roaming`;
  const npmBin = String.raw`C:\Users\alice\AppData\Roaming\npm`;
  const piCmd = String.raw`C:\Users\alice\AppData\Roaming\npm\pi.cmd`;

  const result = await resolveWithVirtualFiles({
    platform: "win32",
    env: { Path: "", APPDATA: appData, PI_BIN: "pi" },
  }, [piCmd]);

  assert.equal(result.spawnPlan.command, piCmd);
  assert.equal(result.spawnPlan.confidence, "configured");
  assert.deepEqual(result.spawnPlan.envPatch, { PI_BIN: piCmd, Path: npmBin });
});

test("Windows resolver reports a missing plan when PATH has no candidates", async () => {
  const result = await resolveWithVirtualFiles({ platform: "win32", env: { Path: "" } }, []);

  assert.equal(result.spawnPlan.command, "pi.cmd");
  assert.equal(result.spawnPlan.confidence, "missing");
  assert.deepEqual(result.spawnPlan.envPatch, { PI_BIN: "pi.cmd" });
  assert.ok(result.spawnPlan.warnings.some((warning) => warning.includes("No Pi executable candidates")));
});

test("POSIX resolver checks npm/global bin candidates", async () => {
  const piPath = "/opt/node/bin/pi";

  const result = await resolveWithVirtualFiles({ platform: "linux", env: { PATH: "", npm_config_prefix: "/opt/node" } }, [piPath]);

  assert.equal(result.spawnPlan.command, piPath);
  assert.deepEqual(result.spawnPlan.envPatch, { PI_BIN: piPath, PATH: "/opt/node/bin" });
});

test("POSIX resolver supports normal PATH lookup", async () => {
  const piPath = "/custom/bin/pi";

  const result = await resolveWithVirtualFiles({ platform: "linux", env: { PATH: "/bin:/custom/bin" } }, [piPath]);

  assert.equal(result.spawnPlan.command, piPath);
  assert.equal(result.spawnPlan.confidence, "medium");
  assert.equal(result.candidates.find((candidate) => candidate.path === piPath)?.source, "path");
});

test("spawn plan invocation stays direct on POSIX", () => {
  const invocation = resolver.buildSpawnPlanInvocation({
    command: "/opt/pi/bin/pi",
    argsPrefix: ["--profile", "child"],
    envPatch: {},
    confidence: "high",
    warnings: [],
  }, ["--version"], { platform: "darwin" });

  assert.deepEqual(invocation, {
    command: "/opt/pi/bin/pi",
    args: ["--profile", "child", "--version"],
  });
});

test("Windows batch SpawnPlans run through ComSpec with safe argv boundaries", () => {
  const invocation = resolver.buildSpawnPlanInvocation({
    command: String.raw`C:\Users\alice\AppData\Roaming\npm\pi.cmd`,
    argsPrefix: [],
    envPatch: {},
    confidence: "high",
    warnings: [],
  }, ["--prompt", "review & keep \"quoted\""], {
    platform: "win32",
    env: { ComSpec: String.raw`C:\Windows\System32\cmd.exe` },
  });

  assert.equal(invocation.command, String.raw`C:\Windows\System32\cmd.exe`);
  assert.deepEqual(invocation.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.match(invocation.args[3], /^call /u);
  assert.match(invocation.args[3], /pi\.cmd/iu);
  assert.match(invocation.args[3], /review \^& keep/iu);
  assert.match(invocation.args[3], /\^"quoted\^"/u);
  assert.equal(invocation.windowsVerbatimArguments, true);
});

test("configured override takes precedence and warns when the path is missing", async () => {
  const override = String.raw`C:\missing\pi.cmd`;
  const pathCandidate = String.raw`C:\on-path\pi.cmd`;

  const result = await resolveWithVirtualFiles({ platform: "win32", override, env: { Path: String.raw`C:\on-path` } }, [pathCandidate]);

  assert.equal(result.spawnPlan.command, override);
  assert.equal(result.spawnPlan.confidence, "configured");
  assert.deepEqual(result.candidates.map((candidate) => candidate.source), ["override"]);
  assert.ok(result.spawnPlan.warnings.some((warning) => warning.includes("Configured Pi executable override")));
});

test("override, explicit piBin, and PI_BIN outrank packageSetting", async () => {
  const override = String.raw`C:\configured\override\pi.cmd`;
  const piBin = String.raw`C:\configured\pi-bin\pi.cmd`;
  const envPiBin = String.raw`C:\configured\env-pi-bin\pi.cmd`;
  const packageSetting = String.raw`C:\configured\package-setting\pi.cmd`;
  const existingPaths = [override, piBin, envPiBin, packageSetting];

  let result = await resolveWithVirtualFiles({
    platform: "win32",
    override,
    packageSetting,
    env: { Path: "", PI_BIN: envPiBin },
  }, existingPaths);

  assert.equal(result.spawnPlan.command, override);

  result = await resolveWithVirtualFiles({
    platform: "win32",
    piBin,
    packageSetting,
    env: { Path: "", PI_BIN: envPiBin },
  }, existingPaths);

  assert.equal(result.spawnPlan.command, piBin);

  result = await resolveWithVirtualFiles({
    platform: "win32",
    packageSetting,
    env: { Path: "", PI_BIN: envPiBin },
  }, existingPaths);

  assert.equal(result.spawnPlan.command, envPiBin);
});

test("PATH prepend is idempotent and uses the platform separator", async () => {
  const appData = String.raw`C:\Users\alice\AppData\Roaming`;
  const npmBin = String.raw`C:\Users\alice\AppData\Roaming\npm`;
  const piCmd = String.raw`C:\Users\alice\AppData\Roaming\npm\pi.cmd`;

  const result = await resolveWithVirtualFiles({
    platform: "win32",
    env: { Path: `${String.raw`C:\tools`};${npmBin};${String.raw`C:\other`}`, APPDATA: appData },
  }, [piCmd]);

  assert.equal(result.spawnPlan.envPatch.Path, `${npmBin};${String.raw`C:\tools`};${String.raw`C:\other`}`);
  assert.equal(result.spawnPlan.envPatch.Path.split(";").filter((entry) => normalizeVirtualPath(entry) === normalizeVirtualPath(npmBin)).length, 1);
});

test("resolver uses the default Node executable directory as an npm-global candidate", async () => {
  const executableName = process.platform === "win32" ? "pi.cmd" : "pi";
  const piPath = join(dirname(process.execPath), executableName);
  const result = await resolver.resolvePiExecutable({
    platform: process.platform,
    env: process.platform === "win32" ? { Path: "" } : { PATH: "" },
    processArgv: [],
    fileExists: virtualFileExists([piPath]),
  });

  assert.equal(result.spawnPlan.command, piPath);
  assert.equal(result.candidates.find((candidate) => candidate.path === piPath)?.source, "npm-global");
});

test("resolver does not treat a directory named pi as an executable", async () => {
  const dir = await mkdtemp(join(process.cwd(), ".tmp-pi-spawnkit-"));
  const executableName = process.platform === "win32" ? "pi.cmd" : "pi";
  try {
    await mkdir(join(dir, executableName));
    const result = await resolver.resolvePiExecutable({
      platform: process.platform,
      env: process.platform === "win32" ? { Path: dir } : { PATH: dir },
      processArgv: [],
      processExecPath: "",
    });

    assert.equal(result.spawnPlan.confidence, "missing");
    assert.equal(result.candidates.find((candidate) => candidate.path === join(dir, executableName))?.found, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("selection probe skips PATH stat churn after high-confidence npm-global match", async () => {
  const appData = String.raw`C:\Users\alice\AppData\Roaming`;
  const npmBin = String.raw`C:\Users\alice\AppData\Roaming\npm`;
  const piCmd = String.raw`C:\Users\alice\AppData\Roaming\npm\pi.cmd`;
  const pathEntries = Array.from({ length: 200 }, (_, index) => String.raw`C:\tools\path${index}`).join(";");
  let probeCount = 0;
  const fileExists = async (candidatePath) => {
    probeCount += 1;
    return virtualFileExists([piCmd])(candidatePath);
  };

  probeCount = 0;
  const fullResult = await resolver.resolvePiExecutable({
    platform: "win32",
    env: { Path: pathEntries, APPDATA: appData },
    processArgv: [],
    processExecPath: "",
    fileExists,
    candidateProbe: "full",
  });
  const fullProbeCount = probeCount;

  probeCount = 0;
  const selectionResult = await resolver.resolvePiExecutable({
    platform: "win32",
    env: { Path: pathEntries, APPDATA: appData },
    processArgv: [],
    processExecPath: "",
    fileExists,
    candidateProbe: "selection",
  });
  const selectionProbeCount = probeCount;

  assert.equal(fullResult.spawnPlan.command, piCmd);
  assert.equal(selectionResult.spawnPlan.command, piCmd);
  assert.equal(fullResult.spawnPlan.confidence, "high");
  assert.equal(selectionResult.spawnPlan.confidence, "high");
  assert.ok(fullProbeCount >= 600, `expected full probe to scan PATH entries, got ${fullProbeCount}`);
  assert.ok(selectionProbeCount < 10, `expected selection probe to stop early, got ${selectionProbeCount}`);
  assert.ok(selectionProbeCount < fullProbeCount / 10);
});
