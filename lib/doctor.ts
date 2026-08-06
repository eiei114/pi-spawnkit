import { spawn as nodeSpawn } from "node:child_process";
import type { Readable } from "node:stream";
import {
  getPathValue,
  getPlatformPathDelimiter,
  renderSpawnPlan,
  resolvePiExecutable,
  type PiResolverCandidate,
  type SpawnPlan,
} from "./resolve-pi.ts";

export const DEFAULT_SPAWN_SMOKE_TIMEOUT_MS = 3_000;
export const DEFAULT_SPAWN_SMOKE_MAX_SNIPPET_CHARS = 2_048;

export type SpawnSmokeStatus = "not_found" | "found_but_not_runnable" | "timeout" | "nonzero_exit" | "ok";

export interface SpawnSmokeSpawnOptions {
  env: NodeJS.ProcessEnv;
  windowsHide: boolean;
  stdio: ["ignore", "pipe", "pipe"];
}

export interface SpawnSmokeChild {
  stdout?: Pick<Readable, "on"> | null;
  stderr?: Pick<Readable, "on"> | null;
  on(event: "error", listener: (error: NodeJS.ErrnoException) => void): this;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill?(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnSmokeSpawner = (command: string, args: string[], options: SpawnSmokeSpawnOptions) => SpawnSmokeChild;

export interface SpawnSmokeOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxSnippetChars?: number;
  versionArgs?: readonly string[];
  spawn?: SpawnSmokeSpawner;
}

export interface SpawnSmokeResult {
  status: SpawnSmokeStatus;
  command: string;
  args: string[];
  timeoutMs: number;
  timedOut: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  errorCode?: string;
  errorMessage?: string;
  stdoutSnippet: string;
  stderrSnippet: string;
  versionText?: string;
}

export interface SpawnkitDoctorDiagnostics {
  platform: NodeJS.Platform;
  pathEntryCount: number;
  pathEntries: string[];
  processExecPath: string;
  piBin?: string;
  candidates: PiResolverCandidate[];
  spawnPlan: SpawnPlan;
  smoke?: SpawnSmokeResult;
  warnings: string[];
}

export interface SpawnkitDoctorOptions {
  env?: NodeJS.ProcessEnv;
  smoke?: boolean;
  smokeTimeoutMs?: number;
  maxSmokeSnippetChars?: number;
  spawn?: SpawnSmokeSpawner;
}

function defaultSpawn(command: string, args: string[], options: SpawnSmokeSpawnOptions): SpawnSmokeChild {
  return nodeSpawn(command, args, options) as SpawnSmokeChild;
}

function createSnippetCollector(maxChars: number) {
  let snippet = "";

  return {
    append(data: unknown) {
      if (snippet.length >= maxChars) return;

      const chunk = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      snippet += chunk.slice(0, maxChars - snippet.length);
    },
    value() {
      return snippet;
    },
  };
}

function firstDisplayLine(value: string): string | undefined {
  for (const line of value.split(/\r?\n/u)) {
    const normalized = line.trim().replace(/\s+/gu, " ");
    if (normalized.length > 0) return normalized.slice(0, 200);
  }

  return undefined;
}

function extractVersionText(stdoutSnippet: string, stderrSnippet: string): string | undefined {
  return firstDisplayLine(stdoutSnippet) ?? firstDisplayLine(stderrSnippet);
}

function errorCode(error: unknown): string | undefined {
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode : undefined;
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function statusForSpawnError(code: string | undefined): Exclude<SpawnSmokeStatus, "timeout" | "nonzero_exit" | "ok"> {
  return code === "ENOENT" ? "not_found" : "found_but_not_runnable";
}

export async function runSpawnSmokeTest(spawnPlan: SpawnPlan, options: SpawnSmokeOptions = {}): Promise<SpawnSmokeResult> {
  const args = [...spawnPlan.argsPrefix, ...(options.versionArgs ?? ["--version"])] as string[];
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_SPAWN_SMOKE_TIMEOUT_MS);
  const maxSnippetChars = Math.max(0, options.maxSnippetChars ?? DEFAULT_SPAWN_SMOKE_MAX_SNIPPET_CHARS);
  const stdout = createSnippetCollector(maxSnippetChars);
  const stderr = createSnippetCollector(maxSnippetChars);
  const spawn = options.spawn ?? defaultSpawn;
  const env: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    ...spawnPlan.envPatch,
  };

  return await new Promise<SpawnSmokeResult>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (status: SpawnSmokeStatus, patch: Partial<Omit<SpawnSmokeResult, "status" | "command" | "args" | "timeoutMs" | "stdoutSnippet" | "stderrSnippet">> = {}) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);

      const stdoutSnippet = stdout.value();
      const stderrSnippet = stderr.value();
      const versionText = extractVersionText(stdoutSnippet, stderrSnippet);
      const result: SpawnSmokeResult = {
        status,
        command: spawnPlan.command,
        args,
        timeoutMs,
        timedOut: false,
        exitCode: null,
        signal: null,
        stdoutSnippet,
        stderrSnippet,
        ...patch,
      };

      if (versionText) result.versionText = versionText;
      resolve(result);
    };

    let child: SpawnSmokeChild;
    try {
      child = spawn(spawnPlan.command, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const code = errorCode(error);
      finish(statusForSpawnError(code), { errorCode: code, errorMessage: errorMessage(error) });
      return;
    }

    child.stdout?.on("data", (chunk: unknown) => stdout.append(chunk));
    child.stderr?.on("data", (chunk: unknown) => stderr.append(chunk));

    timer = setTimeout(() => {
      try {
        child.kill?.("SIGTERM");
      } catch {
        // The smoke result should still resolve as a timeout even if the kill attempt fails.
      }
      finish("timeout", { timedOut: true });
    }, timeoutMs);

    child.on("error", (error) => {
      const code = errorCode(error);
      finish(statusForSpawnError(code), { errorCode: code, errorMessage: errorMessage(error) });
    });

    child.on("close", (code, signal) => {
      if (code === 0 && signal === null) {
        finish("ok", { exitCode: code, signal });
        return;
      }

      finish("nonzero_exit", { exitCode: code, signal });
    });
  });
}

