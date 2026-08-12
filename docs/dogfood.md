# Local dogfood evidence

Date: 2026-08-07 UTC

Scope: loaded the local checkout as a temporary Pi package and ran the SpawnKit doctor path plus the harmless child `pi --version` smoke. No secrets were printed, no global PATH was edited, no shell profile was edited, and no npm publish/install-to-global action was performed.

## Local package load

Command:

```bash
pi --mode json --no-session --offline --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files -e . "/spawnkit:doctor"
```

Result: exit code `0`; Pi emitted a JSON session record, confirming the local package loaded through `-e .`. In non-interactive JSON/print mode, `/spawnkit:doctor` uses `ctx.ui.notify`, so the notification body is not printed to stdout.

## Doctor summary

Collected from the same local checkout by importing `collectSpawnkitDoctorDiagnostics({ smoke: true })`:

```json
{
  "platform": "win32",
  "pathEntryCount": 65,
  "piBin": "<unset>",
  "foundCandidateCount": 2,
  "selectedSpawnPlan": {
    "command": "C:\\Users\\alice\\AppData\\Roaming\\npm\\pi.cmd",
    "argsPrefix": [],
    "confidence": "high",
    "envPatchKeys": ["PI_BIN", "PATH"],
    "warnings": []
  },
  "sessionEnvPatch": {
    "status": "not_run",
    "reason": "session-start env patch has not run in this process."
  },
  "warnings": []
}
```

## Historical Child `pi --version` SpawnPlan smoke (before the launcher fix)

```json
{
  "status": "found_but_not_runnable",
  "args": ["--version"],
  "timeoutMs": 3000,
  "timedOut": false,
  "exitCode": null,
  "errorCode": "EINVAL",
  "versionText": "<unavailable>"
}
```

The username in the absolute Windows path above is normalized to `alice` for repo-safe documentation; the observed plan used the same absolute npm-shim path shape, not an expandable `%APPDATA%` placeholder.

Control check: direct shell `pi --version` returned `0.83.0` in the same terminal. The SpawnPlan smoke result above is intentionally recorded as observed dogfood evidence for the Windows npm-shim setup, not as a passing result.

## Cross-platform launcher fix

Date: 2026-08-12 UTC

The launcher adapter now sends Windows npm shims through the same `ComSpec /d /s /c call ...` route for both smoke tests and real child launches. The local Windows dogfood control now reports:

```json
{
  "status": "ok",
  "invocation": {
    "command": "C:\\Windows\\System32\\cmd.exe",
    "argsPrefix": ["/d", "/s", "/c", "call ...\\pi.cmd ..."],
    "windowsVerbatimArguments": true
  },
  "versionText": "0.84.1"
}
```

POSIX invocation remains direct (`pi` is not routed through a shell). Unit coverage exercises the macOS/POSIX direct plan, Windows `.cmd` plan, Git Bash shim plan, and the session-start smoke path. A physical macOS run was not available on this Windows host; the POSIX path is covered by the platform-injected tests.
