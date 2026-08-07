import assert from "node:assert/strict";
import test from "node:test";

import {
  findSecretBackedNpmAuthReferences,
  isStrictSemverVersion,
  validateAutoReleaseWorkflow,
  validatePublishWorkflow,
} from "../scripts/version-check.mjs";

function createAutoReleaseWorkflow(overrides = {}) {
  return {
    permissions: {
      actions: "write",
      contents: "write",
    },
    jobs: {
      release: {
        steps: [
          {
            name: "Create tag and release",
            run: 'git tag "$TAG"\ngh release create "$TAG" --title "$TAG" --notes "$NOTES"',
          },
          {
            name: "Trigger publish workflow",
            run: 'gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"',
          },
        ],
      },
    },
    ...overrides,
  };
}

function createPublishWorkflow(overrides = {}) {
  return {
    permissions: {
      contents: "read",
      "id-token": "write",
    },
    jobs: {
      publish: {
        steps: [
          {
            name: "Publish pi-spawnkit to npm",
            run: "npm publish --access public",
          },
        ],
      },
    },
    ...overrides,
  };
}

test("version check uses strict SemVer validation cases", () => {
  for (const version of ["0.1.0", "1.2.3-rc.1+build.5"]) {
    assert.equal(isStrictSemverVersion(version), true, `${version} should be valid`);
  }

  for (const version of ["v1.2.3", "01.2.3", "1.2.3-01", "1.2", "1.2.3-"]) {
    assert.equal(isStrictSemverVersion(version), false, `${version} should be invalid`);
  }
});

test("version check validates auto-release workflow permissions and commands", () => {
  assert.doesNotThrow(() => validateAutoReleaseWorkflow(createAutoReleaseWorkflow()));

  assert.throws(
    () => validateAutoReleaseWorkflow(createAutoReleaseWorkflow({ permissions: { contents: "write" } })),
    /actions: write/,
  );

  assert.throws(
    () => validateAutoReleaseWorkflow(createAutoReleaseWorkflow({
      jobs: {
        release: {
          steps: [
            { name: "Create tag and release", run: 'git tag "$TAG"\ngh release create "$TAG"' },
            { name: "Trigger publish workflow", run: "echo not publishing" },
          ],
        },
      },
    })),
    /gh workflow run publish\.yml/,
  );
});

test("version check validates trusted publishing without secret-backed npm auth", () => {
  assert.doesNotThrow(() => validatePublishWorkflow(createPublishWorkflow()));
  assert.doesNotThrow(() => validatePublishWorkflow(createPublishWorkflow({
    jobs: {
      publish: {
        steps: [
          {
            name: "Publish pi-spawnkit to npm",
            run: "npm publish --access public --provenance",
          },
        ],
      },
    },
  })));

  const tokenWorkflow = createPublishWorkflow({
    jobs: {
      publish: {
        steps: [
          {
            name: "Publish pi-spawnkit to npm",
            env: {
              NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}",
            },
            run: "npm publish --access public",
          },
        ],
      },
    },
  });

  const references = findSecretBackedNpmAuthReferences(tokenWorkflow);
  assert.ok(references.some((reference) => reference.path === "$.jobs.publish.steps[0].env.NODE_AUTH_TOKEN"));
  assert.ok(references.some((reference) => reference.value.includes("NPM_TOKEN")));
  assert.throws(() => validatePublishWorkflow(tokenWorkflow), /NPM_TOKEN or NODE_AUTH_TOKEN/);

  assert.throws(
    () => validatePublishWorkflow(createPublishWorkflow({ permissions: { contents: "read", "id-token": "read" } })),
    /id-token: write/,
  );

  assert.throws(
    () => validatePublishWorkflow(createPublishWorkflow({
      jobs: {
        publish: {
          steps: [
            {
              name: "Publish pi-spawnkit to npm",
              run: "npm publish --access public --dry-run",
            },
          ],
        },
      },
    })),
    /public access/,
  );
});
