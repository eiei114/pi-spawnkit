import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const releaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

function triggers(text) {
  return text.split(/^permissions:/m)[0];
}

test("merging code cannot directly or indirectly trigger npm publish or release", () => {
  const release = triggers(releaseWorkflow);
  assert.match(release, /on:\r?\n\s+workflow_dispatch:/, "release must be manually triggered only");
  assert.doesNotMatch(release, /^\s+push:/m, "a merge must not start release");
  const publish = triggers(publishWorkflow);
  assert.match(publish, /push:\r?\n\s+tags:/, "publishing must remain version-tag gated");
  assert.doesNotMatch(publish, /^\s+branches:/m, "main branch edits must not publish");
  assert.match(publishWorkflow, /npm publish/);
});

test("manual dispatch checks the selected commit against its previous version", async () => {
  const workflow = parseYaml(releaseWorkflow);
  const checkStep = workflow.jobs.release.steps.find((step) => step.id === "check");
  assert.ok(checkStep?.run, "release workflow must retain its version check step");

  const fixture = await mkdtemp(join(tmpdir(), "pi-spawnkit-release-dispatch-"));
  try {
    const git = (args) => {
      const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
      assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
    };
    git(["init", "--quiet"]);
    git(["config", "user.name", "Release contract test"]);
    git(["config", "user.email", "release-contract@example.invalid"]);

    await writeFile(join(fixture, "package.json"), JSON.stringify({ version: "0.2.7" }));
    git(["add", "package.json"]);
    git(["commit", "--quiet", "-m", "previous release"]);
    await writeFile(join(fixture, "package.json"), JSON.stringify({ version: "0.2.8" }));
    git(["add", "package.json"]);
    git(["commit", "--quiet", "-m", "version bump"]);

    const outputPath = join(fixture, "github-output.txt");
    const bashOutputPath = process.platform === "win32"
      ? `/${outputPath[0].toLowerCase()}${outputPath.slice(2).replaceAll("\\", "/")}`
      : outputPath;
    const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
    const result = spawnSync(bash, ["--noprofile", "--norc", "-e", "-c", checkStep.run], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_OUTPUT: bashOutputPath },
    });

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `manual-dispatch version check failed: ${result.stderr}`);
    const outputs = await readFile(outputPath, "utf8");
    assert.match(outputs, /^released=true$/m);
    assert.match(outputs, /^tag=v0\.2\.8$/m);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
