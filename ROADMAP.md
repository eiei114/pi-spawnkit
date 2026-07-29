# pi-spawnkit Roadmap

## Current

Status: **doctor walking skeleton shipped**

`/spawnkit:doctor` is implemented with structured PATH and Pi executable candidate diagnostics. Resolver, spawn smoke test, and process-local PATH patching remain planned.

## v0.1 MVP

1. `/spawnkit:doctor` walking skeleton — shipped.
2. Cross-platform Pi executable resolver.
3. Spawn smoke test and structured diagnostics.
4. Session-start `PATH` / `PI_BIN` process-local patch.
5. Consumer docs and vault dogfood.
6. Release prep and human publish handoff.

## Human-owned boundary

`npm publish` and OTP remain human-owned. Agents may prepare `npm pack` and `npm publish --dry-run` evidence only.
