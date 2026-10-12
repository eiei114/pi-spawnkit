export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_NAMES = ["@earendil-works/pi-agent-core", "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"];
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/u).flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function doctorDiagnostics(responses) {
  const notification = responses.find((row) => row?.type === "extension_ui_request" && row.method === "notify"
    && typeof row.message === "string");
  if (!notification) return undefined;
  try { return JSON.parse(notification.message); } catch { return undefined; }
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

export function behaviorAssertions(name, input) {
  const { responses = [], commandNames = [], promptResponse, fullOutput = "", exit_code = 1,
    processExited = false, expectedVersion, piCli } = input;
  const diagnostics = doctorDiagnostics(responses);
  const clean = processExited && exit_code === 0 && !UNHANDLED_ERROR_PATTERN.test(fullOutput);

  if (name === "extension_load") {
    const registered = commandNames.includes("spawnkit:doctor");
    return [assertion("extension_registered", "Actual Pi RPC get_commands lists the package's registered spawnkit:doctor extension command",
      commandNames, clean && registered)];
  }
  if (name === "happy_path") {
    const smoke = diagnostics?.smoke;
    const responded = diagnostics?.platform && diagnostics?.sessionEnvPatch?.status === "disabled"
      && diagnostics?.spawnPlan?.command === piCli
      && smoke?.status === "ok" && smoke?.versionText === expectedVersion && promptResponse?.success === true;
    return [assertion("feature_response", "The real /spawnkit:doctor command returns diagnostics and successfully smokes the pinned Pi executable",
      diagnostics ? { platform: diagnostics.platform, command: diagnostics.spawnPlan?.command?.split(/[\\/]/u).at(-1),
        confidence: diagnostics.spawnPlan?.confidence,
        smoke: { status: smoke?.status, versionText: smoke?.versionText, exitCode: smoke?.exitCode },
        prompt_success: promptResponse?.success } : null,
      clean && responded)];
  }
  if (name === "error_path") {
    const smoke = diagnostics?.smoke;
    const handled = smoke?.status === "not_found" && smoke?.errorCode === "ENOENT"
      && diagnostics?.sessionEnvPatch?.status === "disabled"
      && diagnostics?.spawnPlan?.confidence === "configured" && promptResponse?.success === true;
    return [assertion("handled_error", "An invalid configured Pi executable is reported as a handled not-found diagnostic without crashing Pi",
      diagnostics ? { smoke: { status: smoke?.status, errorCode: smoke?.errorCode }, confidence: diagnostics.spawnPlan?.confidence,
        prompt_success: promptResponse?.success } : null,
      clean && handled)];
  }
  if (name === "reload_cleanup") {
    const secondResponses = input.secondResponses ?? [];
    const secondCommandNames = input.secondCommandNames ?? [];
    const secondPromptResponse = input.secondPromptResponse;
    const secondOutput = input.secondOutput ?? "";
    const secondExitCode = input.secondExitCode ?? 1;
    const firstExited = input.firstExited === true;
    const secondExited = input.secondExited === true;
    const second = doctorDiagnostics(secondResponses);
    const reloadClean = firstExited && secondExited && processExited && exit_code === 0 && secondExitCode === 0
      && !UNHANDLED_ERROR_PATTERN.test(`${fullOutput}\n${secondOutput}`);
    return [
      assertion("reloaded_extension_registered", "A second real Pi host registers the spawnkit:doctor extension command",
        secondCommandNames, reloadClean && secondCommandNames.includes("spawnkit:doctor")),
      assertion("reloaded_feature_response", "The second host returns the actual doctor response and a successful pinned-Pi smoke",
        second ? { platform: second.platform, command: second.spawnPlan?.command?.split(/[\\/]/u).at(-1),
          smoke: { status: second.smoke?.status, versionText: second.smoke?.versionText, exitCode: second.smoke?.exitCode },
          prompt_success: secondPromptResponse?.success } : null,
        reloadClean && second?.platform && second?.smoke?.status === "ok"
          && second?.sessionEnvPatch?.status === "disabled"
          && second?.smoke?.versionText === expectedVersion && second?.spawnPlan?.command === piCli
          && secondPromptResponse?.success === true),
      assertion("clean_shutdown", "Both actual Pi hosts exit zero without unhandled or shutdown errors",
        { first_exit_code: exit_code, second_exit_code: secondExitCode,
          first_exited: firstExited, second_exited: secondExited,
          errors: UNHANDLED_ERROR_PATTERN.test(`${fullOutput}\n${secondOutput}`) },
        reloadClean),
    ];
  }
  if (name === "host_shell") {
    const observed = fullOutput.trim();
    return [assertion("native_shell_boundary", "The native host shell launches the pinned local Pi CLI and returns its exact version",
      { exit_code, process_exited: processExited, output: observed, expectedVersion },
      processExited && exit_code === 0 && observed === expectedVersion)];
  }
  throw new Error(`Unknown smoke case: ${name}`);
}
