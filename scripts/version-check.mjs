import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import semver from "semver";
import { parse as parseYaml } from "yaml";

const root = new URL("../", import.meta.url);
const secretBackedNpmAuthPattern = /\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/u;

async function readText(path) {
  return readFile(new URL(path, root), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isStrictSemverVersion(value) {
  if (typeof value !== "string" || semver.valid(value, { loose: false }) === null) {
    return false;
  }

  const parsed = semver.parse(value, { loose: false });
  const fullParsedVersion = `${parsed.version}${parsed.build.length > 0 ? `+${parsed.build.join(".")}` : ""}`;
  return fullParsedVersion === value;
}

export function parseWorkflowYaml(path, text) {
  const workflow = parseYaml(text);
  assert(isRecord(workflow), `${path} must be a YAML mapping`);
  return workflow;
}

function getJob(workflow, jobName, path) {
  const job = workflow.jobs?.[jobName];
  assert(isRecord(job), `${path} is missing job: ${jobName}`);
  return job;
}

function normalizePermissions(permissions) {
  if (typeof permissions === "string" || isRecord(permissions)) {
    return permissions;
  }
  return {};
}

export function getEffectiveJobPermissions(workflow, jobName) {
  const job = getJob(workflow, jobName, "workflow");
  return normalizePermissions(job.permissions ?? workflow.permissions);
}

function permissionIsWrite(permissions, scope) {
  if (permissions === "write-all") {
    return true;
  }

  return isRecord(permissions) && permissions[scope] === "write";
}

function assertJobPermissionWrite(workflow, jobName, scope, message) {
  const permissions = getEffectiveJobPermissions(workflow, jobName);
  assert(permissionIsWrite(permissions, scope), message);
}

function findStepByName(job, stepName) {
  assert(Array.isArray(job.steps), `job is missing steps`);
  return job.steps.find((step) => isRecord(step) && step.name === stepName);
}

function lineHasOption(line, option) {
  const optionPattern = new RegExp(`(?:^|\\s)${escapeRegExp(option)}(?:\\s|=|$)`, "u");
  return optionPattern.test(line);
}

function runScriptHasCommand(runScript, expectedCommand, options = {}) {
  const disallowedOptions = options.disallowedOptions ?? [];

  return runScript
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .some((line) => {
      const matchesExpectedCommand = line === expectedCommand || line.startsWith(`${expectedCommand} `);
      return matchesExpectedCommand && disallowedOptions.every((option) => !lineHasOption(line, option));
    });
}

function assertStepRunsCommand(job, stepName, expectedCommand, message, options) {
  const step = findStepByName(job, stepName);
  assert(isRecord(step), `job is missing step: ${stepName}`);
  assert(typeof step.run === "string" && runScriptHasCommand(step.run, expectedCommand, options), message);
}

export function findSecretBackedNpmAuthReferences(value, path = "$") {
  const references = [];

  if (typeof value === "string") {
    if (secretBackedNpmAuthPattern.test(value)) {
      references.push({ path, value });
    }
    return references;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      references.push(...findSecretBackedNpmAuthReferences(item, `${path}[${index}]`));
    });
    return references;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (secretBackedNpmAuthPattern.test(key)) {
        references.push({ path: childPath, value: key });
      }
      references.push(...findSecretBackedNpmAuthReferences(child, childPath));
    }
  }

  return references;
}

export function validateAutoReleaseWorkflow(workflow) {
  const releaseJob = getJob(workflow, "release", ".github/workflows/auto-release.yml");

  assertJobPermissionWrite(
    workflow,
    "release",
    "contents",
    ".github/workflows/auto-release.yml must grant contents: write to create the release tag",
  );
  assertJobPermissionWrite(
    workflow,
    "release",
    "actions",
    ".github/workflows/auto-release.yml must grant actions: write to dispatch publish.yml",
  );

  assertStepRunsCommand(
    releaseJob,
    "Create tag and release",
    "git tag \"$TAG\"",
    ".github/workflows/auto-release.yml is missing: git tag \"$TAG\"",
  );
  assertStepRunsCommand(
    releaseJob,
    "Create tag and release",
    "gh release create \"$TAG\"",
    ".github/workflows/auto-release.yml is missing: gh release create \"$TAG\"",
  );
  assertStepRunsCommand(
    releaseJob,
    "Trigger publish workflow",
    "gh workflow run publish.yml --ref \"$TAG\"",
    ".github/workflows/auto-release.yml is missing: gh workflow run publish.yml --ref \"$TAG\"",
  );
}

export function validatePublishWorkflow(workflow) {
  const publishJob = getJob(workflow, "publish", ".github/workflows/publish.yml");

  assertJobPermissionWrite(
    workflow,
    "publish",
    "id-token",
    ".github/workflows/publish.yml must grant id-token: write for npm Trusted Publishing",
  );
  assert(
    findSecretBackedNpmAuthReferences(workflow).length === 0,
    ".github/workflows/publish.yml must not use NPM_TOKEN or NODE_AUTH_TOKEN",
  );
  assertStepRunsCommand(
    publishJob,
    "Publish pi-spawnkit to npm",
    "npm publish --access public",
    ".github/workflows/publish.yml must publish with public access",
    { disallowedOptions: ["--dry-run"] },
  );
}

export async function runVersionCheck() {
  const pkg = JSON.parse(await readText("package.json"));
  const lock = JSON.parse(await readText("package-lock.json"));
  const changelog = await readText("CHANGELOG.md");
  const autoRelease = parseWorkflowYaml(".github/workflows/auto-release.yml", await readText(".github/workflows/auto-release.yml"));
  const publish = parseWorkflowYaml(".github/workflows/publish.yml", await readText(".github/workflows/publish.yml"));

  const version = pkg.version;
  assert(isStrictSemverVersion(version), `package.json version is not semver-like: ${version}`);
  assert(version !== "0.0.0", "package.json version must be publishable before release handoff");
  assert(lock.version === version, `package-lock.json top-level version ${lock.version} does not match package.json ${version}`);
  assert(lock.packages?.[""]?.version === version, `package-lock.json root package version ${lock.packages?.[""]?.version} does not match ${version}`);
  assert(pkg.private !== true, "package.json must not be private for npm publish handoff");
  assert(pkg.publishConfig?.access === "public", "package.json publishConfig.access must be public");

  const releaseHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "mu");
  assert(releaseHeading.test(changelog), `CHANGELOG.md is missing a ${version} release entry`);

  validateAutoReleaseWorkflow(autoRelease);
  validatePublishWorkflow(publish);

  console.log(`version check passed for ${pkg.name}@${version}`);
}

function isCliEntrypoint() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliEntrypoint()) {
  await runVersionCheck();
}
