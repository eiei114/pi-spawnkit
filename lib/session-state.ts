export type SpawnkitSessionEnvPatchStatus = "not_run" | "applied" | "skipped" | "disabled";

export interface SpawnkitSessionEnvPatchDiagnostics {
  status: SpawnkitSessionEnvPatchStatus;
  reason: string;
  command?: string;
  pathKey?: string;
  pathEntry?: string;
  smokeStatus?: string;
  warnings: string[];
}

const NOT_RUN_SESSION_ENV_PATCH: SpawnkitSessionEnvPatchDiagnostics = {
  status: "not_run",
  reason: "session-start env patch has not run in this process.",
  warnings: [],
};

let lastSessionEnvPatchDiagnostics = NOT_RUN_SESSION_ENV_PATCH;

export function getLastSpawnkitSessionEnvPatchDiagnostics(): SpawnkitSessionEnvPatchDiagnostics {
  return {
    ...lastSessionEnvPatchDiagnostics,
    warnings: [...lastSessionEnvPatchDiagnostics.warnings],
  };
}

export function setLastSpawnkitSessionEnvPatchDiagnostics(diagnostics: SpawnkitSessionEnvPatchDiagnostics): SpawnkitSessionEnvPatchDiagnostics {
  lastSessionEnvPatchDiagnostics = {
    ...diagnostics,
    warnings: [...diagnostics.warnings],
  };

  return getLastSpawnkitSessionEnvPatchDiagnostics();
}

export function resetLastSpawnkitSessionEnvPatchDiagnostics(): SpawnkitSessionEnvPatchDiagnostics {
  lastSessionEnvPatchDiagnostics = NOT_RUN_SESSION_ENV_PATCH;
  return getLastSpawnkitSessionEnvPatchDiagnostics();
}
