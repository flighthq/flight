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
    hostInstanceId: string | null;
    environmentId: string | null;
    build: { commit: string | null } | null;
  }> = {},
) {
  return {
    approval: overrides.approval,
    role: overrides.role ?? 'reviewable',
    hash: overrides.hash === undefined ? 'pixels' : overrides.hash,
    provenance: {
      hostInstanceId: overrides.hostInstanceId === undefined ? 'local-host' : overrides.hostInstanceId,
      environmentId: overrides.environmentId === undefined ? null : overrides.environmentId,
    },
    build: overrides.build === undefined ? { commit: COMMIT } : overrides.build,
  };
}

describe('review commission eligibility', () => {
  it('allows a local capture without a registered environment identity', () => {
    const localCapture = cell({ environmentId: null });

    expect(isReviewCommissionEligible(localCapture)).toBe(true);
  });

  it('distinguishes no capture from a captured cell without a build stamp', () => {
    expect(reviewCommissionIneligibility(cell({ hash: null, build: null }))).toBe('missing-capture');
    expect(reviewCommissionIneligibility(cell({ build: null }))).toBe('missing-build-stamp');
    expect(reviewCommissionIneligibility(cell({ build: { commit: null } }))).toBe('missing-build-stamp');

    expect(reviewCommissionIneligibilityMessage('missing-capture')).toContain('capture this cell');
    expect(reviewCommissionIneligibilityMessage('missing-build-stamp')).toContain(
      're-capture now that the build is complete',
    );
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
    const cells = [cell(), cell({ hash: null }), cell({ build: { commit: null } })];

    expect(selectReviewCommissionCells(cells, (candidate) => candidate.approval)).toEqual([cells[0]]);
  });

  it('selects only approved eligible cells when marks exist', () => {
    const cells = [cell({ approval: true }), cell({ approval: false }), cell({ approval: true, hash: null })];

    expect(selectReviewCommissionCells(cells, (candidate) => candidate.approval)).toEqual([cells[0]]);
  });

  it('drops reference cells even when they are explicitly marked approved', () => {
    const cells = [cell({ approval: true }), cell({ approval: true, role: 'reference' })];

    expect(selectReviewCommissionCells(cells, (candidate) => candidate.approval)).toEqual([cells[0]]);
  });
});
