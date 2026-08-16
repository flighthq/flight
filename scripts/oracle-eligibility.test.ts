import type { OracleCaptureFact, OracleDeterminismVerdict, OracleEligibilityInput } from './oracle-eligibility';
import {
  findParityDisagreements,
  groupOracleTargets,
  selectCommissionableCells,
  summarizeOracleBlocks,
} from './oracle-eligibility';

// ★ EVERY CONDITION IN THE BAR HAS A TEST THAT WATCHES IT WITHHOLD A CELL, because the bar is the only
// thing between a bad capture and a permanent reference. A condition nobody has seen fire is a condition
// nobody knows is wired up — and the cost of finding out later is a blessed wrong pixel that every future
// regression check then agrees with.
//
// Each test starts from a cell that WOULD be eligible and breaks exactly one thing, so a pass proves the
// named condition did the withholding rather than some other one that happened to be tripped too.

describe('findParityDisagreements', () => {
  const IDENTITIES = ['functional/a/canvas', 'functional/a/webgl', 'functional/b/webgl'];

  it('withholds every cell of a scene whose backends disagreed, not just the failing column', () => {
    // Parity says the pair differs; it does not say which one is wrong. Blessing the column that matched
    // the reference backend would pin the yardstick as the answer.
    const found = findParityDisagreements(
      [
        { entry: 'a', kind: 'parity', status: 'failed' },
        { entry: 'b', kind: 'parity', status: 'passed' },
      ],
      IDENTITIES,
    );

    expect(found).toEqual({ disagreed: new Set(['functional/a/canvas', 'functional/a/webgl']) });
  });

  it('withholds a scene parity could not evaluate at all', () => {
    const found = findParityDisagreements(
      [
        { entry: 'a', kind: 'parity', status: 'skipped' },
        { entry: 'b', kind: 'parity', status: 'passed' },
      ],
      IDENTITIES,
    );

    expect(found).toEqual({ disagreed: new Set(['functional/a/canvas', 'functional/a/webgl']) });
  });

  it('refuses a report-only run instead of reading it as universal agreement', () => {
    // ★ THE FIRING TEST FOR THE INVERSION THAT NEARLY SHIPPED. `--report` records every pair as
    // `reported` — a distance with no verdict — so a status-based read would have found nothing that
    // "failed" and cleared the parity condition for the entire corpus on a run that gated nothing.
    expect(
      findParityDisagreements(
        [
          { entry: 'a', kind: 'parity', status: 'reported' },
          { entry: 'b', kind: 'parity', status: 'reported' },
        ],
        IDENTITIES,
      ),
    ).toEqual({ refused: 'the report carries no gated parity verdict, so it cannot say any scene agreed' });
  });

  it('refuses a report with no parity rows at all', () => {
    expect(findParityDisagreements([{ entry: 'a', kind: 'regression', status: 'passed' }], IDENTITIES)).toEqual({
      refused: 'the report carries no gated parity verdict, so it cannot say any scene agreed',
    });
  });

  it('accepts a report that gated some scenes and only reported others', () => {
    const found = findParityDisagreements(
      [
        { entry: 'a', kind: 'parity', status: 'passed' },
        { entry: 'b', kind: 'parity', status: 'reported' },
      ],
      IDENTITIES,
    );

    expect(found).toEqual({ disagreed: new Set(['functional/b/webgl']) });
  });
});

describe('groupOracleTargets', () => {
  it('collapses renderers of one scene into a single request target', () => {
    expect(groupOracleTargets(['functional/a/webgl', 'functional/a/canvas', 'functional/b/webgl'])).toEqual([
      { entry: 'a', renderers: ['canvas', 'webgl'] },
      { entry: 'b', renderers: ['webgl'] },
    ]);
  });

  it('ignores an identity that carries no entry and renderer', () => {
    expect(groupOracleTargets(['functional'])).toEqual([]);
  });
});

