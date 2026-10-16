import assert from "node:assert/strict";
import test from "node:test";
import { behaviorAssertions, parseJsonLines, VERIFICATION_CONTRACT } from "../scripts/pi-sdk-smoke-contract.mjs";

const piCli = "C:/local/pi.js";
const expectedVersion = "1.2.0";
const makeDiagnostics = (overrides = {}) => ({
  platform: "win32",
  sessionEnvPatch: { status: "disabled" },
  spawnPlan: { command: piCli, confidence: "configured" },
  smoke: { status: "ok", versionText: expectedVersion },
  ...overrides,
});
const notify = (diagnostics) => ({
  type: "extension_ui_request", method: "notify", message: JSON.stringify(diagnostics),
});
const observation = (diagnostics = makeDiagnostics(), extra = {}) => ({
  responses: diagnostics ? [notify(diagnostics)] : [],
  commandNames: ["spawnkit:doctor"],
  promptResponse: { success: true },
  fullOutput: "",
  exit_code: 0,
  processExited: true,
  expectedVersion,
  piCli,
  ...extra,
});

test("behavior contract and JSON-lines parser", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  const row = { type: "response", command: "prompt", success: true };
  assert.deepEqual(parseJsonLines(`invalid\r\n${JSON.stringify(row)}\n\n`), [row]);
});

test("reload requires the second actual host registration and feature response", () => {
  const good = behaviorAssertions("reload_cleanup", observation(undefined, {
    secondResponses: [notify(makeDiagnostics())], secondOutput: "", secondExitCode: 0,
    secondCommandNames: ["spawnkit:doctor"], secondPromptResponse: { success: true },
    firstExited: true, secondExited: true,
  }));
  assert.deepEqual(good.map((item) => item.id), ["reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown"]);
  assert.ok(good.every((item) => item.passed));
  for (const secondResponses of [[], [notify(makeDiagnostics({ sessionEnvPatch: { status: "applied" } }))],
    [notify(makeDiagnostics({ smoke: { status: "not_found" } }))]]) {
    assert.ok(behaviorAssertions("reload_cleanup", observation(undefined, {
      secondResponses, secondOutput: "", secondExitCode: 0,
      secondCommandNames: secondResponses.length ? [] : ["spawnkit:doctor"], secondPromptResponse: { success: true },
      firstExited: true, secondExited: true,
    })).some((item) => !item.passed));
  }
});

test("positive feature response checks the actual diagnostic and SDK version", () => {
  assert.equal(behaviorAssertions("happy_path", observation())[0].passed, true);
  for (const diagnostics of [null,
    makeDiagnostics({ smoke: { status: "not_found", versionText: expectedVersion } }),
    makeDiagnostics({ spawnPlan: { command: "other", confidence: "configured" } }),
  ]) {
    assert.equal(behaviorAssertions("happy_path", observation(diagnostics))[0].passed, false);
  }
});

test("missing configured executable is accepted only as a structured handled error", () => {
  const missing = makeDiagnostics({
    smoke: { status: "not_found", errorCode: "ENOENT" },
  });
  assert.equal(behaviorAssertions("error_path", observation(missing))[0].passed, true);
  for (const smoke of [{ status: "ok" }, { status: "not_found" }, { status: "not_found", errorCode: "EACCES" }]) {
    assert.equal(behaviorAssertions("error_path", observation(makeDiagnostics({ smoke })))[0].passed, false);
  }
});

test("load and cleanup fail on missing registration, process failure, or unhandled errors", () => {
  assert.equal(behaviorAssertions("extension_load", observation())[0].passed, true);
  assert.equal(behaviorAssertions("extension_load", observation(null, { commandNames: [] }))[0].passed, false);
  assert.equal(behaviorAssertions("happy_path", observation(makeDiagnostics(), { fullOutput: "shutdown error" }))[0].passed, false);
  assert.equal(behaviorAssertions("host_shell", { fullOutput: "1.2.0\n", exit_code: 0, processExited: true, expectedVersion })[0].passed, true);
  for (const output of ["", "11.2.0", "1.2.0 failed", "1.1.0"]) {
    assert.equal(behaviorAssertions("host_shell", { fullOutput: output, exit_code: 0, processExited: true, expectedVersion })[0].passed, false);
  }
});
