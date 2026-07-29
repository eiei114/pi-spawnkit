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

test("roadmap reflects shipped doctor skeleton", async () => {
  const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");

  assert.match(roadmap, /doctor walking skeleton shipped/i);
  assert.doesNotMatch(roadmap, /not implemented/i);
  assert.doesNotMatch(roadmap, /intentionally inert/i);
});

test("doctor diagnostics include the expected object shape and warnings", async () => {
  const diagnostics = await doctor.collectSpawnkitDoctorDiagnostics({ PATH: "", PI_BIN: "" });

  assert.equal(diagnostics.platform, process.platform);
  assert.equal(diagnostics.pathEntryCount, 0);
  assert.deepEqual(diagnostics.pathEntries, []);
  assert.equal(diagnostics.processExecPath, process.execPath);
  assert.equal(diagnostics.piBin, undefined);
  assert.deepEqual(
    diagnostics.candidates.map((candidate) => [candidate.name, candidate.found]),
    [["pi", false], ["pi.cmd", false], ["pi.exe", false]],
  );
  assert.ok(diagnostics.warnings.some((warning) => warning.includes("No Pi executable candidates")));
  assert.ok(diagnostics.warnings.some((warning) => warning.includes("PI_BIN is not set")));
});

test("doctor diagnostics detect visible candidate names on PATH", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-spawnkit-"));
  try {
    await writeFile(join(dir, "pi"), "#!/usr/bin/env node\n", { mode: 0o755 });
    const diagnostics = await doctor.collectSpawnkitDoctorDiagnostics({ PATH: dir, PI_BIN: join(dir, "pi") });

    assert.equal(diagnostics.pathEntryCount, 1);
    assert.equal(diagnostics.candidates.find((candidate) => candidate.name === "pi")?.found, true);
    assert.equal(diagnostics.piBin, join(dir, "pi"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("doctor rendering includes required human-readable diagnostics", async () => {
  const diagnostics = await doctor.collectSpawnkitDoctorDiagnostics({ PATH: "", PI_BIN: "" });
  const output = doctor.renderSpawnkitDoctorDiagnostics(diagnostics);

  assert.match(output, /platform:/);
  assert.match(output, /PATH entries:/);
  assert.match(output, /process\.execPath:/);
  assert.match(output, /PI_BIN:/);
  assert.match(output, /candidates checked:/);
  assert.match(output, /warnings:/);
});

test("extension registers /spawnkit:doctor", async () => {
  let registered;
  extension.default({
    registerCommand(name, command) {
      registered = { name, command };
    },
  });

  assert.equal(registered.name, "spawnkit:doctor");
  let notification;
  await registered.command.handler("", {
    ui: {
      notify(message, level) {
        notification = { message, level };
      },
    },
  });

  assert.equal(notification.level, "info");
  assert.match(notification.message, /spawnkit doctor/);
});
