import {
  getPathValue,
  renderSpawnPlan,
  resolvePiExecutable,
  splitPathEntries,
  type PiResolverCandidate,
  type SpawnPlan,
} from "./resolve-pi.ts";

export interface SpawnkitDoctorDiagnostics {
  platform: NodeJS.Platform;
  pathEntryCount: number;
  pathEntries: string[];
  processExecPath: string;
  piBin?: string;
  candidates: PiResolverCandidate[];
  spawnPlan: SpawnPlan;
  warnings: string[];
}

export async function collectSpawnkitDoctorDiagnostics(env: NodeJS.ProcessEnv = process.env): Promise<SpawnkitDoctorDiagnostics> {
  const pathEntries = splitPathEntries(getPathValue(env, process.platform), process.platform);
  const piBin = env.PI_BIN || undefined;
  const resolution = await resolvePiExecutable({ env });

  return {
    platform: process.platform,
    pathEntryCount: pathEntries.length,
    pathEntries,
    processExecPath: process.execPath,
    piBin,
    candidates: resolution.candidates,
    spawnPlan: resolution.spawnPlan,
    warnings: resolution.spawnPlan.warnings,
  };
}

export function renderSpawnkitDoctorDiagnostics(diagnostics: SpawnkitDoctorDiagnostics): string {
  const candidateLines = diagnostics.candidates.length > 0
    ? diagnostics.candidates.map((candidate) => {
        const status = candidate.found ? "found" : "not found";
        return `  - [${candidate.source}] ${candidate.path}: ${status}`;
      })
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
  ].join("\n");
}
