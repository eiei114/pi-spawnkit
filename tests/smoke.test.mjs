import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

const doctor = await import("../lib/doctor.ts");

function createPlan(overrides = {}) {
  return {
    command: "/opt/pi/bin/pi",
    argsPrefix: [],
    envPatch: { PI_BIN: "/opt/pi/bin/pi" },
    confidence: "high",
    warnings: [],
    ...overrides,
  };
}

class MockChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killCalls = [];

  kill(signal) {
    this.killCalls.push(signal);
    return true;
  }
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

test("spawn smoke reports ok, uses SpawnPlan args/env, and extracts version text", async () => {
  const mock = createMockSpawn((child) => {
    setImmediate(() => {
      child.stdout.write("pi 0.83.0\nextra line\n");
      child.stderr.write("diagnostic\n");
      child.emit("close", 0, null);
    });
  });

  const result = await doctor.runSpawnSmokeTest(createPlan({
    argsPrefix: ["--profile", "child"],
    envPatch: { PI_BIN: "/opt/pi/bin/pi", PATH: "/opt/pi/bin" },
  }), {
    env: { PATH: "/usr/bin", KEEP: "1" },
    spawn: mock.spawn,
    timeoutMs: 100,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.args, ["--profile", "child", "--version"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.versionText, "pi 0.83.0");
  assert.equal(result.stdoutSnippet, "pi 0.83.0\nextra line\n");
  assert.equal(mock.calls[0].command, "/opt/pi/bin/pi");
  assert.deepEqual(mock.calls[0].args, ["--profile", "child", "--version"]);
  assert.equal(mock.calls[0].options.env.PATH, "/opt/pi/bin");
  assert.equal(mock.calls[0].options.env.KEEP, "1");
  assert.deepEqual(mock.calls[0].options.stdio, ["ignore", "pipe", "pipe"]);
});

test("spawn smoke classifies ENOENT as not_found", async () => {
  const enoent = Object.assign(new Error("spawn pi ENOENT"), { code: "ENOENT" });
  const mock = createMockSpawn((child) => {
    setImmediate(() => child.emit("error", enoent));
  });

  const result = await doctor.runSpawnSmokeTest(createPlan({ command: "missing-pi", envPatch: {} }), {
    spawn: mock.spawn,
    timeoutMs: 100,
  });

  assert.equal(result.status, "not_found");
  assert.equal(result.errorCode, "ENOENT");
  assert.match(result.errorMessage, /ENOENT/);
});

test("spawn smoke classifies spawn errors other than ENOENT as found_but_not_runnable", async () => {
  const eacces = Object.assign(new Error("spawn pi EACCES"), { code: "EACCES" });
  const mock = createMockSpawn((child) => {
    setImmediate(() => child.emit("error", eacces));
  });

  const result = await doctor.runSpawnSmokeTest(createPlan(), {
    spawn: mock.spawn,
    timeoutMs: 100,
  });

  assert.equal(result.status, "found_but_not_runnable");
  assert.equal(result.errorCode, "EACCES");
});

test("spawn smoke classifies non-zero exits and bounds stderr snippets", async () => {
  const mock = createMockSpawn((child) => {
    setImmediate(() => {
      child.stderr.write("abcdefg\nmore detail\n");
      child.emit("close", 2, null);
    });
  });

  const result = await doctor.runSpawnSmokeTest(createPlan(), {
    spawn: mock.spawn,
    timeoutMs: 100,
    maxSnippetChars: 7,
  });

  assert.equal(result.status, "nonzero_exit");
  assert.equal(result.exitCode, 2);
  assert.equal(result.stderrSnippet, "abcdefg");
  assert.equal(result.versionText, "abcdefg");
});

test("spawn smoke classifies hung children as timeout without waiting for close", async () => {
  const mock = createMockSpawn(() => {});

  const result = await doctor.runSpawnSmokeTest(createPlan(), {
    spawn: mock.spawn,
    timeoutMs: 5,
  });

  assert.equal(result.status, "timeout");
  assert.equal(result.timedOut, true);
  assert.deepEqual(mock.calls[0].child.killCalls, ["SIGTERM"]);
});
