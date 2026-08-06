import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const extension = await import("../extensions/index.ts");
const doctor = await import("../lib/doctor.ts");

test("package identity is pi-spawnkit", () => {
  assert.equal(pkg.name, "pi-spawnkit");
  assert.equal(pkg.repository.url, "https://github.com/eiei114/pi-spawnkit");
});

test("pi manifest exposes only the spawnkit extension", () => {
  assert.deepEqual(pkg.pi, { extensions: ["./extensions/index.ts"] });
  assert.equal(pkg.pi.skills, undefined);
  assert.equal(pkg.pi.prompts, undefined);
  assert.equal(pkg.pi.themes, undefined);
});

test("contributor docs keep the pi-spawnkit package identity", async () => {
  const contributing = await readFile(new URL("../CONTRIBUTING.md", import.meta.url), "utf8");

  assert.match(contributing, /`pi-spawnkit`/);
  assert.doesNotMatch(contributing, /create-pi-extension/);
  assert.doesNotMatch(contributing, /monorepo publish path/);
});

test("roadmap reflects shipped doctor skeleton, resolver, and smoke diagnostics", async () => {
  const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");

  assert.match(roadmap, /doctor walking skeleton, resolver, and smoke diagnostics shipped/i);
  assert.doesNotMatch(roadmap, /not implemented/i);
  assert.doesNotMatch(roadmap, /intentionally inert/i);
});

test("readme reflects shipped doctor skeleton, resolver, and smoke diagnostics", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /walking skeleton, `spawnkit_resolve_pi` resolver, and spawn smoke diagnostics are shipped/i);
  assert.doesNotMatch(readme, /## Planned MVP/);
});

test("doctor diagnostics include the expected object shape and warnings", async () => {
  const diagnostics = await doctor.collectSpawnkitDoctorDiagnostics({ env: { PATH: "", PI_BIN: "" }, smoke: false });

  assert.equal(diagnostics.platform, process.platform);
  assert.equal(diagnostics.pathEntryCount, 0);
  assert.deepEqual(diagnostics.pathEntries, []);
  assert.equal(diagnostics.processExecPath, process.execPath);
  assert.equal(diagnostics.piBin, undefined);
  assert.ok(Array.isArray(diagnostics.candidates));
  assert.deepEqual(Object.keys(diagnostics.spawnPlan), ["command", "argsPrefix", "envPatch", "confidence", "warnings"]);
  assert.ok(diagnostics.warnings.some((warning) => warning.includes("No Pi executable candidates")));
  assert.ok(diagnostics.warnings.some((warning) => warning.includes("PI_BIN is not set")));
});

test("doctor diagnostics detect visible candidate names on PATH", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-spawnkit-"));
  try {
    await writeFile(join(dir, "pi"), "#!/usr/bin/env node\n", { mode: 0o755 });
    const diagnostics = await doctor.collectSpawnkitDoctorDiagnostics({ env: { PATH: dir, PI_BIN: join(dir, "pi") }, smoke: false });

    assert.equal(diagnostics.pathEntryCount, 1);
    assert.equal(diagnostics.candidates.find((candidate) => candidate.path === join(dir, "pi"))?.found, true);
    assert.equal(diagnostics.piBin, join(dir, "pi"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("doctor rendering includes required human-readable diagnostics and smoke status", async () => {
  const diagnostics = await doctor.collectSpawnkitDoctorDiagnostics({ env: { PATH: "", PI_BIN: "" }, smoke: false });
  const output = doctor.renderSpawnkitDoctorDiagnostics(diagnostics);

  assert.match(output, /platform:/);
  assert.match(output, /PATH entries:/);
  assert.match(output, /process\.execPath:/);
  assert.match(output, /PI_BIN:/);
  assert.match(output, /resolver candidates:/);
  assert.match(output, /selected SpawnPlan:/);
  assert.match(output, /spawn smoke:/);
  assert.match(output, /status: disabled/);
  assert.match(output, /warnings:/);
});

test("extension registers /spawnkit:doctor and spawnkit_resolve_pi", async () => {
  let registeredCommand;
  let registeredTool;
  extension.default({
    registerCommand(name, command) {
      registeredCommand = { name, command };
    },
    registerTool(tool) {
      registeredTool = tool;
    },
  });

  assert.equal(registeredCommand.name, "spawnkit:doctor");
  assert.equal(registeredTool.name, "spawnkit_resolve_pi");

  let notification;
  await registeredCommand.command.handler("", {
    ui: {
      notify(message, level) {
        notification = { message, level };
      },
    },
  });

  assert.equal(notification.level, "info");
  assert.match(notification.message, /spawnkit doctor/);
  assert.match(notification.message, /spawn smoke:/);

  await registeredCommand.command.handler("--json", {
    ui: {
      notify(message, level) {
        notification = { message, level };
      },
    },
  });

  assert.equal(notification.level, "info");
  assert.equal(JSON.parse(notification.message).smoke.args.at(-1), "--version");

  const toolResult = await registeredTool.execute("tool-call-1", {}, undefined, undefined, {});
  assert.equal(toolResult.details.spawnPlan.argsPrefix.length, 0);
  assert.match(toolResult.content[0].text, /SpawnPlan/);
});
