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
    "command": "%APPDATA%\\npm\\pi.cmd",
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

## Child `pi --version` SpawnPlan smoke

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

Control check: direct shell `pi --version` returned `0.83.0` in the same terminal. The SpawnPlan smoke result above is intentionally recorded as observed dogfood evidence for the Windows npm-shim setup.
