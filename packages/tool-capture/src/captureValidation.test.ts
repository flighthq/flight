import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  explainCaptureParityUncovered,
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
