# Publish Handoff

Package: `pi-spawnkit`
Version: `0.2.14`
Status: `prepared`

Version 0.2.14 verifies the existing child-Pi resolution and diagnostics against the pinned Pi SDK 1.5.0 and is prepared for review; this change does not authorize npm publication.

## What was built

- `package.json` and `package-lock.json` are set to `0.2.14`.
- `CHANGELOG.md` has a `0.2.14` entry covering Pi SDK 1.5.0 compatibility verification.
- `0.2.0` added the shared `spawnWithSpawnPlan` launcher in `lib/launch.ts` for cross-platform child Pi launches.
- `npm run version:check` validates release metadata, changelog entry, lockfile version alignment, strict SemVer syntax, auto-release wiring, and npm Trusted Publishing policy by parsing workflow YAML.
- Release workflow policy was checked:
  - `.github/workflows/auto-release.yml` is `workflow_dispatch`-only. A manual run compares the selected commit with its parent and, when the package version changed, creates the version tag and GitHub Release, then dispatches `publish.yml` for that tag.
  - Merging a pull request does not trigger auto-release or npm publication.
  - `.github/workflows/publish.yml` grants `id-token: write` for npm Trusted Publishing/OIDC.
  - `.github/workflows/publish.yml` does not reference `NPM_TOKEN` or `NODE_AUTH_TOKEN`.

## Validation

- `npm ci` completed successfully before validation.
- `npm run smoke:pi` passed all five actual Pi host smoke cases using the manifest-pinned SDK versions, including Pi TUI 1.5.0.
- `npm run version:check` passed.
- `npm run ci` passed:
  - `npm run typecheck` passed.
  - `npm test` passed: 59 tests, including the GitHub branch install example regression and manual-dispatch release contract tests.
  - `npm run smoke:pi` passed.
  - `npm run version:check` passed.
  - `npm run pack:check` / `npm pack --dry-run` passed.

Dry-run package contents:

```text
CHANGELOG.md
LICENSE
README.md
docs/.gitkeep
docs/dogfood.md
docs/release.md
docs/verification/pi-sdk-smoke.json
extensions/index.ts
lib/.gitkeep
lib/doctor.ts
lib/env-flags.ts
lib/launch.ts
lib/resolve-pi.ts
lib/session-env.ts
lib/session-state.ts
package.json
```

Dry-run tarball summary:

```text
name: pi-spawnkit
version: 0.2.14
filename: pi-spawnkit-0.2.14.tgz
package size: 18.6 kB
unpacked size: 69.1 kB
total files: 16
```

## Human action

1. Do not merge until the protected-action separation and release approval are resolved. Once that gate is satisfied, review and merge the release-prep PR intentionally. Merge alone does not create a release or publish the package.
2. Confirm npm Trusted Publishing is configured for:
   - package: `pi-spawnkit`
   - repository: `eiei114/pi-spawnkit`
   - workflow filename: `publish.yml`
   - environment: none, unless intentionally changed later.
3. Only after separately authorizing the release, manually dispatch the `Auto Release` workflow against `main`. It compares `package.json` at `HEAD` with `HEAD^`, creates `v0.2.14` and its GitHub Release, then dispatches `publish.yml` for that tag. Dispatch it while the `0.2.14` version-bump commit is still the tip of `main`; if `main` has advanced without another version change, the workflow logs `package.json version did not change` and skips.
4. Verify the GitHub release is `v0.2.14` and npm shows `pi-spawnkit@0.2.14` after the trusted publish workflow completes.

Do not run local `npm publish`; publish credentials, OTP, release promotion, and final package publication remain human-owned.

## Risks and follow-up

- Merging a `package.json` version bump does not run auto-release. Manually dispatching `Auto Release` can create a GitHub release and trigger npm publication; treat that dispatch as a separately authorized human release action.
- npm Trusted Publishing must be configured on npmjs.com before the publish workflow can complete.
- If `v0.2.14` already exists when auto-release is manually dispatched, it skips tag/release creation by design.
- If `Auto Release` skipped because `main` advanced past the version-bump commit, the release owner, under the same separate release authorization, can create the `v0.2.14` tag and GitHub Release on the version-bump commit. Pushing that tag triggers `publish.yml`; if no publish run starts, manually dispatch `publish.yml` with `ref=v0.2.14`. `publish.yml` skips the publish step when `pi-spawnkit@0.2.14` is already on npm.
