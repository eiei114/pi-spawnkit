# Publish Handoff

Package: `pi-spawnkit`
Version: `0.2.1`
Status: `published`

## What was built

- `package.json` and `package-lock.json` are set to `0.2.1`.
- `CHANGELOG.md` has a `0.2.1` entry covering the 2026-08-22 managed OSS dependency and maintenance batch.
- `0.2.0` added the shared `spawnWithSpawnPlan` launcher in `lib/launch.ts` for cross-platform child Pi launches.
- `npm run version:check` validates release metadata, changelog entry, lockfile version alignment, strict SemVer syntax, auto-release wiring, and npm Trusted Publishing policy by parsing workflow YAML.
- Release workflow policy was checked:
  - `.github/workflows/auto-release.yml` creates a version tag and GitHub Release from a `package.json` version bump, then dispatches `publish.yml` for that tag.
  - `.github/workflows/publish.yml` grants `id-token: write` for npm Trusted Publishing/OIDC.
  - `.github/workflows/publish.yml` does not reference `NPM_TOKEN` or `NODE_AUTH_TOKEN`.

## Validation

- `npm ci` completed successfully before validation.
- `npm run version:check` passed.
- `npm run ci` passed:
  - `npm run typecheck` passed.
  - `npm test` passed: 42 tests passed.
  - `npm run pack:check` / `npm pack --dry-run` passed.

Dry-run package contents:

```text
CHANGELOG.md
LICENSE
README.md
docs/.gitkeep
docs/dogfood.md
docs/release.md
extensions/index.ts
lib/.gitkeep
lib/doctor.ts
lib/launch.ts
lib/resolve-pi.ts
lib/session-env.ts
lib/session-state.ts
package.json
```

Dry-run tarball summary:

```text
name: pi-spawnkit
version: 0.2.1
filename: pi-spawnkit-0.2.1.tgz
package size: 16.3 kB
unpacked size: 57.9 kB
total files: 14
```

## Human action

1. Review and merge the release-prep PR intentionally.
2. Confirm npm Trusted Publishing is configured for:
   - package: `pi-spawnkit`
   - repository: `eiei114/pi-spawnkit`
   - workflow filename: `publish.yml`
   - environment: none, unless intentionally changed later.
3. After merge to `main`, verify the GitHub auto-release creates `v0.2.1` and dispatches `publish.yml` for that tag.
4. Verify npm shows `pi-spawnkit@0.2.1` after the trusted publish workflow completes.

Do not run local `npm publish`; publish credentials, OTP, release promotion, and final package publication remain human-owned.

## Risks and follow-up

- Merging a `package.json` version bump to `main` is expected to trigger the auto-release/publish workflow. Treat the merge itself as the human publish approval step.
- npm Trusted Publishing must be configured on npmjs.com before the publish workflow can complete.
- If `v0.2.1` already exists before merge, auto-release will skip tag/release creation by design.
