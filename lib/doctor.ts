import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

export const PI_EXECUTABLE_CANDIDATES = ["pi", "pi.cmd", "pi.exe"] as const;

export type PiExecutableCandidate = (typeof PI_EXECUTABLE_CANDIDATES)[number];

export interface CandidateLookup {
  name: PiExecutableCandidate;
  found: boolean;
  path?: string;
}

export interface SpawnkitDoctorDiagnostics {
  platform: NodeJS.Platform;
  pathEntryCount: number;
  pathEntries: string[];
  processExecPath: string;
  piBin?: string;
  candidates: CandidateLookup[];
  warnings: string[];
}

async function isExecutableVisible(command: string, pathEntries: string[]): Promise<string | undefined> {
  const searchPaths = isAbsolute(command) ? [""] : pathEntries;

  for (const entry of searchPaths) {
    const candidatePath = entry ? join(entry, command) : command;
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      // Keep looking. Missing candidates are reported as warnings by the caller.
    }
  }

  return undefined;
}

export async function collectSpawnkitDoctorDiagnostics(env: NodeJS.ProcessEnv = process.env): Promise<SpawnkitDoctorDiagnostics> {
  const pathValue = env.PATH ?? env.Path ?? "";
  const piBin = env.PI_BIN || undefined;
  const pathEntries = pathValue.split(delimiter).filter((entry) => entry.length > 0);
  const candidates: CandidateLookup[] = [];

  for (const name of PI_EXECUTABLE_CANDIDATES) {
    const foundPath = await isExecutableVisible(name, pathEntries);
    candidates.push(foundPath ? { name, found: true, path: foundPath } : { name, found: false });
  }

  const warnings: string[] = [];
  const foundAnyCandidate = candidates.some((candidate) => candidate.found);

  if (!foundAnyCandidate) {
    warnings.push(`No Pi executable candidates were found on PATH (${PI_EXECUTABLE_CANDIDATES.join(", ")}).`);
  }

  if (!piBin) {
    warnings.push("PI_BIN is not set.");
  }

  return {
    platform: process.platform,
    pathEntryCount: pathEntries.length,
    pathEntries,
    processExecPath: process.execPath,
    piBin,
    candidates,
    warnings,
  };
}

export function renderSpawnkitDoctorDiagnostics(diagnostics: SpawnkitDoctorDiagnostics): string {
  const candidateLines = diagnostics.candidates.map((candidate) => {
    const status = candidate.found ? `found at ${candidate.path}` : "not found";
    return `  - ${candidate.name}: ${status}`;
  });

  const warningLines = diagnostics.warnings.length > 0
    ? diagnostics.warnings.map((warning) => `  - ${warning}`)
    : ["  - none"];

  return [
    "spawnkit doctor",
    `platform: ${diagnostics.platform}`,
    `PATH entries: ${diagnostics.pathEntryCount}`,
    `process.execPath: ${diagnostics.processExecPath}`,
    `PI_BIN: ${diagnostics.piBin ?? "<unset>"}`,
    "candidates checked:",
    ...candidateLines,
    "warnings:",
    ...warningLines,
  ].join("\n");
}
