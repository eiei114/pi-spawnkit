import assert from "node:assert/strict";
import test from "node:test";

const envFlags = await import("../lib/env-flags.ts");

test("env flag helpers classify common truthy and falsy values", () => {
  assert.equal(envFlags.isTruthyEnvFlag("1"), true);
  assert.equal(envFlags.isTruthyEnvFlag(" true "), true);
  assert.equal(envFlags.isTruthyEnvFlag("off"), false);

  assert.equal(envFlags.isFalsyEnvFlag("0"), true);
  assert.equal(envFlags.isFalsyEnvFlag(" disabled "), true);
  assert.equal(envFlags.isFalsyEnvFlag("yes"), false);
  assert.equal(envFlags.normalizedEnvFlag("  "), undefined);
});
