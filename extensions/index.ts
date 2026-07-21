import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { collectSpawnkitDoctorDiagnostics, renderSpawnkitDoctorDiagnostics } from "../lib/doctor.ts";

export { collectSpawnkitDoctorDiagnostics, renderSpawnkitDoctorDiagnostics };

export default function (pi: ExtensionAPI) {
  pi.registerCommand("spawnkit:doctor", {
    description: "Show pi-spawnkit runtime diagnostics for child Pi executable resolution.",
    handler: async (_args, ctx) => {
      const diagnostics = await collectSpawnkitDoctorDiagnostics();
      ctx.ui.notify(renderSpawnkitDoctorDiagnostics(diagnostics), "info");
    },
  });
}
