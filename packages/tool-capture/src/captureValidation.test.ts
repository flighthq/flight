import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { getBaselineField, setBaselineField } from './baselineStore';
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
  parityUndeclaredUncovered: 1,
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
    const reason = explainCaptureVerificationStall({ state: 'running' }, 45_000);
    expect(reason).toContain('45000ms of 45000ms');
    // A short wait is a different story from one that burned the whole budget, and the reason shows it.
    expect(explainCaptureVerificationStall({ state: 'running' }, 900)).toContain('900ms of 45000ms');
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
      {
        distance: 0.02,
        entry: 'shape-fill',
        fixtureBackgroundMismatch: false,
        kind: 'parity',
        renderers: ['webgl', 'webgpu'],
      },
      {
        distance: 11.11,
        entry: 'effect-glitch',
        fixtureBackgroundMismatch: true,
        kind: 'parity',
        renderers: ['webgl', 'webgpu'],
      },
      { distance: 0.5, entry: 'effect-dither', kind: 'parity', renderers: ['webgl', 'webgpu'] },
    ]);

    // The verdict for all three is "pass"; only the ranking distinguishes them.
    expect(text).toContain('3 compared');
    expect(text!.indexOf('effect-glitch')).toBeLessThan(text!.indexOf('effect-dither'));
    expect(text!.indexOf('effect-dither')).toBeLessThan(text!.indexOf('shape-fill'));
    expect(text).toContain('fixture backgrounds match');
    expect(text).toContain('fixture backgrounds DIFFER');
  });

  // ★ THE ROW THAT CARRIES NO DETERMINATION MUST SAY SO. `effect-dither` above has no
  // `fixtureBackgroundMismatch`, and an absent field is not a clean one — it means nothing established
  // whether the two fixtures agree. A ranking that printed nothing there, or printed the same words as a
  // matching pair, would turn "not checked" into "checked and fine" in the one place a reader is
  // scanning for what to distrust.
  it('says NOT CHECKED for a row whose fixture backgrounds were never compared', () => {
    const text = formatCaptureParityRanking([
      { distance: 0.5, entry: 'effect-dither', kind: 'parity', renderers: ['webgl', 'webgpu'] },
    ]);

    expect(text).toContain('fixture background: NOT CHECKED');
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
  it('FAILS a gated run that compared nothing while undeclared entries wanted a comparison', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, parityUndeclaredUncovered: 107 })).toBe(true);
  });

  it('does not fail when all uncovered entries are declared skips or structural', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, parityUncovered: 107, parityUndeclaredUncovered: 0 })).toBe(
      false,
    );
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
    expect(isCaptureParityCoverageFailure({ ...COVERED, rendererFilterCount: 2 })).toBe(true);
  });

  it('does not fire when nothing wanted a comparison in the first place', () => {
    expect(isCaptureParityCoverageFailure({ ...COVERED, parityUncovered: 0, parityUndeclaredUncovered: 0 })).toBe(
      false,
    );
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
  setBaselineField(root, 'functional', 'sample', 'canvas', 'fingerprint', '2:000000000000000000ffffff', {
    computationId: 'grid-average-rgb-v1',
    frames: 1,
    sourceHash: recordedSourceHash,
    targetKind: 'canvas',
    verifyPublished: true,
    warmupFrames: 0,
  });
  return { root, kill: vi.fn() };
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

const UPDATE_PROVENANCE = {
  computationId: 'grid-average-rgb-v1',
  frames: 1,
  sourceHash: 'a'.repeat(64),
  targetKind: 'canvas',
  verifyPublished: true,
  warmupFrames: 0,
} as const;

function updateBrowserSession(fingerprint: string) {
  const page = {
    $eval: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({
      coverage: 1,
      fingerprint,
      render: 'canvas',
      state: 'passed',
    }),
    evaluateHandle: vi.fn().mockResolvedValue({ asElement: () => null, dispose: vi.fn() }),
    goto: vi.fn(),
    on: vi.fn(),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
  };
  const newPage = vi.fn().mockResolvedValue(page);
  return {
    newPage,
    session: {
      browser: { close: vi.fn() } as never,
      context: { newPage } as never,
    },
  };
}

async function validateRegressionFixture(root: string, kill: () => void, fingerprint = '2:ffffffffffffffffff000000') {
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
    fingerprints: { sample: { canvas: fingerprint } },
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
  it('refuses the known sha256-only bitmap-transform-rotation/canvas cell before browser work', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tool-capture-update-unpinned-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      setBaselineField(
        root,
        'functional',
        'bitmap-transform-rotation',
        'canvas',
        'sha256',
        'b'.repeat(64),
        UPDATE_PROVENANCE,
      );
      writeCaptureBaselineCoverageManifest(root, 'functional', {
        'bitmap-transform-rotation/canvas': ['sceneAssertion', 'screenshot'],
      });
      const fingerprint = '2:000000000000000000ffffff';
      const browser = updateBrowserSession(fingerprint);

      const result = await runCaptureValidation({
        subject: 'functional',
        entries: [{ name: 'bitmap-transform-rotation', renderers: ['canvas'] }],
        server: { url: 'http://unused.invalid', kill: vi.fn() },
        root,
        gateParity: false,
        quiet: true,
        updateFingerprints: true,
        fingerprints: { 'bitmap-transform-rotation': { canvas: fingerprint } },
        fingerprintProvenance: { 'bitmap-transform-rotation': { canvas: UPDATE_PROVENANCE } },
        browserSession: browser.session,
      });

      expect(browser.newPage).not.toHaveBeenCalled();
      expect(result).toMatchObject({ shouldFail: true, updated: 0 });
      expect(result.checks).toContainEqual(
        expect.objectContaining({
          entry: 'bitmap-transform-rotation',
          kind: 'baseline',
          status: 'failed',
          message: expect.stringContaining('not authorized by the committed coverage manifest'),
        }),
      );
      expect(getBaselineField(root, 'functional', 'bitmap-transform-rotation', 'canvas', 'fingerprint')).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('refreshes the manifested fingerprint for bitmap-color-transform/canvas', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tool-capture-update-pinned-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      setBaselineField(
        root,
        'functional',
        'bitmap-color-transform',
        'canvas',
        'fingerprint',
        '2:ffffff000000000000000000',
        UPDATE_PROVENANCE,
      );
      writeCaptureBaselineCoverageManifest(root, 'functional', {
        'bitmap-color-transform/canvas': ['fingerprint', 'sceneAssertion', 'screenshot'],
      });
      const fingerprint = '2:000000000000000000ffffff';
      const browser = updateBrowserSession(fingerprint);

      const result = await runCaptureValidation({
        subject: 'functional',
        entries: [{ name: 'bitmap-color-transform', renderers: ['canvas'] }],
        server: { url: 'http://unused.invalid', kill: vi.fn() },
        root,
        gateParity: false,
        quiet: true,
        updateFingerprints: true,
        fingerprints: { 'bitmap-color-transform': { canvas: fingerprint } },
        fingerprintProvenance: { 'bitmap-color-transform': { canvas: UPDATE_PROVENANCE } },
        browserSession: browser.session,
      });

      expect(browser.newPage).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ shouldFail: false, updated: 1 });
      expect(getBaselineField(root, 'functional', 'bitmap-color-transform', 'canvas', 'fingerprint')).toBe(fingerprint);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  // ★ COMPOSED FROM TWO IMPLEMENTATIONS OF ONE CAPABILITY. The scenario, the message text and the
  // orientation-triage pointer came from the message-wiring side; the value they render came from the
  // resolver side. The assertion is on BOTH, because the point of the composition is that they cannot
  // disagree: `fixtureBackgroundMismatch` is the determination and the sentence is that same
  // determination in words, never a second one computed alongside it.
  it('states the fixture-background verdict beside a parity distance and points failures to orientation triage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tool-capture-parity-confound-'));
    try {
      const scenes = join(root, 'functional', 'scenes');
      mkdirSync(scenes, { recursive: true });
      writeFileSync(join(scenes, 'sample.canvas.ts'), 'const state = { backgroundColor: 0x111111ff };\n');
      writeFileSync(join(scenes, 'sample.webgl.ts'), 'const state = { backgroundColor: 0x222222ff };\n');

      const result = await runCaptureValidation({
        subject: 'functional',
        entries: [{ name: 'sample', renderers: ['canvas', 'webgl'] }],
        server: { url: 'http://unused.invalid', kill: vi.fn() },
        root,
        gateParity: true,
        gateRegression: false,
        parityTolerance: 0,
        parityGroups: { visual: { targets: ['canvas', 'webgl'] } },
        quiet: true,
        fingerprints: { sample: { canvas: '1:000000', webgl: '1:ffffff' } },
        browserSession: {
          browser: { close: vi.fn() } as never,
          context: { newPage: vi.fn() } as never,
        },
      });

      const parity = result.checks.find((check) => check.kind === 'parity');
      // The two fixtures declare different clear colours, so the determination is a mismatch — and the
      // message says so in the same run rather than leaving a reader to infer it from the number.
      expect(parity).toMatchObject({ fixtureBackgroundMismatch: true });
      expect(parity?.message).toContain('fixture backgrounds DIFFER');
      expect(parity?.message).toContain('npm run test:functional:parity:orientation');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('retries transient fingerprint-load failures up to the validation budget', async () => {
    const newPage = vi.fn().mockRejectedValue(new Error('page.goto: Timeout 45000ms exceeded'));
    const result = await runCaptureValidation({
      subject: 'functional',
      entries: [{ name: 'sample', renderers: ['canvas'] }],
      server: { url: 'http://unused.invalid', kill: vi.fn() },
      root: join(tmpdir(), 'tool-capture-validation-retry-fixture'),
      gateParity: false,
      quiet: true,
      maxRetries: 2,
      browserSession: {
        browser: { close: vi.fn() } as never,
        context: { newPage } as never,
      },
    });

    expect(newPage).toHaveBeenCalledTimes(3);
    expect(result.loadFailures).toBe(1);
  });

  it('does not retry a deterministic render assertion failure', async () => {
    const newPage = vi.fn().mockRejectedValue(new Error('[mesh] expected red, got blue'));
    const result = await runCaptureValidation({
      subject: 'functional',
      entries: [{ name: 'sample', renderers: ['canvas'] }],
      server: { url: 'http://unused.invalid', kill: vi.fn() },
      root: join(tmpdir(), 'tool-capture-validation-no-retry-fixture'),
      gateParity: false,
      quiet: true,
      maxRetries: 2,
      browserSession: {
        browser: { close: vi.fn() } as never,
        context: { newPage } as never,
      },
    });

    expect(newPage).toHaveBeenCalledOnce();
    expect(result.loadFailures).toBe(1);
  });

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

  it('keeps a declared control in fingerprint regression but excludes it from parity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tool-capture-control-parity-'));
    try {
      const scenes = join(root, 'functional', 'scenes');
      const baselines = join(root, 'functional', 'baselines');
      mkdirSync(scenes, { recursive: true });
      mkdirSync(baselines, { recursive: true });
      writeFileSync(join(scenes, 'sample.canvas.ts'), "export const functionalBackendSupport = 'control' as const;\n");
      writeFileSync(join(scenes, 'sample.webgl.ts'), 'export const scene = true;\n');
      writeFileSync(
        join(baselines, 'sample.json'),
        `${JSON.stringify({ canvas: { fingerprint: '1:000000' }, webgl: { fingerprint: '1:000000' } })}\n`,
      );

      const result = await runCaptureValidation({
        subject: 'functional',
        entries: [{ name: 'sample', renderers: ['canvas', 'webgl'] }],
        server: { url: 'http://unused.invalid', kill: vi.fn() },
        root,
        gateParity: true,
        quiet: true,
        parityGroups: { visual: { targets: ['canvas', 'webgl'], reference: 'canvas' } },
        fingerprints: { sample: { canvas: '1:000000', webgl: '1:000000' } },
        browserSession: {
          browser: { close: vi.fn() } as never,
          context: { newPage: vi.fn() } as never,
        },
      });

      expect(result.regressionPasses).toBe(2);
      expect(result.parityPasses + result.parityFailures).toBe(0);
      expect(result.parityUncovered).toBe(1);
      expect(result.checks.find((check) => check.kind === 'parity')).toMatchObject({
        renderers: ['webgl'],
        status: 'skipped',
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('is a callable fingerprint-validation orchestrator', () => {
    expect(typeof runCaptureValidation).toBe('function');
  });

  it('reports baseline contrast beside regression distance without changing the verdict', async () => {
    const source = 'unchanged scene';
    const fixture = createRegressionFixture(source, sha256(source));
    try {
      const result = await validateRegressionFixture(fixture.root, fixture.kill, '2:000000000000000000ffffff');
      const regression = result.checks.find((check) => check.kind === 'regression');

      expect(result.regressionPasses).toBe(1);
      expect(regression).toMatchObject({ contrast: 63.75, status: 'passed' });
      expect(regression?.message).toContain('baseline contrast 63.75 (report only)');
    } finally {
      rmSync(fixture.root, { force: true, recursive: true });
    }
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
        fingerprintProvenanceStatus: 'full',
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
        fingerprintProvenanceStatus: 'full',
      });
      expect(failure?.message).toContain('environment drift; never rebaseline');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('labels the deprecated sourceHash fallback as PROVENANCE-PARTIAL', async () => {
    const source = 'legacy partial scene';
    const fixture = createRegressionFixture(source, sha256(source));
    try {
      const baseline = join(fixture.root, 'functional', 'baselines', 'sample.json');
      writeFileSync(
        baseline,
        JSON.stringify(
          {
            canvas: {
              fingerprint: '2:000000000000000000ffffff',
              sourceHash: sha256(source),
            },
          },
          null,
          2,
        ) + '\n',
      );
      const result = await validateRegressionFixture(fixture.root, fixture.kill);
      const failure = result.checks.find((check) => check.kind === 'regression');

      expect(failure).toMatchObject({
        fingerprintProvenanceStatus: 'partial',
        recordedSourceHash: sha256(source),
        sourceHashStatus: 'unchanged',
      });
      expect(failure?.message).toContain('PROVENANCE-PARTIAL (legacy sourceHash fallback)');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('reports recapture debt when a stale-source fingerprint still passes within tolerance', async () => {
    const fixture = createRegressionFixture('changed scene', sha256('captured scene'));
    try {
      const result = await validateRegressionFixture(fixture.root, fixture.kill, '2:000000000000000000ffffff');
      const passed = result.checks.find((check) => check.kind === 'regression');

      // The temporary root has no coverage manifest, so its aggregate verdict is independently red.
      // Freshness itself must not turn this passing comparison into a regression failure.
      expect(result.regressionFailures).toBe(0);
      expect(result.regressionPasses).toBe(1);
      expect(passed).toMatchObject({
        currentSourceHash: sha256('changed scene'),
        recordedSourceHash: sha256('captured scene'),
        sourceHashStatus: 'changed',
        fingerprintProvenanceStatus: 'full',
        status: 'passed',
      });
      expect(passed?.message).toContain('recapture owed by the scene owner');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
