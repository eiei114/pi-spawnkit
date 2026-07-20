import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await import("../extensions/index.ts");

test("package identity is pi-spawnkit", () => {
  assert.equal(pkg.name, "pi-spawnkit");
  assert.equal(pkg.repository.url, "https://github.com/eiei114/pi-spawnkit");
});

test("pi manifest exposes only the inert repo-seed extension", () => {
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
