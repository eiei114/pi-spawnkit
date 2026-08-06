import { access, constants, stat } from "node:fs/promises";
import * as posixPath from "node:path/posix";
import * as winPath from "node:path/win32";

export const WINDOWS_PI_EXECUTABLE_CANDIDATES = ["pi.cmd", "pi.exe", "pi"] as const;
export const POSIX_PI_EXECUTABLE_CANDIDATES = ["pi"] as const;
/** @deprecated Use `getPlatformExecutableCandidates(platform)` instead. */
export const PI_EXECUTABLE_CANDIDATES = WINDOWS_PI_EXECUTABLE_CANDIDATES;

export type PiExecutableCandidateName = (typeof WINDOWS_PI_EXECUTABLE_CANDIDATES)[number];
export type SpawnPlanConfidence = "configured" | "high" | "medium" | "missing";
export type PiResolverCandidateSource = "override" | "process" | "npm-global" | "path";

export interface SpawnPlan {
  command: string;
  argsPrefix: string[];
  envPatch: Record<string, string>;
  confidence: SpawnPlanConfidence;
  warnings: string[];
}

export interface PiResolverCandidate {
  source: PiResolverCandidateSource;
  label: string;
  path: string;
  executableName: string;
  found: boolean;
}

export interface PiResolveResult {
  spawnPlan: SpawnPlan;
  candidates: PiResolverCandidate[];
}

export interface ResolvePiOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  override?: string;
  piBin?: string;
  packageSetting?: string;
  npmGlobalBin?: string | readonly string[];
  processArgv?: readonly string[];
  processExecPath?: string;
  fileExists?: (candidatePath: string) => boolean | Promise<boolean>;
  stopAtFirstMatch?: boolean;
}

