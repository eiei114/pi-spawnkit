import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { collectSpawnkitDoctorDiagnostics, renderSpawnkitDoctorDiagnostics } from "../lib/doctor.ts";
import { renderSpawnPlan, spawnkit_resolve_pi } from "../lib/resolve-pi.ts";

const resolvePiToolParameters = Type.Object({
  override: Type.Optional(Type.String({ description: "Explicit Pi executable path. Takes precedence over PI_BIN." })),
  packageSetting: Type.Optional(Type.String({ description: "Package-level Pi executable setting, when one is available." })),
});

type ResolvePiToolParameters = Static<typeof resolvePiToolParameters>;

export {
  collectSpawnkitDoctorDiagnostics,
  renderSpawnkitDoctorDiagnostics,
  renderSpawnPlan,
  spawnkit_resolve_pi,
};

export default function (pi: ExtensionAPI) {
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
    handler: async (_args, ctx) => {
      const diagnostics = await collectSpawnkitDoctorDiagnostics();
      ctx.ui.notify(renderSpawnkitDoctorDiagnostics(diagnostics), "info");
    },
  });
}
