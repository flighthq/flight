import type { ReviewCellRole } from './cellRole';

export interface ReviewCommissionCandidate {
  role: ReviewCellRole;
  referencePixelSha256: string | null;
  provenance: { hostInstanceId: string | null } | null;
  build: { commit: string | null } | null;
  holdReason: string | null;
}

export type ReviewCommissionIneligibility =
  | 'reference-cell'
  | 'held'
  | 'missing-capture'
  | 'missing-build-stamp'
  | 'missing-host-identity';

export function reviewCommissionIneligibility(cell: ReviewCommissionCandidate): ReviewCommissionIneligibility | null {
  if (cell.role === 'reference') return 'reference-cell';
  // A hold is per-cell, and it excludes only the cell it names. It used to disable the whole test's
  // commission button, which fused two decisions that are not the same one: holding says "this picture is
  // not one to bless", commissioning says "capture what this build renders". A scene with one bad backend
  // then could not have its other three backends commissioned at all, so the way out of a hold was to
  // release it — which is the one move that is not supposed to be casual.
  if (cell.holdReason !== null) return 'held';
  if (cell.referencePixelSha256 === null) return 'missing-capture';
  if (cell.build === null || cell.build.commit === null) return 'missing-build-stamp';
  if (cell.provenance === null || cell.provenance.hostInstanceId === null) return 'missing-host-identity';
  return null;
}

export function isReviewCommissionEligible(cell: ReviewCommissionCandidate): boolean {
  return reviewCommissionIneligibility(cell) === null;
}

export function reviewCommissionIneligibilityMessage(reason: ReviewCommissionIneligibility): string {
  if (reason === 'reference-cell') {
    return 'Reference cell — shown as context, never approved or commissioned.';
  }
  if (reason === 'held') {
    return 'Held — this cell is excluded from the commission; its siblings can still be commissioned.';
  }
  if (reason === 'missing-capture') {
    return 'No capture available — capture this cell before commissioning.';
  }
  if (reason === 'missing-build-stamp') {
    return 'Capture has no build stamp — re-capture now that the build is complete.';
  }
  return 'Capture has no host identity — re-capture so the machine identity is recorded.';
}

export function selectReviewCommissionCells<T extends ReviewCommissionCandidate>(
  cells: readonly T[],
  approvalFor: (cell: T) => boolean | undefined,
): T[] {
  const hasMarks = cells.some((cell) => approvalFor(cell) !== undefined);
  return cells.filter((cell) => isReviewCommissionEligible(cell) && (!hasMarks || approvalFor(cell) === true));
}