function isDoctorOptions(value: NodeJS.ProcessEnv | SpawnkitDoctorOptions): value is SpawnkitDoctorOptions {
  const maybeOptions = value as SpawnkitDoctorOptions;
  return typeof maybeOptions.spawn === "function"
    || typeof maybeOptions.smoke === "boolean"
    || typeof maybeOptions.smokeTimeoutMs === "number"
    || typeof maybeOptions.maxSmokeSnippetChars === "number"
    || (typeof maybeOptions.env === "object" && maybeOptions.env !== null);
}

function normalizeDoctorOptions(envOrOptions?: NodeJS.ProcessEnv | SpawnkitDoctorOptions): Required<Pick<SpawnkitDoctorOptions, "env" | "smoke">> & Omit<SpawnkitDoctorOptions, "env" | "smoke"> {
  if (!envOrOptions) return { env: process.env, smoke: true };
  if (isDoctorOptions(envOrOptions)) {
    return {
      ...envOrOptions,
      env: envOrOptions.env ?? process.env,
      smoke: envOrOptions.smoke ?? true,
    };
  }

  return { env: envOrOptions, smoke: true };
}

export async function collectSpawnkitDoctorDiagnostics(env?: NodeJS.ProcessEnv): Promise<SpawnkitDoctorDiagnostics>;
export async function collectSpawnkitDoctorDiagnostics(options?: SpawnkitDoctorOptions): Promise<SpawnkitDoctorDiagnostics>;
export async function collectSpawnkitDoctorDiagnostics(envOrOptions?: NodeJS.ProcessEnv | SpawnkitDoctorOptions): Promise<SpawnkitDoctorDiagnostics> {
  const options = normalizeDoctorOptions(envOrOptions);
  const env = options.env;
  const pathValue = getPathValue(env, process.platform);
  const pathEntries = pathValue.split(getPlatformPathDelimiter(process.platform)).filter((entry) => entry.length > 0);
  const piBin = env.PI_BIN || undefined;
  const resolution = await resolvePiExecutable({ env });
  const smoke = options.smoke
    ? await runSpawnSmokeTest(resolution.spawnPlan, {
        env,
        timeoutMs: options.smokeTimeoutMs,
        maxSnippetChars: options.maxSmokeSnippetChars,
        spawn: options.spawn,
      })
    : undefined;

  return {
    platform: process.platform,
    pathEntryCount: pathEntries.length,
    pathEntries,
    processExecPath: process.execPath,
    piBin,
    candidates: resolution.candidates,
    spawnPlan: resolution.spawnPlan,
    smoke,
    warnings: resolution.spawnPlan.warnings,
  };
}

function formatSnippet(value: string): string {
  if (value.length === 0) return "<empty>";
  return value.replace(/\r/gu, "\\r").replace(/\n/gu, "\\n");
}

function renderSmokeDiagnostics(smoke: SpawnSmokeResult | undefined): string[] {
  if (!smoke) {
    return [
      "spawn smoke:",
      "  status: disabled",
    ];
  }

  const error = smoke.errorCode
    ? `${smoke.errorCode}${smoke.errorMessage ? `: ${smoke.errorMessage}` : ""}`
    : "<none>";

  return [
    "spawn smoke:",
    `  status: ${smoke.status}`,
    `  command: ${smoke.command}`,
    `  args: ${JSON.stringify(smoke.args)}`,
    `  timeoutMs: ${smoke.timeoutMs}`,
    `  timedOut: ${smoke.timedOut}`,
    `  exitCode: ${smoke.exitCode ?? "<none>"}`,
    `  signal: ${smoke.signal ?? "<none>"}`,
    `  version: ${smoke.versionText ?? "<unavailable>"}`,
    `  stdout snippet: ${formatSnippet(smoke.stdoutSnippet)}`,
    `  stderr snippet: ${formatSnippet(smoke.stderrSnippet)}`,
    `  error: ${error}`,
  ];
}

export function renderSpawnkitDoctorDiagnostics(diagnostics: SpawnkitDoctorDiagnostics): string {
  const candidateLines = diagnostics.candidates.length > 0
    ? diagnostics.candidates.map((candidate) => {
        const status = candidate.found ? "found" : "not found";
        return `  - [${candidate.source}] ${candidate.path}: ${status}`;
      })
    : ["  - none"];

  const warningLines = diagnostics.warnings.length > 0
    ? diagnostics.warnings.map((warning) => `  - ${warning}`)
    : ["  - none"];

  return [
    "spawnkit doctor",
    `platform: ${diagnostics.platform}`,
    `PATH entries: ${diagnostics.pathEntryCount}`,
    `process.execPath: ${diagnostics.processExecPath}`,
    `PI_BIN: ${diagnostics.piBin ?? "<unset>"}`,
    "resolver candidates:",
    ...candidateLines,
    "selected SpawnPlan:",
    ...renderSpawnPlan(diagnostics.spawnPlan).split("\n").map((line) => `  ${line}`),
    ...renderSmokeDiagnostics(diagnostics.smoke),
    "warnings:",
    ...warningLines,
  ].join("\n");
}
