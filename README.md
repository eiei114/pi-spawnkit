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

The `/spawnkit:doctor` walking skeleton, `spawnkit_resolve_pi` resolver, and spawn smoke diagnostics are shipped. Session-start process-local env patching and consumer integration notes are also shipped. The session-start patch is intentionally conservative: when high-confidence (or explicit `configured`) resolution passes smoke, only the current Pi process gets an idempotent `PATH` prepend, `PI_BIN`, and `PI_SPAWNKIT_RESOLVED=1`.

## Install

Install from npm for normal consumer use:

```bash
pi install npm:pi-spawnkit
```

Install from GitHub when testing an unreleased branch:

```bash
pi install git:github.com/eiei114/pi-spawnkit
```

For local development, load the checkout for the current run without changing global settings:

```bash
git clone https://github.com/eiei114/pi-spawnkit
cd pi-spawnkit
npm install
pi -e .
```

If you intentionally want a local package entry, install the path explicitly. Use `-l` only when you want to write project-local `.pi/settings.json`; otherwise Pi writes the user settings file.

```bash
pi install ./path/to/pi-spawnkit
pi install -l ./path/to/pi-spawnkit
```

## Doctor command

Run `/spawnkit:doctor` inside Pi after loading the package to print platform, PATH entry count, `process.execPath`, `PI_BIN`, resolver candidates, the selected SpawnPlan, session env patch status, smoke status, bounded stdout/stderr snippets, version text when available, and warnings. Use `/spawnkit:doctor --json` for structured diagnostics. Missing candidates are diagnostics warnings rather than hard failures.

Example summary:

```text
spawnkit doctor
platform: win32
PATH entries: 42
PI_BIN: <unset>
selected SpawnPlan:
  command: C:\Users\alice\AppData\Roaming\npm\pi.cmd
  argsPrefix: []
  confidence: high
  envPatch: PI_BIN, Path
spawn smoke:
  status: ok
  args: ["--version"]
  version: 0.83.0
warnings:
  - none
```

If smoke is not `ok`, copy the selected SpawnPlan, smoke status, and warnings into the consuming package issue before falling back to ambient `pi` PATH lookup.

## Session-start env patch

On `session_start`, the extension resolves and smoke-tests the child Pi executable. It mutates only the current process `process.env`, and only when resolver confidence is `high` (or explicit `configured`) and smoke status is `ok`. Set `PI_SPAWNKIT_SESSION_PATCH=0` or `PI_SPAWNKIT_DISABLE_SESSION_PATCH=1` before starting Pi to opt out.

## SpawnPlan contract

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

Resolution prefers configured overrides in this order: `override`, explicit `piBin`, environment `PI_BIN`, then package setting. If no configured value is present, it checks process/npm hints, npm global bin candidates, and PATH lookup. On Windows, `pi.cmd` and `pi.exe` are preferred over bare `pi` when multiple candidates are plausible.

Consumer responsibilities:

- launch `plan.command`, not hard-coded `"pi"`;
- prepend `plan.argsPrefix` before the child Pi arguments;
- merge `plan.envPatch` over the parent environment for the child process;
- treat `confidence: "missing"` and any smoke failure as diagnostics to surface, not as a reason to silently retry ambient PATH lookup.

## Helper usage from another Pi extension

A Pi extension that depends on `pi-spawnkit` can import the helpers from the package and pass its own package setting as a lower-priority fallback. Per-call `override`, explicit `piBin`, and environment `PI_BIN` still win over `packageSetting`.

```ts
import { spawn } from "node:child_process";
import { runSpawnSmokeTest, spawnkit_resolve_pi } from "pi-spawnkit/extensions/index.ts";

function isWindowsBatchPlan(command: string): boolean {
  return process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(command);
}

function quoteForCmd(value: string): string {
  if (/[\r\n]/u.test(value)) {
    throw new Error("Child Pi arguments must not contain newlines for cmd.exe dispatch.");
  }

  return `"${value.replace(/(["^&|<>()%!])/gu, "^$1")}"`;
}

function spawnPlanCommand(command: string, args: string[], options: Parameters<typeof spawn>[2]) {
  if (isWindowsBatchPlan(command)) {
    const commandLine = ["call", quoteForCmd(command), ...args.map(quoteForCmd)].join(" ");
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
      ...options,
      windowsVerbatimArguments: true,
    });
  }

  return spawn(command, args, options);
}

