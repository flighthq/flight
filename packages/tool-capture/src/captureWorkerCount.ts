import { availableParallelism } from 'node:os';

export function resolveCaptureWorkerCount(
  parallelFlag: string | undefined,
  environmentOverride: string | undefined,
  parallelism = availableParallelism(),
): number {
  const requested = parseCaptureWorkerCount(parallelFlag) ?? parseCaptureWorkerCount(environmentOverride);
  if (requested !== null) return requested;

  const workerCountWithHeadroom = Math.max(1, Math.floor(parallelism) - CAPTURE_WORKER_COUNT_HEADROOM);
  return Math.min(workerCountWithHeadroom, EXPEDIENT_CAPTURE_WORKER_COUNT_CEILING);
}

function parseCaptureWorkerCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.max(1, parsed) : null;
}

const CAPTURE_WORKER_COUNT_HEADROOM = 1;

// EXPEDIENT: keep the automatic default at four or fewer while burst I/O can exhaust descriptors on
// the workspace mount. This ceiling is not the root sizing rule: available CPU parallelism minus one
// worker of host headroom remains the input, and explicit CLI/environment pins deliberately bypass it.
const EXPEDIENT_CAPTURE_WORKER_COUNT_CEILING = 4;
