import { describe, expect, it } from 'vitest';

import {
  isReviewCommissionEligible,
  reviewCommissionIneligibility,
  reviewCommissionIneligibilityMessage,
  selectReviewCommissionCells,
} from '../tools/review/src/commissionEligibility';

const COMMIT = 'a'.repeat(40);

function cell(
  overrides: Partial<{
    approval: boolean;
    role: 'reviewable' | 'reference';
    hash: string | null;
    referencePixelSha256: string | null;
    hostInstanceId: string | null;
    environmentId: string | null;
    build: { commit: string | null } | null;
    holdReason: string | null;
  }> = {},
) {
  return {
    approval: overrides.approval,
    role: overrides.role ?? 'reviewable',
    hash: overrides.hash === undefined ? 'pixels' : overrides.hash,
    referencePixelSha256:
      overrides.referencePixelSha256 === undefined ? 'reference-pixels' : overrides.referencePixelSha256,
    provenance: {
      hostInstanceId: overrides.hostInstanceId === undefined ? 'local-host' : overrides.hostInstanceId,
      environmentId: overrides.environmentId === undefined ? null : overrides.environmentId,
    },
    build: overrides.build === undefined ? { commit: COMMIT } : overrides.build,
    holdReason: overrides.holdReason ?? null,
  };
}

describe('review commission eligibility', () => {
  it('allows a local capture without a registered environment identity', () => {
    const localCapture = cell({ environmentId: null });

    expect(isReviewCommissionEligible(localCapture)).toBe(true);
  });

  it('distinguishes no capture from a captured cell without a build stamp', () => {
    expect(reviewCommissionIneligibility(cell({ referencePixelSha256: null, build: null }))).toBe('missing-capture');
    expect(reviewCommissionIneligibility(cell({ hash: null }))).toBe(null);
    expect(reviewCommissionIneligibility(cell({ build: null }))).toBe('missing-build-stamp');
    expect(reviewCommissionIneligibility(cell({ build: { commit: null } }))).toBe('missing-build-stamp');

    expect(reviewCommissionIneligibilityMessage('missing-capture')).toContain('capture this cell');
    expect(reviewCommissionIneligibilityMessage('missing-build-stamp')).toContain(
      're-capture now that the build is complete',
    );
  });

  // ★ A HOLD NO LONGER BLOCKS COMMISSIONING. It used to return 'held' here, which made the rule "a scene
  // stays held until it has a passing commission" unreachable — the only way to progress a held cell was
  // to release its hold, and releasing is the deliberate move. The two answer different questions:
  // commissioning pins what this build renders, holding governs whether the gate treats a failure as one.
  it('commissions a held cell, because holding and commissioning are different decisions', () => {
    expect(reviewCommissionIneligibility(cell({ holdReason: 'canvas does not implement the fold' }))).toBe(null);
    expect(isReviewCommissionEligible(cell({ holdReason: 'reason' }))).toBe(true);
  });

  it('requires the host identity that the commission endpoint also requires', () => {
    expect(reviewCommissionIneligibility(cell({ hostInstanceId: null }))).toBe('missing-host-identity');
  });

  it('never makes a contextual reference cell commissionable', () => {
    const reference = cell({ role: 'reference' });

    expect(reviewCommissionIneligibility(reference)).toBe('reference-cell');
    expect(isReviewCommissionEligible(reference)).toBe(false);
    expect(reviewCommissionIneligibilityMessage('reference-cell')).toContain('never approved or commissioned');
  });
});

describe('selectReviewCommissionCells', () => {
  it('falls back to every eligible cell when there are no per-cell marks', () => {
    const cells = [cell(), cell({ referencePixelSha256: null }), cell({ build: { commit: null } })];

    expect(selectReviewCommissionCells(cells, (candidate) => candidate.approval)).toEqual([cells[0]]);
  });

  it('selects only approved eligible cells when marks exist', () => {
    const cells = [
      cell({ approval: true }),
      cell({ approval: false }),
      cell({ approval: true, referencePixelSha256: null }),
    ];

    expect(selectReviewCommissionCells(cells, (candidate) => candidate.approval)).toEqual([cells[0]]);
  });

  it('includes a held cell when the reviewer approved it', () => {
    const cells = [cell({ approval: true }), cell({ approval: true, holdReason: 'canvas is wrong' })];

    expect(selectReviewCommissionCells(cells, (candidate) => candidate.approval)).toEqual(cells);
  });

  it('drops reference cells even when they are explicitly marked approved', () => {
    const cells = [cell({ approval: true }), cell({ approval: true, role: 'reference' })];

    expect(selectReviewCommissionCells(cells, (candidate) => candidate.approval)).toEqual([cells[0]]);
  });
});
