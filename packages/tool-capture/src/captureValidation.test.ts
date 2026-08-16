import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { setBaselineField } from './baselineStore';
import {
  readCaptureBaselineCoverageManifest,
  writeCaptureBaselineCoverageManifest,
} from './captureBaselineCoverageManifest';
import { setCaptureTimeoutMs } from './captureTimeout';
import {
  explainCaptureParityUncovered,
  formatCaptureParityRanking,
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

  it('names the missing reference instead of blaming the skip list, which is a different remedy', () => {
    // Same eligible count as the skip case above, opposite fix: shortening the skip list does nothing
    // while the reference itself is absent, and the reference can be absent without any skip involved.
    const reason = explainCaptureParityUncovered(3, true, ['webgl-vs-canvas → canvas']);
    expect(reason).toContain('webgl-vs-canvas → canvas');
    expect(reason).toContain('NO pairs');
    expect(reason).not.toContain('parity skip');
  });

  it('still blames ineligibility when NOTHING is eligible, since that is the root cause', () => {
    // The reference is trivially absent when no renderer is eligible at all — reporting the reference
    // there would name a symptom and hide the cause.
    expect(explainCaptureParityUncovered(0, true, ['webgl-vs-canvas → canvas'])).toContain(
      'no renderer in any parity group is eligible',
    );
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

describe('formatCaptureParityRanking', () => {
  it('ranks measured distances widest first and states the median beside them', () => {
    const text = formatCaptureParityRanking([
      { distance: 0.02, entry: 'shape-fill', kind: 'parity', renderers: ['webgl', 'webgpu'] },
      { distance: 11.11, entry: 'effect-glitch', kind: 'parity', renderers: ['webgl', 'webgpu'] },
      { distance: 0.5, entry: 'effect-dither', kind: 'parity', renderers: ['webgl', 'webgpu'] },
    ]);

    // The verdict for all three is "pass"; only the ranking distinguishes them.
    expect(text).toContain('3 compared');
    expect(text!.indexOf('effect-glitch')).toBeLessThan(text!.indexOf('effect-dither'));
    expect(text!.indexOf('effect-dither')).toBeLessThan(text!.indexOf('shape-fill'));
  });

  it('returns null when nothing was compared', () => {
    // An empty ranking would read as agreement; no ranking says the comparison did not happen.
    expect(formatCaptureParityRanking([])).toBeNull();
    expect(formatCaptureParityRanking([{ entry: 'shape-fill', kind: 'baseline' }])).toBeNull();
  });

  it('names how many rows it withheld', () => {
    const many = Array.from({ length: 14 }, (_, index) => ({
      distance: index,
      entry: `scene-${index}`,
      kind: 'parity',
      renderers: ['webgl', 'webgpu'],
    }));

    expect(formatCaptureParityRanking(many)).toContain('4 more not shown');
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

function createRegressionFixture(
  currentSource: string,
  recordedSourceHash: string,
): { root: string; kill: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'capture-regression-freshness-'));
  const scenes = join(root, 'functional', 'scenes');
  mkdirSync(scenes, { recursive: true });
  writeFileSync(join(scenes, 'sample.canvas.ts'), currentSource);
  setBaselineField(root, 'functional', 'sample', 'canvas', 'fingerprint', '2:000000000000000000ffffff');
  setBaselineField(root, 'functional', 'sample', 'canvas', 'sourceHash', recordedSourceHash);
  return { root, kill: vi.fn() };
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

async function validateRegressionFixture(root: string, kill: () => void) {
  return runCaptureValidation({
    subject: 'functional',
    entries: [{ name: 'sample', renderers: ['canvas'] }],
    server: { url: 'http://unused.invalid', kill },
    root,
    gateParity: false,
    // These assert how a FAILURE is classified, so the run legitimately produces a failing summary.
    // Printing it would put a real-looking "✗ FAILED" block in the CI log of a file whose tests all
    // pass, which is the kind of noise that teaches a reader to scroll past a genuine one.
    quiet: true,
    fingerprints: { sample: { canvas: '2:ffffffffffffffffff000000' } },
    browserSession: {
      browser: { close: vi.fn() } as never,
      context: { newPage: vi.fn() } as never,
    },
  });
}

async function validateParityFixture(input: Readonly<Record<string, unknown>>) {
  return runCaptureValidation({
    subject: 'functional',
    entries: [{ name: 'sample', renderers: ['canvas', 'webgl'] }],
    server: { url: 'http://unused.invalid', kill: vi.fn() },
    root: join(tmpdir(), 'tool-capture-parity-reference-fixture'),
    gateParity: true,
    quiet: true,
    // Supplied so neither renderer reloads a page; both are parity-eligible and IDENTICAL, so any pair
    // that gets built passes. A failing pair would confound "no comparison" with "a failed comparison".
    fingerprints: { sample: { canvas: '1:000000', webgl: '1:000000' } },
    browserSession: {
      browser: { close: vi.fn() } as never,
      context: { newPage: vi.fn() } as never,
    },
    ...input,
  } as never);
}

describe('runCaptureValidation', () => {
  // The acceptance path must not become the hole. Writing the manifest from an early return reported
  // exit 0 over a leg with real regression failures — the same "reports green" defect the manifest
  // exists to close, one level up. Coverage is accepted; the run's own verdict still stands.
  it('accepts new coverage WITHOUT masking the regression failures of the same run', async () => {
    const { root, kill } = createRegressionFixture('export const scene = 1;\n', sha256('export const scene = 1;\n'));
    mkdirSync(join(root, 'scripts'), { recursive: true });
    const result = await runCaptureValidation({
      subject: 'functional',
      entries: [{ name: 'sample', renderers: ['canvas'] }],
      server: { url: 'http://unused.invalid', kill },
      root,
      gateParity: false,
      quiet: true,
      updateCoverage: true,
      fingerprints: { sample: { canvas: '2:ffffffffffffffffff000000' } },
      browserSession: {
        browser: { close: vi.fn() } as never,
        context: { newPage: vi.fn() } as never,
      },
    });
    expect(result.regressionFailures).toBe(1);
    expect(result.shouldFail).toBe(true);
    // A target with a FAILING comparison still has baseline evidence, so it is still covered.
    expect(readCaptureBaselineCoverageManifest(root).subjects.functional).toEqual({
      'sample/canvas': ['fingerprint'],
    });
  });

  // The blanket refusal this replaces was too coarse: one flaky target blocked every acceptance. The
  // precise rule is that a run retires only what it POSITIVELY DETERMINED to be uncovered, so a target
  // that never loaded keeps its pin — it cannot be retired by its own flakiness, and it blocks nothing.
  it('keeps the pin of a target it could not load, instead of retiring it', async () => {
    const { root, kill } = createRegressionFixture('export const scene = 1;\n', sha256('export const scene = 1;\n'));
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeCaptureBaselineCoverageManifest(root, 'functional', { 'sample/canvas': ['fingerprint'] });
    const result = await runCaptureValidation({
      subject: 'functional',
      entries: [{ name: 'sample', renderers: ['canvas'] }],
      server: { url: 'http://unused.invalid', kill },
      root,
      gateParity: false,
      quiet: true,
      updateCoverage: true,
      fingerprints: {},
      browserSession: {
        browser: { close: vi.fn() } as never,
        context: { newPage: vi.fn().mockRejectedValue(new Error('page unavailable')) } as never,
      },
    });
    expect(result.loadFailures).toBeGreaterThan(0);
    expect(result.shouldFail).toBe(true);
    expect(readCaptureBaselineCoverageManifest(root).subjects.functional).toEqual({
      'sample/canvas': ['fingerprint'],
    });
  });

  it('falls through to all-pairs when a declared parity reference is skipped', async () => {
    const result = await validateParityFixture({
      entries: [{ name: 'sample', renderers: ['canvas', 'webgl', 'webgpu'] }],
      fingerprints: { sample: { canvas: '1:000000', webgl: '1:000000', webgpu: '1:000000' } },
      parityGroups: { 'ref-group': { targets: ['canvas', 'webgl', 'webgpu'], reference: 'canvas' } },
      paritySkip: { sample: ['canvas'] },
    });

    expect(result.parityPasses + result.parityFailures).toBe(1);
    expect(result.parityUncovered).toBe(0);
    const passed = result.checks.find((check) => check.kind === 'parity' && check.status === 'passed');
    expect(passed?.message).toContain('all-pairs, canvas skipped');
  });

  it("still compares all pairs for a group that declares NO reference, which is that branch's real job", async () => {
    // The negative control for the fix: the all-pairs branch must survive for the case it was written
    // for. Same two renderers, same skip absent — one pair, and the scene is covered.
    const result = await validateParityFixture({
      parityGroups: { 'open-group': { targets: ['canvas', 'webgl'] } },
      paritySkip: {},
    });

    expect(result.parityPasses + result.parityFailures).toBe(1);
    expect(result.parityUncovered).toBe(0);
  });

  it('KEEPS all-pairs when the declared reference is simply not a column in the scene', async () => {
    // NOT the same as a skip, and the difference is 85 real comparisons. The built-in group declares
    // reference 'canvas' once for EVERY scene, and 83 functional scenes have no canvas column at all —
    // 3D material, mesh, light and shadow scenes are webgl/webgpu only. Treating "never there" as
    // "removed" drops the entire 3D suite's cross-backend coverage to a WARN: measured 253 → 168
    // comparisons on the functional suite before this case was split back out.
    const result = await validateParityFixture({
      parityGroups: { visual: { targets: ['dom', 'canvas', 'webgl', 'webgpu'], reference: 'canvas' } },
      paritySkip: {},
      entries: [{ name: 'sample', renderers: ['webgl', 'webgpu'] }],
      fingerprints: { sample: { webgl: '1:000000', webgpu: '1:000000' } },
    });

    expect(result.parityPasses + result.parityFailures).toBe(1);
    expect(result.parityUncovered).toBe(0);
    // The coverage is KEPT and the claim is made TRUE. Keeping the pairs while still labelling them
    // 'visual:webgl·webgpu' is the false-claim state: the group asserts a canvas reference it never
    // used. Asserting the label is what stops coverage and honesty from drifting apart.
    const passed = result.checks.find((check) => check.kind === 'parity' && check.status === 'passed');
    expect(passed?.message).toContain('all-pairs, no canvas column');
  });

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
      quiet: true,
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

  it('classifies a failed regression with a changed scene source as recapture debt', async () => {
    const fixture = createRegressionFixture('changed scene', sha256('captured scene'));
    try {
      const result = await validateRegressionFixture(fixture.root, fixture.kill);
      const failure = result.checks.find((check) => check.kind === 'regression');

      expect(result.shouldFail).toBe(true);
      expect(failure).toMatchObject({
        currentSourceHash: sha256('changed scene'),
        recordedSourceHash: sha256('captured scene'),
        sourceHashStatus: 'changed',
      });
      expect(failure?.message).toContain('recapture owed by the scene owner');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('classifies a failed regression with unchanged scene source as environment drift', async () => {
    const source = 'unchanged scene';
    const fixture = createRegressionFixture(source, sha256(source));
    try {
      const result = await validateRegressionFixture(fixture.root, fixture.kill);
      const failure = result.checks.find((check) => check.kind === 'regression');

      expect(result.shouldFail).toBe(true);
      expect(failure).toMatchObject({
        currentSourceHash: sha256(source),
        recordedSourceHash: sha256(source),
        sourceHashStatus: 'unchanged',
      });
      expect(failure?.message).toContain('environment drift; never rebaseline');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
