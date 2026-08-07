# pi-spawnkit Roadmap

## Current

Status: **doctor walking skeleton, resolver, and smoke diagnostics shipped; session env patch shipped**

`/spawnkit:doctor` is implemented with structured PATH diagnostics, resolver candidates, the selected SpawnPlan, session env patch status, and bounded spawn smoke diagnostics. Process-local PATH patching is shipped and remains process-local only.

## v0.1 MVP

1. `/spawnkit:doctor` walking skeleton — shipped.
2. Cross-platform Pi executable resolver — shipped.
3. Spawn smoke test and structured diagnostics — shipped.
4. Session-start `PATH` / `PI_BIN` process-local patch — shipped.
5. Consumer docs and vault dogfood.
6. Release prep and human publish handoff.

## Human-owned boundary

`npm publish` and OTP remain human-owned. Agents may prepare `npm pack` and `npm publish --dry-run` evidence only.
