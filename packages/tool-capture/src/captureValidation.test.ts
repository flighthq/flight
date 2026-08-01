import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { setCaptureTimeoutMs } from './captureTimeout';
import {
  explainCaptureParityUncovered,
  isCaptureRegressionCoverageFailure,
  isUniformCaptureFingerprint,
  explainCaptureVerificationStall,
  isCaptureParityCoverageFailure,
  runCaptureValidation,
} from './captureValidation';

const COVERED: Readonly<Parameters<typeof isCaptureParityCoverageFailure>[0]> = {
  gateParity: true,
  interrupted: false,
  parityComparisons: 0,
  parityUncovered: 1,
  rendererFilterCount: 0,
};

describe('explainCaptureParityUncovered', () => {
  it('names the remedy for an ineligible backend, which differs from the one-backend case', () => {
    // The two states look identical in a "0 comparisons" summary but need opposite fixes, which is why
    // the reason is data rather than a bare skip.
    expect(explainCaptureParityUncovered(0, false)).toContain('parity group');
    expect(explainCaptureParityUncovered(1, false)).toContain('nothing to compare it against');
  });

  it('points at group membership rather than baselines when groups are declared', () => {
    expect(explainCaptureParityUncovered(0, true)).toContain('parity group');
    expect(explainCaptureParityUncovered(0, true)).not.toContain('fingerprint baseline');
  });

  it('blames the skip list when several backends were eligible and still produced no pair', () => {
    expect(explainCaptureParityUncovered(3, false)).toContain('parity skip');
  });
});

describe('explainCaptureVerificationStall', () => {
  it('distinguishes a verifier that never registered from one that started and stalled', () => {
    // Opposite remedies: the first is a page/module failure, the second a readback that never finished.
    // The bare "verifier did not run" it replaces covered both.
    expect(explainCaptureVerificationStall(null, 15_000)).toContain('never registered');
    expect(explainCaptureVerificationStall({ state: 'running' }, 15_000)).toContain('stalled');
  });

  it('reports what it waited AGAINST the budget, the number that decides if cost is the cause', () => {
    const reason = explainCaptureVerificationStall({ state: 'running' }, 15_000);
    expect(reason).toContain('15000ms of 15000ms');
    // A short wait is a different story from one that burned the whole budget, and the reason shows it.
    expect(explainCaptureVerificationStall({ state: 'running' }, 900)).toContain('900ms of 15000ms');
  });

  // The reason and the wait must never disagree about what the budget was — a message that names a
  // budget the wait did not use is worse than no message, since the whole point of it is to be trusted
  // about how long the wait actually had. Both read the same seam, so a raised budget moves both.
  it('reports the configured budget, not the compiled-in default', () => {
    setCaptureTimeoutMs(45_000);
    try {
      expect(explainCaptureVerificationStall({ state: 'running' }, 20_000)).toContain('20000ms of 45000ms');
    } finally {
      setCaptureTimeoutMs(null);
    }
  });

  it('names the empty-readback case, which looks like success until the fingerprint is read', () => {
    expect(explainCaptureVerificationStall({ fingerprint: null, state: 'passed' }, 4_000)).toContain('no fingerprint');
  });

  it('flags a stateless verifier object as a protocol mismatch rather than a stall', () => {
    expect(explainCaptureVerificationStall({}, 4_000)).toContain('protocol');
  });
});

describe('isCaptureParityCoverageFailure', () => {
  it('FAILS a gated run that compared nothing while entries wanted a comparison', () => {
    // The defect this gate exists for: 107 entries skipped, leg green.
    expect(isCaptureParityCoverageFailure({ ...COVERED, parityUncovered: 107 })).toBe(true);
  });

  it('passes as soon as a single comparison actually ran', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, parityComparisons: 1 })).toBe(false);
  });

  it('does not fire when parity is not being gated', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, gateParity: false })).toBe(false);
  });

  it('exempts an interrupted run, whose remaining entries never ran', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, interrupted: true })).toBe(false);
  });

  it('exempts a run narrowed to ONE renderer, which cannot compare by construction', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, rendererFilterCount: 1 })).toBe(false);
    // Two named renderers can still disagree, so that narrowing stays gated.
    expect(isCaptureParityCoverageFailure({ ...COVERED, rendererFilterCount: 2 })).toBe(true);
  });

  it('does not fire when nothing wanted a comparison in the first place', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, parityUncovered: 0 })).toBe(false);
  });
});

describe('isCaptureRegressionCoverageFailure', () => {
  const UNCOVERED = {
    gateRegression: true,
    interrupted: false,
    regressionComparisons: 0,
    regressionUncovered: 100,
  };

  it('FAILS a gated regression leg that compared nothing, the inert-tier defect', () => {
    // 0 passed / 0 failed / 100 skipped used to read as a clean pass.
    expect(isCaptureRegressionCoverageFailure(UNCOVERED)).toBe(true);
  });

  it('passes as soon as one comparison actually ran', () => {
    expect(isCaptureRegressionCoverageFailure({ ...UNCOVERED, regressionComparisons: 1 })).toBe(false);
  });

  it('does not fire when regression is not being gated, or when the run was interrupted', () => {
    expect(isCaptureRegressionCoverageFailure({ ...UNCOVERED, gateRegression: false })).toBe(false);
    expect(isCaptureRegressionCoverageFailure({ ...UNCOVERED, interrupted: true })).toBe(false);
  });

  it('does not fire when nothing wanted a comparison', () => {
    expect(isCaptureRegressionCoverageFailure({ ...UNCOVERED, regressionUncovered: 0 })).toBe(false);
  });
});

describe('isUniformCaptureFingerprint', () => {
  it('rejects a fingerprint whose cells are all identical, the blank frame a stability check cannot catch', () => {
    // The real shape that was blessed once: every cell the same colour.
    expect(isUniformCaptureFingerprint('16:' + 'eeddcc'.repeat(256))).toBe(true);
  });

  it('accepts a frame that varies anywhere, including in only one cell', () => {
    expect(isUniformCaptureFingerprint('16:' + 'eeddcc'.repeat(255) + '112233')).toBe(false);
    expect(isUniformCaptureFingerprint('16:112233' + 'eeddcc'.repeat(255))).toBe(false);
  });

  it('treats a single-cell or empty payload as uniform, since it can distinguish nothing', () => {
    expect(isUniformCaptureFingerprint('1:aabbcc')).toBe(true);
    expect(isUniformCaptureFingerprint('16:')).toBe(true);
  });
});

describe('runCaptureValidation', () => {
  it('is a callable fingerprint-validation orchestrator', () => {
    expect(typeof runCaptureValidation).toBe('function');
  });

  it('does not reload a target when capture already supplied its passed fingerprint', async () => {
    const newPage = vi.fn();
    const kill = vi.fn();
    const result = await runCaptureValidation({
      subject: 'reuse-fixture',
      entries: [{ name: 'sample', renderers: ['canvas'] }],
      server: { url: 'http://unused.invalid', kill },
      root: join(tmpdir(), 'tool-capture-reuse-fixture'),
      report: true,
      fingerprints: { sample: { canvas: '1:000000' } },
      browserSession: {
        browser: { close: vi.fn() } as never,
        context: { newPage } as never,
      },
    });

    expect(newPage).not.toHaveBeenCalled();
    expect(result.loadFailures).toBe(0);
    expect(result.skipped).toBe(1);
    expect(kill).toHaveBeenCalledOnce();
  });
});
