import type { Skeleton2DCoercedInterpolationGuard, Skeleton2DDeformLengthGuard } from '@flighthq/types/contract';

/**
 * The seams this package's silent behaviours report through.
 *
 * Core holds the slot and nothing else — no message, no logger, no dependency on one. `enableSkeleton2DGuards`
 * is what fills the slots, and until a caller opts in every `report*` here is a null check and a return. That
 * is the diagnostics inversion rule: the seam lives with the code that knows the fact, the wording lives in a
 * module a shipped build never has to import.
 *
 * The slots are set rather than accumulated, so enabling twice installs one guard rather than two.
 */
export function reportSkeleton2DCoercedInterpolation(subject: string, stated: string, applied: string): void {
  if (_coercedInterpolationGuard === null) return;
  _coercedInterpolationGuard({ applied, stated, subject });
}

export function reportSkeleton2DDeformLengthMismatch(subject: string, offsets: number, addressed: number): void {
  if (_deformLengthGuard === null) return;
  _deformLengthGuard({ addressed, offsets, subject });
}

export function setSkeleton2DCoercedInterpolationGuard(guard: Skeleton2DCoercedInterpolationGuard | null): void {
  _coercedInterpolationGuard = guard;
}

export function setSkeleton2DDeformLengthGuard(guard: Skeleton2DDeformLengthGuard | null): void {
  _deformLengthGuard = guard;
}

let _coercedInterpolationGuard: Skeleton2DCoercedInterpolationGuard | null = null;
let _deformLengthGuard: Skeleton2DDeformLengthGuard | null = null;
