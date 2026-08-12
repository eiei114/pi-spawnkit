import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { buildSpawnPlanInvocation, type SpawnPlan } from "./resolve-pi.ts";

export interface SpawnPlanLaunchOptions extends SpawnOptions {
  platform?: NodeJS.Platform;
  comSpec?: string;
  shell?: string;
}

export function spawnWithSpawnPlan(
  spawnPlan: SpawnPlan,
  args: readonly string[],
  options: SpawnPlanLaunchOptions = {},
): ChildProcess {
  const {
    platform,
    comSpec,
    shell,
    ...spawnOptions
  } = options;
  const env = spawnOptions.env ?? process.env;
  const invocation = buildSpawnPlanInvocation(spawnPlan, args, {
    platform,
    env,
    comSpec,
    shell,
  });

  return nodeSpawn(invocation.command, invocation.args, {
    ...spawnOptions,
    ...(invocation.windowsVerbatimArguments === undefined
      ? {}
      : { windowsVerbatimArguments: invocation.windowsVerbatimArguments }),
  });
}
