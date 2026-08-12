import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

const sessionEnv = await import("../lib/session-env.ts");
const sessionState = await import("../lib/session-state.ts");
const doctor = await import("../lib/doctor.ts");

function normalizeVirtualPath(candidatePath) {
  return candidatePath.replace(/\\/gu, "/").replace(/\/+$/u, "").toLowerCase();
}

function virtualFileExists(paths) {
  const existing = new Set(paths.map(normalizeVirtualPath));
  return (candidatePath) => existing.has(normalizeVirtualPath(candidatePath));
}

class MockChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
}

function createMockSpawn(script) {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new MockChild();
    calls.push({ command, args, options, child });
    script(child, { command, args, options });
    return child;
  };

  return { calls, spawn };
}

test.beforeEach(() => {
  sessionState.resetLastSpawnkitSessionEnvPatchDiagnostics();
});

test("session env patch applies after high-confidence resolution and successful smoke", async () => {
  const piPath = "/opt/node/bin/pi";
  const env = { PATH: "/usr/bin", npm_config_prefix: "/opt/node" };
  const mock = createMockSpawn((child) => {
    setImmediate(() => child.emit("close", 0, null));
  });

  const result = await sessionEnv.applySpawnkitSessionEnvPatch({
    platform: "linux",
    env,
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists([piPath]),
    spawn: mock.spawn,
    smokeTimeoutMs: 100,
  });

  assert.equal(result.status, "applied");
  assert.equal(result.command, piPath);
  assert.equal(result.smokeStatus, "ok");
  assert.equal(env.PATH, "/opt/node/bin:/usr/bin");
  assert.equal(env.PI_BIN, piPath);
  assert.equal(env.PI_SPAWNKIT_RESOLVED, "1");
  assert.equal(mock.calls.length, 1);

  const repeated = await sessionEnv.applySpawnkitSessionEnvPatch({
    platform: "linux",
    env,
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists([piPath]),
    spawn: mock.spawn,
    smokeTimeoutMs: 100,
  });

  assert.equal(repeated.status, "applied");
  assert.equal(env.PATH, "/opt/node/bin:/usr/bin");
  assert.equal(env.PATH.split(":").filter((entry) => entry === "/opt/node/bin").length, 1);
  assert.equal(mock.calls.length, 1);
});

test("Windows session env patch smoke-tests the npm cmd shim through ComSpec", async () => {
  const appData = String.raw`C:\Users\alice\AppData\Roaming`;
  const npmBin = String.raw`C:\Users\alice\AppData\Roaming\npm`;
  const piCmd = String.raw`C:\Users\alice\AppData\Roaming\npm\pi.cmd`;
  const env = { Path: "", APPDATA: appData, ComSpec: String.raw`C:\Windows\System32\cmd.exe` };
  const mock = createMockSpawn((child, call) => {
    setImmediate(() => child.emit("close", 0, null));
    assert.equal(call.command, env.ComSpec);
    assert.deepEqual(call.args.slice(0, 3), ["/d", "/s", "/c"]);
  });

  const result = await sessionEnv.applySpawnkitSessionEnvPatch({
    platform: "win32",
    env,
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists([piCmd]),
    spawn: mock.spawn,
    smokeTimeoutMs: 100,
  });

  assert.equal(result.status, "applied");
  assert.equal(result.command, piCmd);
  assert.equal(env.PI_BIN, piCmd);
  assert.equal(env.Path, npmBin);
});

test("session env patch treats an explicit configured Pi path as eligible after smoke", async () => {
  const piPath = "/opt/pi/bin/pi";
  const env = { PATH: "/usr/bin", PI_BIN: piPath };
  const mock = createMockSpawn((child) => {
    setImmediate(() => child.emit("close", 0, null));
  });

  const result = await sessionEnv.applySpawnkitSessionEnvPatch({
    platform: "linux",
    env,
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists([piPath]),
    spawn: mock.spawn,
    smokeTimeoutMs: 100,
  });

  assert.equal(result.status, "applied");
  assert.match(result.reason, /configured/);
  assert.equal(env.PATH, "/opt/pi/bin:/usr/bin");
  assert.equal(env.PI_BIN, piPath);
  assert.equal(env.PI_SPAWNKIT_RESOLVED, "1");
});

test("session env patch skips medium-confidence PATH-only resolution without mutating env", async () => {
  const piPath = "/custom/bin/pi";
  const env = { PATH: "/custom/bin" };
  const original = { ...env };
  const mock = createMockSpawn(() => {
    throw new Error("smoke should not run for medium-confidence resolution");
  });

  const result = await sessionEnv.applySpawnkitSessionEnvPatch({
    platform: "linux",
    env,
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists([piPath]),
    spawn: mock.spawn,
  });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /confidence medium/);
  assert.deepEqual(env, original);
  assert.equal(mock.calls.length, 0);
});

test("session env patch skips failed smoke without mutating env", async () => {
  const piPath = "/opt/node/bin/pi";
  const env = { PATH: "/usr/bin", npm_config_prefix: "/opt/node" };
  const original = { ...env };
  const mock = createMockSpawn((child) => {
    setImmediate(() => child.emit("close", 2, null));
  });

  const result = await sessionEnv.applySpawnkitSessionEnvPatch({
    platform: "linux",
    env,
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists([piPath]),
    spawn: mock.spawn,
    smokeTimeoutMs: 100,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.smokeStatus, "nonzero_exit");
  assert.deepEqual(env, original);
});

test("session env patch honors opt-out flag and doctor renders disabled status", async () => {
  const env = { PATH: "/usr/bin", npm_config_prefix: "/opt/node", PI_SPAWNKIT_SESSION_PATCH: "0" };
  const original = { ...env };
  const mock = createMockSpawn(() => {
    throw new Error("smoke should not run when disabled");
  });

  const result = await sessionEnv.applySpawnkitSessionEnvPatch({
    platform: "linux",
    env,
    processArgv: [],
    processExecPath: "",
    fileExists: virtualFileExists(["/opt/node/bin/pi"]),
    spawn: mock.spawn,
  });

  assert.equal(result.status, "disabled");
  assert.deepEqual(env, original);
  assert.equal(mock.calls.length, 0);

  const diagnostics = await doctor.collectSpawnkitDoctorDiagnostics({ env, smoke: false });
  const output = doctor.renderSpawnkitDoctorDiagnostics(diagnostics);

  assert.equal(diagnostics.sessionEnvPatch.status, "disabled");
  assert.match(output, /session env patch:/);
  assert.match(output, /status: disabled/);
});
