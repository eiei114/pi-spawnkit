import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { collectSpawnkitDoctorDiagnostics, renderSpawnkitDoctorDiagnostics, runSpawnSmokeTest } from "../lib/doctor.ts";
import { spawnWithSpawnPlan } from "../lib/launch.ts";
import { applySpawnkitSessionEnvPatch } from "../lib/session-env.ts";
import { getLastSpawnkitSessionEnvPatchDiagnostics } from "../lib/session-state.ts";
import { buildSpawnPlanInvocation, renderSpawnPlan, spawnkit_resolve_pi } from "../lib/resolve-pi.ts";

const resolvePiToolParameters = Type.Object({
  override: Type.Optional(Type.String({ description: "Explicit Pi executable path. Takes precedence over PI_BIN." })),
  packageSetting: Type.Optional(Type.String({ description: "Package-level Pi executable setting, when one is available." })),
});

type ResolvePiToolParameters = Static<typeof resolvePiToolParameters>;

function wantsJsonOutput(args: unknown): boolean {
  if (Array.isArray(args)) return args.some((arg) => arg === "--json");
  if (typeof args === "string") return args.split(/\s+/u).includes("--json");
  return false;
}

export {
  applySpawnkitSessionEnvPatch,
  buildSpawnPlanInvocation,
  collectSpawnkitDoctorDiagnostics,
  getLastSpawnkitSessionEnvPatchDiagnostics,
  renderSpawnkitDoctorDiagnostics,
  renderSpawnPlan,
  runSpawnSmokeTest,
  spawnWithSpawnPlan,
  spawnkit_resolve_pi,
};

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    await applySpawnkitSessionEnvPatch();
  });

  pi.registerTool({
    name: "spawnkit_resolve_pi",
    label: "Resolve Pi executable",
    description: "Return a SpawnPlan for launching a child Pi process.",
    parameters: resolvePiToolParameters,
    async execute(_toolCallId, params: ResolvePiToolParameters) {
      const spawnPlan = await spawnkit_resolve_pi({
        override: params.override,
        packageSetting: params.packageSetting,
      });

      return {
        content: [{ type: "text", text: renderSpawnPlan(spawnPlan) }],
        details: { spawnPlan },
      };
    },
  });

  pi.registerCommand("spawnkit:doctor", {
    description: "Show pi-spawnkit runtime diagnostics for child Pi executable resolution.",
    handler: async (args, ctx) => {
      const diagnostics = await collectSpawnkitDoctorDiagnostics();
      const message = wantsJsonOutput(args)
        ? JSON.stringify(diagnostics, null, 2)
        : renderSpawnkitDoctorDiagnostics(diagnostics);
      ctx.ui.notify(message, "info");
    },
  });
}
