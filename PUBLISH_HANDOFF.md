# Publish Handoff

Package: `pi-spawnkit`
Version: `0.1.0`
Status: `ready_to_publish`

## What was built

- `package.json` and `package-lock.json` are set to `0.1.0`.
- `CHANGELOG.md` has a `0.1.0` entry covering:
  - `/spawnkit:doctor` diagnostics,
  - `spawnkit_resolve_pi` resolver/helper/tool,
  - spawn smoke diagnostics,
  - conservative session-start process-local env patching,
  - consumer docs and dogfood evidence.
- `npm run version:check` now validates release metadata, changelog entry, lockfile version alignment, auto-release wiring, and npm Trusted Publishing policy.
- Release workflow policy was checked:
  - `.github/workflows/auto-release.yml` creates a version tag and GitHub Release from a `package.json` version bump, then dispatches `publish.yml` for that tag.
  - `.github/workflows/publish.yml` grants `id-token: write` for npm Trusted Publishing/OIDC.
  - `.github/workflows/publish.yml` does not reference `NPM_TOKEN`.

## Validation

- `npm ci` completed successfully before validation.
  - Note: npm reported 4 dependency audit findings in dev/transitive dependencies (2 moderate, 2 high); no audit fix was applied in this release-prep handoff.
- `npm run version:check` passed.
- `npm run ci` passed:
  - `npm run typecheck` passed.
  - `npm test` passed: 31 tests passed.
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
lib/resolve-pi.ts
lib/session-env.ts
lib/session-state.ts
package.json
```

Dry-run tarball summary:

```text
name: pi-spawnkit
version: 0.1.0
filename: pi-spawnkit-0.1.0.tgz
package size: 14.7 kB
unpacked size: 51.0 kB
total files: 13
```

## Human action

1. Review and merge the release-prep PR intentionally.
2. Confirm npm Trusted Publishing is configured for:
   - package: `pi-spawnkit`
   - repository: `eiei114/pi-spawnkit`
   - workflow filename: `publish.yml`
   - environment: none, unless intentionally changed later.
3. After merge to `main`, verify the GitHub auto-release creates `v0.1.0` and dispatches `publish.yml` for that tag.
4. Verify npm shows `pi-spawnkit@0.1.0` after the trusted publish workflow completes.

Do not run local `npm publish`; publish credentials, OTP, release promotion, and final package publication remain human-owned.

## Risks and follow-up

- Merging a `package.json` version bump to `main` is expected to trigger the auto-release/publish workflow. Treat the merge itself as the human publish approval step.
- npm Trusted Publishing must be configured on npmjs.com before the publish workflow can complete.
- `npm ci` reported dependency audit findings. They are not introduced by this handoff, but should be triaged separately after the initial release if they remain relevant.
- If `v0.1.0` already exists before merge, auto-release will skip tag/release creation by design.
