# pi-spawnkit Roadmap

## Current

Status: **repo seeded / not implemented**

The repository exists, package identity is set, and template example resources have been removed from the Pi manifest. The extension entrypoint is intentionally inert until the first implementation slice.

## v0.1 MVP

1. `/spawnkit:doctor` walking skeleton.
2. Cross-platform Pi executable resolver.
3. Spawn smoke test and structured diagnostics.
4. Session-start `PATH` / `PI_BIN` process-local patch.
5. Consumer docs and vault dogfood.
6. Release prep and human publish handoff.

## Human-owned boundary

`npm publish` and OTP remain human-owned. Agents may prepare `npm pack` and `npm publish --dry-run` evidence only.