describe('selectCommissionableCells', () => {
  it('accepts a cell whose every independent statement agrees', () => {
    const report = select({});

    expect(report.eligible).toEqual(['functional/good/webgl']);
    expect(report.blocked).toEqual([]);
    expect(report.collisions).toEqual([]);
  });

  it('withholds a cell whose capture errored', () => {
    expect(blockOf(select({ capture: { state: 'error' } }))).toEqual(['capture-failed', 'capture state is error']);
  });

  it('withholds a cell the run produced no status for at all', () => {
    // A cell that never captured is absent, not passing. Reading absence as agreement is the exact
    // failure `compareCalibrationRuns` refuses to make, and it must not be made here either.
    expect(blockOf(select({ captures: [] }))).toEqual(['capture-failed', 'the capture run produced no status for it']);
  });

  it('withholds a scene that ships no assertRender, however stable its render is', () => {
    // ★ THE CONDITION WITH NO SUBSTITUTE. This cell is deterministic, at parity, and byte-identical to
    // its committed baseline — every stability signal is green. None of them says the picture is RIGHT.
    expect(blockOf(select({ capture: { oracle: 'absent' } }))).toEqual([
      'no-scene-oracle',
      'the scene exports no assertRender',
    ]);
  });

  it('withholds a cell whose status recorded no oracle field', () => {
    expect(blockOf(select({ capture: { oracle: null } }))).toEqual(['no-scene-oracle', 'no oracle was recorded']);
  });

  it('withholds a cell whose repeated captures disagreed', () => {
    expect(blockOf(select({ determinism: 'disagreed' }))).toEqual([
      'nondeterministic',
      'repeated captures did not agree',
    ]);
  });

  it('withholds a cell no repeat run covered, rather than assuming it is stable', () => {
    expect(blockOf(select({ determinism: null }))).toEqual(['determinism-unmeasured', 'no repeat run covered it']);
  });

  it('distinguishes a cell one repeat run failed to capture from one never measured', () => {
    expect(blockOf(select({ determinism: 'incomplete' }))).toEqual([
      'determinism-unmeasured',
      'a repeat run did not capture it',
    ]);
  });

  it('withholds a cell whose backends disagree on the scene', () => {
    expect(blockOf(select({ parityDisagreed: ['functional/good/webgl'] }))).toEqual([
      'parity-disagreement',
      'backends disagree on this scene',
    ]);
  });

  it('reports a byte-identical sibling backend without withholding either cell', () => {
    // ★ THE CONDITION THIS REPLACED, AND WHY. Byte-identity across backends was a blocking rule on the
    // premise that independent rasterizers never agree exactly. The corpus refuted it: 33 of the 76
    // scenes carrying both a canvas and a webgl column are byte-identical, and webgl/webgpu share one
    // SwiftShader rasterizer besides. Blocking withheld 179 of 493 cells — most of them the simplest and
    // safest in the suite — for an observation with no discriminating power.
    const report = select({
      coverage: [
        ['functional/good/webgl', ['fingerprint', 'oracle']],
        ['functional/good/webgpu', ['fingerprint', 'oracle']],
      ],
      captures: [
        fact('functional/good/webgl', { hash: 'same', baselineHash: 'same' }),
        fact('functional/good/webgpu', { hash: 'same', baselineHash: 'same' }),
      ],
      determinismMap: [
        ['functional/good/webgl', 'agreed'],
        ['functional/good/webgpu', 'agreed'],
      ],
    });

    expect(report.eligible).toEqual(['functional/good/webgl', 'functional/good/webgpu']);
    expect(report.blocked).toEqual([]);
    expect(report.collisions).toEqual([
      { identity: 'functional/good/webgl', twin: 'functional/good/webgpu' },
      { identity: 'functional/good/webgpu', twin: 'functional/good/webgl' },
    ]);
  });

  it('does not report two scenes sharing a hash as a collision', () => {
    // Different scenes are allowed to look alike; only a SIBLING backend of the SAME scene is the
    // observation worth printing.
    const report = select({
      coverage: [
        ['functional/good/webgl', ['fingerprint', 'oracle']],
        ['functional/other/webgl', ['fingerprint', 'oracle']],
      ],
      captures: [
        fact('functional/good/webgl', { hash: 'same', baselineHash: 'same' }),
        fact('functional/other/webgl', { hash: 'same', baselineHash: 'same' }),
      ],
      determinismMap: [
        ['functional/good/webgl', 'agreed'],
        ['functional/other/webgl', 'agreed'],
      ],
    });

    expect(report.eligible).toEqual(['functional/good/webgl', 'functional/other/webgl']);
    expect(report.collisions).toEqual([]);
  });

  it('withholds a cell that no longer matches its committed baseline', () => {
    expect(blockOf(select({ capture: { hash: 'moved' } }))).toEqual([
      'baseline-drift',
      'capture does not match the committed baseline',
    ]);
  });

  it('withholds a cell the repository has never pinned a baseline for', () => {
    expect(blockOf(select({ capture: { baselineHash: null } }))).toEqual([
      'no-baseline',
      'no committed capture baseline',
    ]);
  });

  it('withholds a held cell and repeats the hold reason verbatim', () => {
    expect(blockOf(select({ held: [['functional/good/webgl', 'builder is repairing it']] }))).toEqual([
      'held',
      'builder is repairing it',
    ]);
  });

  it('never lets local evidence override a hold', () => {
    // The hold is checked before any capture fact is read, so a cell that looks perfect locally still
    // stays held. That ordering is the whole point: the holder knows something this run cannot see.
    const report = select({ held: [['functional/good/webgl', 'ruling pending']] });

    expect(report.eligible).toEqual([]);
  });

  it('withholds a cell an open request already claims', () => {
    expect(blockOf(select({ outstanding: ['functional/good/webgl'] }))).toEqual([
      'already-commissioned',
      'an open request already claims it',
    ]);
  });

  it('withholds a cell the lock already pins', () => {
    expect(blockOf(select({ pinned: ['functional/good/webgl'] }))).toEqual([
      'already-pinned',
      'already blessed and gating',
    ]);
  });

  it('withholds a cell whose coverage identity already carries referenceImage', () => {
    // The coverage manifest and the lock are separate records (§5); either one claiming the cell is
    // enough to make a fresh commission a re-bless rather than a first blessing.
    expect(
      blockOf(select({ coverage: [['functional/good/webgl', ['fingerprint', 'oracle', 'referenceImage']]] })),
    ).toEqual(['already-pinned', 'already blessed and gating']);
  });

  it('reports the first failed condition when several are tripped at once', () => {
    // A cell that both failed to capture and drifted is reported as capture-failed: the capture is what
    // must be fixed first, and the drift is not even a meaningful reading until it is.
    expect(blockOf(select({ capture: { state: 'error', hash: 'moved' } }))).toEqual([
      'capture-failed',
      'capture state is error',
    ]);
  });

  it('considers only cells the coverage manifest lists', () => {
    const report = select({ captures: [fact('functional/good/webgl'), fact('functional/unlisted/webgl')] });

    expect(report.eligible).toEqual(['functional/good/webgl']);
    expect(report.blocked).toEqual([]);
  });
});

