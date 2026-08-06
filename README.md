# pi-spawnkit

[![Join dotfield.xyz on Discord](https://img.shields.io/badge/Join%20dotfield.xyz%20on%20Discord-5865F2?logo=discord&logoColor=white)](https://discord.gg/4945dXZVW5)

[![CI](https://github.com/eiei114/pi-spawnkit/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-spawnkit/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-spawnkit/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-spawnkit/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-spawnkit.svg)](https://www.npmjs.com/package/pi-spawnkit)
[![npm downloads](https://img.shields.io/npm/dm/pi-spawnkit.svg)](https://www.npmjs.com/package/pi-spawnkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Resolve and smoke-test the right child `pi` executable before Pi extensions try to spawn it.

## What this is

`pi-spawnkit` is a Pi extension/helper package for extension authors and Pi power users who launch child Pi processes. It targets Windows/npm-shim setups where the interactive shell can find `pi`, but a parent Pi process fails with `spawn pi ENOENT` because `pi.cmd` or the npm global bin is missing from the child process PATH.

## Status

`/spawnkit:doctor` walking skeleton, `spawnkit_resolve_pi` resolver, and spawn smoke diagnostics are shipped. Doctor prints platform, PATH entries, resolver candidates, the selected SpawnPlan, smoke status, bounded stdout/stderr snippets, version text when available, and warnings.

## Planned next

- Session-start process-local patch — set `PATH`, `PI_BIN`, and `PI_SPAWNKIT_RESOLVED=1` only when high-confidence resolution succeeds.
- Consumer docs for `pi-baton`, `pi-git-delegate`, gstack Agent/Task fallback, and Windows Git Bash / PowerShell.

## Install

```bash
pi install npm:pi-spawnkit
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-spawnkit
```

## Doctor command

Run `/spawnkit:doctor` inside Pi after loading the package to print platform, PATH entry count, `process.execPath`, `PI_BIN`, resolver candidates, the selected SpawnPlan, smoke status, bounded stdout/stderr snippets, version text when available, and warnings. Use `/spawnkit:doctor --json` for structured diagnostics. Missing candidates are diagnostics warnings rather than hard failures.

## Resolver tool

`spawnkit_resolve_pi` returns a child-launch SpawnPlan:

```ts
{
  command: string;
  argsPrefix: string[];
  envPatch: Record<string, string>;
  confidence: "configured" | "high" | "medium" | "missing";
  warnings: string[];
}
```

Resolution prefers configured overrides (`override`, `PI_BIN`, package setting), then process/npm hints, npm global bin candidates, and PATH lookup. On Windows, `pi.cmd` and `pi.exe` are preferred over bare `pi` when multiple candidates are plausible.

## Development

```bash
npm install
npm run ci
```

## Boundaries

- Child `pi` process resolution only.
- Not a generic shell execution wrapper; use `pi-winshell` for arbitrary command execution / argv / stdin safety.
- Not a broad environment probe; use `pi-env-probe` for one-shot diagnostics.
- No permanent PATH rewrite, shell profile edit, registry edit, automatic install, or `npm publish` by agents.

## Links

- npm: https://www.npmjs.com/package/pi-spawnkit
- GitHub: https://github.com/eiei114/pi-spawnkit
- Issues: https://github.com/eiei114/pi-spawnkit/issues
- Vault PRD: `4_Project/OSS/pi-spawnkit/Docs/PRD.md`

## License

MIT