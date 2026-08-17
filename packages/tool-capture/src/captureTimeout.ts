// The wall-clock budget for a single capture wait — a page load, a frame-reached poll, or a wait for
// the in-page verifier to reach a terminal state. One number governs all of them on purpose: they are
// the same question ("how long may one page take before we call it stalled?"), and a run that has to
// be given more room on a slow or contended machine needs every one of them to move together.
//
// It is resolved from a flag or the environment rather than edited in source because the value is a
// property of the MACHINE, not of the code: the same budget that is generous on a developer laptop is
// tight on a CI runner sharing one software adapter between concurrent workers. A constant that has to
// be edited to run somewhere else is a constant that gets edited and committed for one environment,
// then silently governs every other.
export function getCaptureTimeoutMs(): number {
  return captureTimeoutMs ?? resolveCaptureTimeoutMs(undefined, process.env['FLIGHT_CAPTURE_TIMEOUT_MS']);
}

// The flag wins over the environment, which wins over the default — the same precedence
// resolveCaptureWorkerCount uses, so the two knobs are configured the same way.
//
// A value that is not a positive finite number is ignored rather than honored: a zero or negative
// budget would make every wait expire immediately and report every page as stalled, which reads as a
// fleet-wide rendering failure rather than as the typo it is.
export function resolveCaptureTimeoutMs(
  timeoutFlag: string | undefined,
  environmentOverride: string | undefined,
): number {
  return parseCaptureTimeoutMs(timeoutFlag) ?? parseCaptureTimeoutMs(environmentOverride) ?? DEFAULT_CAPTURE_TIMEOUT_MS;
}

// Pins the budget for the rest of the process, so a CLI flag reaches the capture and validation waits
// without threading a parameter through every call. Passing null restores environment/default
// resolution, which is what a test that pinned a budget uses to put it back.
export function setCaptureTimeoutMs(timeoutMs: number | null): void {
  captureTimeoutMs = timeoutMs;
}

function parseCaptureTimeoutMs(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

let captureTimeoutMs: number | null = null;

// Evidence basis, deliberately stated as a bound rather than folklore: on 2026-08-16, two full-suite
// runs at 15s produced a moving tail of capture timeouts on one contended SwiftShader host; the same
// full suite at 45s completed 491 captures with zero timeout signatures. No intermediate value and no
// second host were measured, so 45s is the only observed-safe default, NOT a calibrated failure cliff.
// The flag/environment override remains the right tool when another host needs a different budget.
const DEFAULT_CAPTURE_TIMEOUT_MS = 45_000;