describe('summarizeOracleBlocks', () => {
  it('counts reasons worst-first rather than in encounter order', () => {
    expect(
      summarizeOracleBlocks([
        { detail: '', identity: 'a', reason: 'already-pinned' },
        { detail: '', identity: 'b', reason: 'capture-failed' },
        { detail: '', identity: 'c', reason: 'already-pinned' },
      ]),
    ).toEqual([
      { count: 1, reason: 'capture-failed' },
      { count: 2, reason: 'already-pinned' },
    ]);
  });

  it('omits a reason nothing was blocked by', () => {
    expect(summarizeOracleBlocks([])).toEqual([]);
  });
});

function fact(identity: string, overrides: Partial<OracleCaptureFact> = {}): OracleCaptureFact {
  return { baselineHash: 'h', hash: 'h', identity, oracle: 'invoked', state: 'ready', ...overrides };
}

/** Builds a one-cell input that is eligible by default, so a test breaks exactly what it names. */
function select(options: {
  capture?: Partial<OracleCaptureFact>;
  captures?: readonly OracleCaptureFact[];
  coverage?: readonly (readonly [string, readonly string[]])[];
  determinism?: OracleDeterminismVerdict | null;
  determinismMap?: readonly (readonly [string, OracleDeterminismVerdict])[];
  held?: readonly (readonly [string, string])[];
  outstanding?: readonly string[];
  parityDisagreed?: readonly string[];
  pinned?: readonly string[];
}) {
  const determinism =
    options.determinismMap ??
    (options.determinism === null ? [] : ([['functional/good/webgl', options.determinism ?? 'agreed']] as const));
  const input: OracleEligibilityInput = {
    captures: options.captures ?? [fact('functional/good/webgl', options.capture)],
    coverage: new Map(options.coverage ?? [['functional/good/webgl', ['fingerprint', 'oracle']]]),
    determinism: new Map(determinism),
    held: new Map(options.held ?? []),
    outstanding: new Set(options.outstanding ?? []),
    parityDisagreed: new Set(options.parityDisagreed ?? []),
    pinned: new Set(options.pinned ?? []),
  };
  return selectCommissionableCells(input);
}

/** The single block a one-cell case produced, as `[reason, detail]`. */
function blockOf(report: ReturnType<typeof selectCommissionableCells>): [string, string] {
  expect(report.eligible).toEqual([]);
  expect(report.blocked).toHaveLength(1);
  return [report.blocked[0]!.reason, report.blocked[0]!.detail];
}