function isWindowsPlatform(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

export function getPlatformPathDelimiter(platform: NodeJS.Platform): string {
  return isWindowsPlatform(platform) ? ";" : ":";
}

export function getPlatformExecutableCandidates(platform: NodeJS.Platform): readonly PiExecutableCandidateName[] {
  return isWindowsPlatform(platform) ? WINDOWS_PI_EXECUTABLE_CANDIDATES : POSIX_PI_EXECUTABLE_CANDIDATES;
}

export function getPathKey(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (!isWindowsPlatform(platform)) return "PATH";

  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
}

export function getPathValue(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  return env[getPathKey(env, platform)] ?? "";
}

export function splitPathEntries(pathValue: string, platform: NodeJS.Platform): string[] {
  return pathValue.split(getPlatformPathDelimiter(platform)).filter((entry) => entry.length > 0);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
}

function isPosixLikePath(value: string): boolean {
  return value.startsWith("/") || (value.includes("/") && !value.includes("\\"));
}

function basenameForPath(value: string, platform: NodeJS.Platform): string {
  if (isWindowsPlatform(platform) && !isPosixLikePath(value)) return winPath.basename(value);
  return posixPath.basename(value);
}

function dirnameForPath(value: string, platform: NodeJS.Platform): string {
  if (isWindowsPlatform(platform) && !isPosixLikePath(value)) return winPath.dirname(value);
  return posixPath.dirname(value);
}

function joinForPathEntry(entry: string, executableName: string, platform: NodeJS.Platform): string {
  if (isWindowsPlatform(platform) && !isPosixLikePath(entry)) return winPath.join(entry, executableName);
  return posixPath.join(entry, executableName);
}

function isAbsolutePath(value: string, platform: NodeJS.Platform): boolean {
  if (isWindowsPlatform(platform)) return winPath.isAbsolute(value) || posixPath.isAbsolute(value);
  return posixPath.isAbsolute(value);
}

function isPathLike(value: string, platform: NodeJS.Platform): boolean {
  return isAbsolutePath(value, platform) || value.includes("/") || value.includes("\\");
}

function looksLikePiExecutable(value: string, platform: NodeJS.Platform): boolean {
  const basename = basenameForPath(value, platform).toLowerCase();
  return basename === "pi" || basename === "pi.cmd" || basename === "pi.exe";
}

function normalizePathForCompare(value: string, platform: NodeJS.Platform): string {
  const withoutTrailingSeparators = value.replace(/[\\/]+$/u, "");
  const slashNormalized = withoutTrailingSeparators.replace(/\\/gu, "/");
  return isWindowsPlatform(platform) ? slashNormalized.toLowerCase() : slashNormalized;
}

function pathEquals(left: string, right: string, platform: NodeJS.Platform): boolean {
  return normalizePathForCompare(left, platform) === normalizePathForCompare(right, platform);
}

function prependPathEntry(pathValue: string, entry: string, platform: NodeJS.Platform): string {
  const delimiter = getPlatformPathDelimiter(platform);
  const entries = splitPathEntries(pathValue, platform);
  const withoutExistingEntry = entries.filter((existing) => !pathEquals(existing, entry, platform));
  return [entry, ...withoutExistingEntry].join(delimiter);
}

function getExecutableDirectory(command: string, platform: NodeJS.Platform): string | undefined {
  if (!isPathLike(command, platform)) return undefined;

  const directory = dirnameForPath(command, platform);
  if (!directory || directory === ".") return undefined;

  return directory;
}

function buildEnvPatch(command: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Record<string, string> {
  const envPatch: Record<string, string> = {
    PI_BIN: command,
  };
  const commandDirectory = getExecutableDirectory(command, platform);

  if (commandDirectory) {
    const pathKey = getPathKey(env, platform);
    envPatch[pathKey] = prependPathEntry(getPathValue(env, platform), commandDirectory, platform);
  }

  return envPatch;
}

async function defaultFileExists(candidatePath: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    const file = await stat(candidatePath);
    if (!file.isFile()) return false;
    await access(candidatePath, isWindowsPlatform(platform) ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function collectProcessHintCandidates(options: Required<Pick<ResolvePiOptions, "processArgv" | "processExecPath">>, platform: NodeJS.Platform): string[] {
  const hints = [options.processArgv[1], options.processExecPath]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .filter((value) => looksLikePiExecutable(value, platform));

  return [...new Set(hints)];
}

function npmGlobalBinFromPrefix(prefix: string, platform: NodeJS.Platform): string {
  return isWindowsPlatform(platform) ? prefix : posixPath.join(prefix, "bin");
}

function collectNpmGlobalBinCandidates(options: ResolvePiOptions, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const optionBins = typeof options.npmGlobalBin === "string" ? [options.npmGlobalBin] : [...(options.npmGlobalBin ?? [])];
  const prefix = firstNonEmpty(env.npm_config_prefix, env.PREFIX);
  const prefixBins = prefix ? [npmGlobalBinFromPrefix(prefix, platform)] : [];
  const windowsAppDataBins = isWindowsPlatform(platform)
    ? [env.APPDATA ? winPath.join(env.APPDATA, "npm") : undefined]
    : [];
  const processExecDir = options.processExecPath && isPathLike(options.processExecPath, platform)
    ? [dirnameForPath(options.processExecPath, platform)]
    : [];

  const candidates = [
    ...optionBins,
    ...prefixBins,
    ...windowsAppDataBins,
    ...processExecDir,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const uniqueCandidates: string[] = [];
  for (const candidate of candidates) {
    if (!uniqueCandidates.some((existing) => pathEquals(existing, candidate, platform))) {
      uniqueCandidates.push(candidate);
    }
  }

  return uniqueCandidates;
}

function fallbackCommand(platform: NodeJS.Platform): string {
  return isWindowsPlatform(platform) ? "pi.cmd" : "pi";
}

function createSpawnPlan(command: string, confidence: SpawnPlanConfidence, warnings: string[], env: NodeJS.ProcessEnv, platform: NodeJS.Platform): SpawnPlan {
  return {
    command,
    argsPrefix: [],
    envPatch: buildEnvPatch(command, env, platform),
    confidence,
    warnings,
  };
}

export async function resolvePiExecutable(options: ResolvePiOptions = {}): Promise<PiResolveResult> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const processHints = {
    processArgv: options.processArgv ?? process.argv,
    processExecPath: options.processExecPath ?? process.execPath,
  };
  const fileExists = options.fileExists ?? ((candidatePath: string) => defaultFileExists(candidatePath, platform));
  const candidates: PiResolverCandidate[] = [];
  const seenCandidatePaths = new Set<string>();

  const addCandidate = async (source: PiResolverCandidateSource, label: string, candidatePath: string): Promise<PiResolverCandidate | undefined> => {
    const normalizedPath = normalizePathForCompare(candidatePath, platform);
    if (seenCandidatePaths.has(normalizedPath)) return undefined;
    seenCandidatePaths.add(normalizedPath);

    const found = await fileExists(candidatePath);
    const candidate: PiResolverCandidate = {
      source,
      label,
      path: candidatePath,
      executableName: basenameForPath(candidatePath, platform),
      found,
    };
    candidates.push(candidate);
    return candidate;
  };

  const configuredOverride = firstNonEmpty(options.override, options.piBin, env.PI_BIN, options.packageSetting);
  if (configuredOverride) {
    const overrideCandidate = await addCandidate("override", "configured override", configuredOverride);
    const warnings = overrideCandidate && !overrideCandidate.found && isPathLike(configuredOverride, platform)
      ? [`Configured Pi executable override does not exist or is not executable: ${configuredOverride}`]
      : [];

    return {
      spawnPlan: createSpawnPlan(configuredOverride, "configured", warnings, env, platform),
      candidates,
    };
  }

  const executableNames = getPlatformExecutableCandidates(platform);
  let selectedCandidate: PiResolverCandidate | undefined;
  let selectedConfidence: Exclude<SpawnPlanConfidence, "configured" | "missing"> | undefined;

  const shouldStopSearching = () => options.stopAtFirstMatch === true && selectedCandidate !== undefined;

  for (const hint of collectProcessHintCandidates(processHints, platform)) {
    if (shouldStopSearching()) break;
    const candidate = await addCandidate("process", "current process hint", hint);
    if (!selectedCandidate && candidate?.found) {
      selectedCandidate = candidate;
      selectedConfidence = "high";
    }
  }

  for (const npmGlobalBin of collectNpmGlobalBinCandidates(processHints, env, platform)) {
    if (shouldStopSearching()) break;
    for (const executableName of executableNames) {
      if (shouldStopSearching()) break;
      const candidate = await addCandidate("npm-global", "npm global bin candidate", joinForPathEntry(npmGlobalBin, executableName, platform));
      if (!selectedCandidate && candidate?.found) {
        selectedCandidate = candidate;
        selectedConfidence = "high";
      }
    }
  }

  for (const pathEntry of splitPathEntries(getPathValue(env, platform), platform)) {
    if (shouldStopSearching()) break;
    for (const executableName of executableNames) {
      if (shouldStopSearching()) break;
      const candidate = await addCandidate("path", "PATH lookup", joinForPathEntry(pathEntry, executableName, platform));
      if (!selectedCandidate && candidate?.found) {
        selectedCandidate = candidate;
        selectedConfidence = "medium";
      }
    }
  }

  if (selectedCandidate && selectedConfidence) {
    return {
      spawnPlan: createSpawnPlan(selectedCandidate.path, selectedConfidence, [], env, platform),
      candidates,
    };
  }

  const warnings = [`No Pi executable candidates were found for ${platform}.`];
  if (!firstNonEmpty(env.PI_BIN)) warnings.push("PI_BIN is not set.");

  return {
    spawnPlan: createSpawnPlan(fallbackCommand(platform), "missing", warnings, env, platform),
    candidates,
  };
}

export async function spawnkit_resolve_pi(options: ResolvePiOptions = {}): Promise<SpawnPlan> {
  const result = await resolvePiExecutable({ ...options, stopAtFirstMatch: true });
  return result.spawnPlan;
}

export function renderSpawnPlan(spawnPlan: SpawnPlan): string {
  const envPatchEntries = Object.entries(spawnPlan.envPatch);
  const envPatchLines = envPatchEntries.length > 0
    ? envPatchEntries.map(([key, value]) => `  ${key}: ${value}`)
    : ["  <empty>"];
  const warningLines = spawnPlan.warnings.length > 0
    ? spawnPlan.warnings.map((warning) => `  - ${warning}`)
    : ["  - none"];

  return [
    "SpawnPlan",
    `command: ${spawnPlan.command}`,
    `argsPrefix: ${JSON.stringify(spawnPlan.argsPrefix)}`,
    `confidence: ${spawnPlan.confidence}`,
    "envPatch:",
    ...envPatchLines,
    "warnings:",
    ...warningLines,
  ].join("\n");
}
