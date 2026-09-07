import {
  getPathKey,
  resolvePiExecutable,
  splitPathEntries,
  type ResolvePiOptions,
} from "./resolve-pi.ts";
import {
  runSpawnSmokeTest,
  type SpawnSmokeResult,
  type SpawnSmokeSpawner,
} from "./doctor.ts";
import {
  setLastSpawnkitSessionEnvPatchDiagnostics,
  type SpawnkitSessionEnvPatchDiagnostics,
} from "./session-state.ts";

export const SESSION_ENV_PATCH_DISABLE_ENV = "PI_SPAWNKIT_DISABLE_SESSION_PATCH";
export const SESSION_ENV_PATCH_MODE_ENV = "PI_SPAWNKIT_SESSION_PATCH";
export const SESSION_ENV_PATCH_RESOLVED_ENV = "PI_SPAWNKIT_RESOLVED";

export interface ApplySpawnkitSessionEnvPatchOptions extends ResolvePiOptions {
  smokeTimeoutMs?: number;
  maxSmokeSnippetChars?: number;
  versionArgs?: readonly string[];
  comSpec?: string;
  shell?: string;
  spawn?: SpawnSmokeSpawner;
}

function normalizedFlag(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = normalizedFlag(value);
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isFalsyFlag(value: string | undefined): boolean {
  const normalized = normalizedFlag(value);
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off" || normalized === "disabled";
}

function disabledReason(env: NodeJS.ProcessEnv): string | undefined {
  if (isTruthyFlag(env[SESSION_ENV_PATCH_DISABLE_ENV])) return `disabled by ${SESSION_ENV_PATCH_DISABLE_ENV}`;
  if (isFalsyFlag(env[SESSION_ENV_PATCH_MODE_ENV])) return `disabled by ${SESSION_ENV_PATCH_MODE_ENV}`;
  return undefined;
}

function firstPathEntry(pathValue: string | undefined, platform: NodeJS.Platform): string | undefined {
  if (!pathValue) return undefined;
  return splitPathEntries(pathValue, platform)[0];
}

function reportAndStore(diagnostics: SpawnkitSessionEnvPatchDiagnostics): SpawnkitSessionEnvPatchDiagnostics {
  return setLastSpawnkitSessionEnvPatchDiagnostics(diagnostics);
}

function alreadyAppliedReport(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): SpawnkitSessionEnvPatchDiagnostics | undefined {
  if (env[SESSION_ENV_PATCH_RESOLVED_ENV] !== "1" || !env.PI_BIN) return undefined;

  const pathKey = getPathKey(env, platform);
  return {
    status: "applied",
    reason: "session-start env patch was already applied in this process.",
    command: env.PI_BIN,
    pathKey,
    pathEntry: firstPathEntry(env[pathKey], platform),
    warnings: [],
  };
}

function buildSkippedReport(reason: string, command: string | undefined, warnings: string[], smoke?: SpawnSmokeResult): SpawnkitSessionEnvPatchDiagnostics {
  return {
    status: "skipped",
    reason,
    command,
    smokeStatus: smoke?.status,
    warnings,
  };
}

function isPatchEligibleConfidence(confidence: string): boolean {
  return confidence === "high" || confidence === "configured";
}

export async function applySpawnkitSessionEnvPatch(options: ApplySpawnkitSessionEnvPatchOptions = {}): Promise<SpawnkitSessionEnvPatchDiagnostics> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const disabled = disabledReason(env);
  if (disabled) {
    return reportAndStore({
      status: "disabled",
      reason: disabled,
      warnings: [`Session-start env patch disabled by ${disabled.replace("disabled by ", "")}.`],
    });
  }

  const alreadyApplied = alreadyAppliedReport(env, platform);
  if (alreadyApplied) return reportAndStore(alreadyApplied);

  const resolution = await resolvePiExecutable({
    ...options,
    env,
    platform,
    candidateProbe: options.candidateProbe ?? "selection",
  });
  const spawnPlan = resolution.spawnPlan;

  if (!isPatchEligibleConfidence(spawnPlan.confidence)) {
    const reason = `resolver confidence ${spawnPlan.confidence} is not high/configured`;
    return reportAndStore(buildSkippedReport(
      reason,
      spawnPlan.command,
      [...spawnPlan.warnings, `Session-start env patch skipped: ${reason}.`],
    ));
  }

  const smoke = await runSpawnSmokeTest(spawnPlan, {
    env,
    timeoutMs: options.smokeTimeoutMs,
    maxSnippetChars: options.maxSmokeSnippetChars,
    versionArgs: options.versionArgs,
    platform,
    comSpec: options.comSpec,
    shell: options.shell,
    spawn: options.spawn,
  });

  if (smoke.status !== "ok") {
    const reason = `spawn smoke status ${smoke.status}`;
    return reportAndStore(buildSkippedReport(
      reason,
      spawnPlan.command,
      [...spawnPlan.warnings, `Session-start env patch skipped: ${reason}.`],
      smoke,
    ));
  }

  for (const [key, value] of Object.entries(spawnPlan.envPatch)) {
    env[key] = value;
  }
  env[SESSION_ENV_PATCH_RESOLVED_ENV] = "1";

  const pathKey = getPathKey(env, platform);
  return reportAndStore({
    status: "applied",
    reason: `${spawnPlan.confidence} resolver result passed spawn smoke.`,
    command: spawnPlan.command,
    pathKey,
    pathEntry: firstPathEntry(env[pathKey], platform),
    smokeStatus: smoke.status,
    warnings: [...spawnPlan.warnings],
  });
}
