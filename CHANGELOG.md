# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.2.0] - 2026-08-12

### Added

- Add a shared `spawnWithSpawnPlan` launcher so gstack review consumers use the same cross-platform child Pi launch path as the smoke test.

### Fixed

- Run `npm run version:check` inside `npm run ci` so release metadata and Trusted Publishing workflow policy cannot drift undetected.
- Route Windows npm `pi.cmd` and `pi.bat` shims through `ComSpec` instead of passing batch files directly to Node `spawn`.
- Route Windows Git Bash-style `pi` shims through `bash.exe` and resolve a bare `PI_BIN=pi` against npm global bins and PATH before using it.
- Document that `pi-spawnkit` is the Pi gstack companion for Codex reviews and delegated Pi-agent reviews.

## [0.1.0] - 2026-08-07

### Added

- Repo seeded from `eiei114/pi-extension-template` with package identity, README, CI baseline, and extension entrypoint.
- `/spawnkit:doctor` diagnostics for platform, PATH entries, candidate Pi executables, selected SpawnPlan, smoke status, and warnings.
- `spawnkit_resolve_pi` helper/tool for configured, environment, npm-bin, and PATH-based child Pi executable resolution.
- Spawn smoke diagnostics for verifying the selected child Pi plan before consumers launch subprocesses.
- Conservative session-start process-local env patching for `PATH`, `PI_BIN`, and `PI_SPAWNKIT_RESOLVED` after high-confidence smoke success.
- Consumer docs and dogfood evidence covering direct helper usage, replacing `spawn("pi", args)`, `pi-baton`, `pi-git-delegate`, gstack fallback, and Windows npm shim notes.
- Release workflow documentation for GitHub auto-release and npm Trusted Publishing handoff.

### Changed

- Bump package version to `0.1.0` for the initial publish handoff.
- Add a concrete `npm run version:check` release readiness check for package metadata, changelog, strict SemVer syntax, lockfile version alignment, auto-release workflow YAML, and Trusted Publishing policy.

### Fixed

- Correct stale `create-pi-extension` / monorepo release wording in `CONTRIBUTING.md`.
- Align README status with the shipped `/spawnkit:doctor` walking skeleton, resolver, smoke diagnostics, session-start patch, and consumer integration notes.
