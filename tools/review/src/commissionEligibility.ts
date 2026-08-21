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
  | 'missing-capture'
  | 'missing-build-stamp'
  | 'missing-host-identity';

export function reviewCommissionIneligibility(cell: ReviewCommissionCandidate): ReviewCommissionIneligibility | null {
  if (cell.role === 'reference') return 'reference-cell';
  // ★ A HOLD DOES NOT BLOCK COMMISSIONING, AND MAKING IT DO SO WAS AN OVERREACH. The two answer different
  // questions — commissioning says "capture what this build renders under a new id", holding says "the
  // gate must not treat this cell's failure as a failure yet" — and the user's rule is that a scene stays
  // held UNTIL it has a passing commission. Blocking the commission made that rule unreachable: the only
  // way to progress a held cell was to release the hold, which is the one move meant to be deliberate.
  //
  // A hold still excludes the cell from an APPROVED-cell selection in the UI and still demotes its
  // verdict in the gate; it just no longer stops a new capture being pinned.
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
