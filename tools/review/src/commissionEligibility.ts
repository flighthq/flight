export interface ReviewCommissionCandidate {
  hash: string | null;
  provenance: { hostInstanceId: string | null } | null;
  build: { commit: string | null } | null;
}

export type ReviewCommissionIneligibility = 'missing-capture' | 'missing-build-stamp' | 'missing-host-identity';

export function reviewCommissionIneligibility(cell: ReviewCommissionCandidate): ReviewCommissionIneligibility | null {
  if (cell.hash === null) return 'missing-capture';
  if (cell.build === null || cell.build.commit === null) return 'missing-build-stamp';
  if (cell.provenance === null || cell.provenance.hostInstanceId === null) return 'missing-host-identity';
  return null;
}

export function isReviewCommissionEligible(cell: ReviewCommissionCandidate): boolean {
  return reviewCommissionIneligibility(cell) === null;
}

export function reviewCommissionIneligibilityMessage(reason: ReviewCommissionIneligibility): string {
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
