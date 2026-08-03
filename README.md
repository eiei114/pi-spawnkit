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

`/spawnkit:doctor` walking skeleton is shipped. It prints platform, PATH entries, Pi executable candidates, and warnings.

## Planned next

- `spawnkit_resolve_pi` — return `{ command, argsPrefix, envPatch, confidence, warnings }` for child-launching tools.
- Spawn smoke test and structured diagnostics.
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

Run `/spawnkit:doctor` inside Pi after loading the package to print platform, PATH entry count, `process.execPath`, `PI_BIN`, checked candidates (`pi`, `pi.cmd`, `pi.exe`), and warnings. Missing candidates are diagnostics warnings rather than hard failures.

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