export async function launchChildPi(args: string[], packageSetting?: string) {
  const plan = await spawnkit_resolve_pi({ packageSetting });

  if (plan.confidence === "missing") {
    throw new Error(`Unable to resolve child pi executable: ${plan.warnings.join("; ")}`);
  }

  const smoke = await runSpawnSmokeTest(plan, { spawn: spawnPlanCommand });
  if (smoke.status !== "ok") {
    throw new Error(`Child pi smoke failed (${smoke.status}): ${smoke.errorMessage ?? smoke.versionText ?? "no detail"}`);
  }

  const childEnv = {
    ...process.env,
    ...plan.envPatch,
  };

  return spawnPlanCommand(
    plan.command,
    [...plan.argsPrefix, ...args],
    {
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    },
  );
}
```

The package also registers the `spawnkit_resolve_pi` tool for agent-side diagnostics. The rendered tool result is human-readable, and `details.spawnPlan` carries the same SpawnPlan shape for tooling that reads structured details.

## Replace `spawn("pi", args)`

Before:

```ts
import { spawn } from "node:child_process";

spawn("pi", args, {
  env: process.env,
  stdio: "inherit",
});
```

After, using the batch-aware `spawnPlanCommand` helper from the previous section:

```ts
import { runSpawnSmokeTest, spawnkit_resolve_pi } from "pi-spawnkit/extensions/index.ts";

const plan = await spawnkit_resolve_pi();
const env = { ...process.env, ...plan.envPatch };
const smoke = await runSpawnSmokeTest(plan, { spawn: spawnPlanCommand });

if (smoke.status !== "ok") {
  throw new Error(`Child pi smoke failed: ${smoke.status}`);
}

spawnPlanCommand(plan.command, [...plan.argsPrefix, ...args], {
  env,
  stdio: "inherit",
  windowsHide: true,
});
```

The ordering matters: `argsPrefix` belongs before consumer args because a future SpawnPlan may wrap the real Pi executable through a platform-specific launcher.

## Consumer integration notes

### `pi-baton`

Resolve once per baton handoff before starting the child Pi process. Pass baton-specific prompts, session flags, and resource flags after `plan.argsPrefix`; do not rebuild PATH from the interactive shell. Include `plan.envPatch` when spawning so `PI_BIN` and any resolved npm-bin PATH prepend are visible to the child. Reuse a batch-aware launcher like `spawnPlanCommand` above so Windows `pi.cmd` plans are dispatched through `cmd.exe` and native executable plans still use direct spawn.

### `pi-git-delegate`

Resolve inside the delegating process, then spawn the child Pi from the target worktree with the merged child environment and the same batch-aware launch helper. This avoids depending on Git Bash login startup, PowerShell profile startup, IDE-specific PATH mutations, or direct spawning of Windows batch shims that may not work inside the delegated child process.

### gstack Agent/Task fallback

When falling back from a direct Agent/Task API to a child Pi process, cache the SpawnPlan for the current process and re-run `/spawnkit:doctor` on failure. If the plan is `missing`, report the resolver warnings with the fallback error rather than attempting an unbounded shell search.

### Windows Git Bash / PowerShell npm shims

Windows npm installs commonly create `pi.cmd`, sometimes `pi.exe`, and a bare POSIX-style `pi` shim. Git Bash and PowerShell may find different shims because their startup files and PATH normalization differ. SpawnKit checks configured overrides, process hints, npm global bins, and PATH entries, then returns a SpawnPlan plus an env patch; consumers should use that plan instead of relying on whichever shell happened to launch the parent Pi.

## Dogfood evidence

Local dogfood evidence for this repository is recorded in `docs/dogfood.md`.

## Development

```bash
npm install
npm run ci
```

## Boundaries and non-goals

- SpawnKit is for child `pi` process resolution and smoke diagnostics only.
- It is not a generic shell execution wrapper; use `pi-winshell` for arbitrary command execution, shell-specific quoting, argv, stdin, or profile behavior.
- It is not a broad environment probe; use `pi-env-probe` for one-shot PATH/env diagnostics outside child Pi launch planning.
- It does not edit shell profiles, registry keys, permanent PATH, npm global installs, or package manager state.
- It does not publish packages; npm publish, OTP, credentials, and release promotion remain human-owned.

## Links

- npm: https://www.npmjs.com/package/pi-spawnkit
- GitHub: https://github.com/eiei114/pi-spawnkit
- Issues: https://github.com/eiei114/pi-spawnkit/issues
- Vault PRD: `4_Project/OSS/pi-spawnkit/Docs/PRD.md`

## License

MIT