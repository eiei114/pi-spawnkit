import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

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

const pkg = JSON.parse(await readText("package.json"));
const lock = JSON.parse(await readText("package-lock.json"));
const changelog = await readText("CHANGELOG.md");
const autoRelease = await readText(".github/workflows/auto-release.yml");
const publish = await readText(".github/workflows/publish.yml");

const version = pkg.version;
assert(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version), `package.json version is not semver-like: ${version}`);
assert(version !== "0.0.0", "package.json version must be publishable before release handoff");
assert(lock.version === version, `package-lock.json top-level version ${lock.version} does not match package.json ${version}`);
assert(lock.packages?.[""]?.version === version, `package-lock.json root package version ${lock.packages?.[""]?.version} does not match ${version}`);
assert(pkg.private !== true, "package.json must not be private for npm publish handoff");
assert(pkg.publishConfig?.access === "public", "package.json publishConfig.access must be public");

const releaseHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "mu");
assert(releaseHeading.test(changelog), `CHANGELOG.md is missing a ${version} release entry`);

for (const snippet of ["git tag \"$TAG\"", "gh release create \"$TAG\"", "gh workflow run publish.yml --ref \"$TAG\""]) {
  assert(autoRelease.includes(snippet), `.github/workflows/auto-release.yml is missing: ${snippet}`);
}

assert(publish.includes("id-token: write"), ".github/workflows/publish.yml must grant id-token: write for npm Trusted Publishing");
assert(!publish.includes("NPM_TOKEN"), ".github/workflows/publish.yml must not use NPM_TOKEN");
assert(publish.includes("npm publish --access public"), ".github/workflows/publish.yml must publish with public access");

console.log(`version check passed for ${pkg.name}@${version}`);
