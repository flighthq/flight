/**
 * The gate's exit status, given how the comparison ended and how many capture targets failed.
 *
 * ★ A CAPTURE FAILURE MUST NOT BE ABLE TO EXIT ZERO. The comparison step is the one that prints a verdict
 * per cell, so it is the natural thing to read as "the answer" — but a target that never captured is
 * absent from that list rather than failing in it, and a run whose captures half-failed would otherwise
 * report the comparison's clean exit and look green. That is the shape this whole gate exists to avoid:
 * a smaller population reported as a passing one.
 *
 * The comparison's own status wins when both are non-zero, so the number a reader sees still names the
 * step whose output they were just reading.
 */
export function resolveGateExitStatus(checkStatus: number, captureFailureCount: number): number {
  if (checkStatus !== 0) return checkStatus;
  return captureFailureCount > 0 ? 1 : 0;
}
