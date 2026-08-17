import type {
  OracleCaptureFact,
  OracleDeterminismVerdict,
  OracleDeterminismScope,
  OracleEligibilityInput,
  OracleParityWithholding,
} from './oracle-eligibility';
import {
  addReferenceImageCoverage,
  findParityWithholdings,
  findStaleCaptures,
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

describe('addReferenceImageCoverage', () => {
  // ★ THE HALF OF A COMMISSION THAT FAILS SILENTLY. §5 makes the request and the coverage identity one
  // change: file only the request and the cell is never REQUIRED, so nothing fails when the bytes never
  // arrive — the commission expires quietly and CI was never told to ask. Everything that did happen
  // still looks correct, which is why this needs an assertion rather than an eyeball.

  it('adds referenceImage to each commissioned identity and keeps the kinds sorted', () => {
    expect(
      addReferenceImageCoverage({ 'a/webgl': ['fingerprint', 'oracle', 'screenshot'] }, ['functional/a/webgl']),
    ).toEqual({ coverage: { 'a/webgl': ['fingerprint', 'oracle', 'referenceImage', 'screenshot'] } });
  });

  it('leaves every cell the batch did not name untouched', () => {
    expect(
      addReferenceImageCoverage({ 'a/webgl': ['fingerprint'], 'b/canvas': ['oracle'] }, ['functional/a/webgl']),
    ).toEqual({ coverage: { 'a/webgl': ['fingerprint', 'referenceImage'], 'b/canvas': ['oracle'] } });
  });

  it('is idempotent on a cell that already carries the kind', () => {
    expect(addReferenceImageCoverage({ 'a/webgl': ['fingerprint', 'referenceImage'] }, ['functional/a/webgl'])).toEqual(
      { coverage: { 'a/webgl': ['fingerprint', 'referenceImage'] } },
    );
  });

  it('never mutates the coverage it was handed', () => {
    // The caller writes this object back to disk; mutating the input would let a later refusal leave a
    // half-applied manifest behind.
    const original = { 'a/webgl': ['fingerprint'] };
    addReferenceImageCoverage(original, ['functional/a/webgl']);

    expect(original).toEqual({ 'a/webgl': ['fingerprint'] });
  });

  it('reports the identity that vanished between the read and the write', () => {
    expect(addReferenceImageCoverage({ 'a/webgl': ['fingerprint'] }, ['functional/gone/webgl'])).toEqual({
      missing: 'functional/gone/webgl',
    });
  });
});

describe('findParityWithholdings', () => {
  const IDENTITIES = ['functional/a/canvas', 'functional/a/webgl', 'functional/b/webgl'];

  it('withholds every cell of a scene whose backends disagreed, not just the failing column', () => {
    // Parity says the pair differs; it does not say which one is wrong. Blessing the column that matched
    // the reference backend would pin the yardstick as the answer.
    const found = findParityWithholdings(
      [
        { entry: 'a', kind: 'parity', status: 'failed' },
        { entry: 'b', kind: 'parity', status: 'passed' },
      ],
      IDENTITIES,
    );

    expect(found).toEqual({
      withheld: new Map([
        ['functional/a/canvas', 'disagreement'],
        ['functional/a/webgl', 'disagreement'],
      ]),
    });
  });

  it('separates a scene parity could not evaluate from one it judged and rejected', () => {
    // The two route to different people: a disagreement is a defect somebody must find, an unevaluated
    // scene has no comparable pair and needs a parity group or a second backend column.
    const found = findParityWithholdings(
      [
        { entry: 'a', kind: 'parity', status: 'skipped' },
        { entry: 'b', kind: 'parity', status: 'failed' },
      ],
      IDENTITIES,
    );

    expect(found).toEqual({
      withheld: new Map([
        ['functional/a/canvas', 'unevaluated'],
        ['functional/a/webgl', 'unevaluated'],
        ['functional/b/webgl', 'disagreement'],
      ]),
    });
  });

  it('takes the worse verdict when one scene carries both', () => {
    const found = findParityWithholdings(
      [
        { entry: 'a', kind: 'parity', status: 'skipped' },
        { entry: 'a', kind: 'parity', status: 'failed' },
        { entry: 'b', kind: 'parity', status: 'passed' },
      ],
      IDENTITIES,
    );

    expect(found).toEqual({
      withheld: new Map([
        ['functional/a/canvas', 'disagreement'],
        ['functional/a/webgl', 'disagreement'],
      ]),
    });
  });

  it('refuses a report-only run instead of reading it as universal agreement', () => {
    // ★ THE FIRING TEST FOR THE INVERSION THAT NEARLY SHIPPED. `--report` records every pair as
    // `reported` — a distance with no verdict — so a status-based read would have found nothing that
    // "failed" and cleared the parity condition for the entire corpus on a run that gated nothing.
    expect(
      findParityWithholdings(
        [
          { entry: 'a', kind: 'parity', status: 'reported' },
          { entry: 'b', kind: 'parity', status: 'reported' },
        ],
        IDENTITIES,
      ),
    ).toEqual({ refused: 'the report carries no gated parity verdict, so it cannot say any scene agreed' });
  });

  it('refuses a report with no parity rows at all', () => {
    expect(findParityWithholdings([{ entry: 'a', kind: 'regression', status: 'passed' }], IDENTITIES)).toEqual({
      refused: 'the report carries no gated parity verdict, so it cannot say any scene agreed',
    });
  });

  it('accepts a report that gated some scenes and only reported others', () => {
    const found = findParityWithholdings(
      [
        { entry: 'a', kind: 'parity', status: 'passed' },
        { entry: 'b', kind: 'parity', status: 'reported' },
      ],
      IDENTITIES,
    );

    expect(found).toEqual({ withheld: new Map([['functional/b/webgl', 'unevaluated']]) });
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

  it('withholds a healthy column whose sibling backend failed in the same scene', () => {
    // ★ A SCENE IS REPAIRED AS A WHOLE. The fix for the failing column usually moves this one too, and a
    // reference blessed today would then read that repair as a regression against a picture nobody meant
    // to freeze.
    const report = select({
      coverage: [
        ['functional/good/canvas', ['fingerprint', 'oracle']],
        ['functional/good/webgl', ['fingerprint', 'oracle']],
      ],
      captures: [fact('functional/good/canvas'), fact('functional/good/webgl', { state: 'error' })],
      determinismMap: [
        ['functional/good/canvas', 'agreed'],
        ['functional/good/webgl', 'agreed'],
      ],
    });

    expect(report.eligible).toEqual([]);
    expect(report.blocked).toEqual([
      {
        detail: 'functional/good/webgl failed in this scene',
        identity: 'functional/good/canvas',
        reason: 'sibling-column-failed',
      },
      { detail: 'capture state is error', identity: 'functional/good/webgl', reason: 'capture-failed' },
    ]);
  });

  it('ignores a failed column that is no longer a live coverage cell', () => {
    // ★ THE FIRING TEST FOR RESIDUE. A capture root ACCUMULATES — a fresh run writes the current suite
    // and deletes nothing — so it keeps `error` output for columns a scene no longer has. On the real
    // tree a three-week-old `bitmap-downscale-smoothing/webgl` withheld that scene's two live columns.
    // A cell that no longer exists cannot be under repair.
    const report = select({
      coverage: [['functional/good/canvas', ['fingerprint', 'oracle']]],
      captures: [fact('functional/good/canvas'), fact('functional/good/webgl', { state: 'error' })],
      determinismMap: [['functional/good/canvas', 'agreed']],
    });

    expect(report.eligible).toEqual(['functional/good/canvas']);
  });

  it('does not read a failure in a different scene as a sibling failure', () => {
    const report = select({
      coverage: [
        ['functional/good/canvas', ['fingerprint', 'oracle']],
        ['functional/other/webgl', ['fingerprint', 'oracle']],
      ],
      captures: [fact('functional/good/canvas'), fact('functional/other/webgl', { state: 'error' })],
      determinismMap: [['functional/good/canvas', 'agreed']],
    });

    expect(report.eligible).toEqual(['functional/good/canvas']);
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

  it('reports UNEVALUATED independence as its own reason, never as measured-one-host', () => {
    // ★ THE WHOLE POINT OF THE THIRD STATE. "The captures do not record which machine made them" and "the
    // captures record one machine" have opposite remedies — wire the producer, versus re-run elsewhere.
    // Collapsing them lets a reader conclude a measurement was taken that never was, and the earlier
    // version of this consumer did exactly that by falling back to `one-host`.
    expect(blockOf(select({ determinismScope: 'host-identity-missing' }))).toEqual([
      'host-identity-missing',
      'captures record no host identity, so independence is UNEVALUATED — not measured as one host',
    ]);
  });

  it('distinguishes the two states from each other, which is the property that matters', () => {
    const missing = blockOf(select({ determinismScope: 'host-identity-missing' }))[0];
    const oneHost = blockOf(select({ determinismScope: 'one-host' }))[0];
    expect(missing).not.toEqual(oneHost);
  });

  it('still reports an actionable defect ahead of unevaluated independence', () => {
    // Ranked like every other all-cells-at-once condition: a cell that ALSO has something someone can fix
    // must name the fixable thing, or the repair track loses its list behind one global heading.
    expect(blockOf(select({ capture: { state: 'error' }, determinismScope: 'host-identity-missing' }))).toEqual([
      'capture-failed',
      'capture state is error',
    ]);
  });

  it('withholds a locally-agreeing cell until an independent host has agreed too', () => {
    // ★ STAGE ONE IS NOT STAGE TWO. Repeats on one machine prove that machine reproduces itself. The lock
    // is verified on a DIFFERENT machine at maxChannelDelta 0, and `tests.yml` records SwiftShader pinning
    // already failing to survive a machine change once, so local agreement advances a cell — it never
    // completes it.
    expect(blockOf(select({ determinismScope: 'one-host' }))).toEqual([
      'determinism-within-host-only',
      'stage one clear; cross-host portability is unmeasured',
    ]);
  });

  it('does not let the cross-host stage mask a defect the repair track could act on', () => {
    // ★ THE ORDERING BUG THIS PINS. Checked before the other conditions, this reason swallowed all 445
    // otherwise-clean cells under one heading and every actionable list went empty. It names a
    // measurement nobody in a sandbox can run and it is true of every cell at once, so it is checked
    // last: a cell that also lacks an oracle reports the oracle.
    expect(blockOf(select({ capture: { oracle: 'absent' }, determinismScope: 'one-host' }))).toEqual([
      'no-scene-oracle',
      'the scene exports no assertRender',
    ]);
  });

  it('treats a local disagreement as conclusive, with no cross-host run owed', () => {
    // The asymmetry: a cell that cannot reproduce itself on one machine will not reproduce across two.
    expect(blockOf(select({ determinism: 'disagreed', determinismScope: 'one-host' }))).toEqual([
      'nondeterministic',
      'repeated captures did not agree',
    ]);
  });

  it('withholds a cell whose backends disagree on the scene', () => {
    expect(blockOf(select({ parityWithheld: [['functional/good/webgl', 'disagreement']] }))).toEqual([
      'parity-disagreement',
      'backends disagree on this scene',
    ]);
  });

  it('withholds a cell parity could not judge under its own reason', () => {
    const report = select({
      coverage: [
        ['functional/good/webgl', ['fingerprint', 'oracle']],
        ['functional/good/canvas', ['fingerprint', 'oracle']],
      ],
      captures: [fact('functional/good/webgl'), fact('functional/good/canvas')],
      determinismMap: [
        ['functional/good/webgl', 'agreed'],
        ['functional/good/canvas', 'agreed'],
      ],
      parityWithheld: [
        ['functional/good/webgl', 'unevaluated'],
        ['functional/good/canvas', 'unevaluated'],
      ],
    });

    expect(report.blocked.map((cell) => cell.reason)).toEqual(['parity-unevaluated', 'parity-unevaluated']);
  });

  it('separates a scene parity can never apply to from one where it merely did not run', () => {
    // ★ UNRUN vs UNRUNNABLE. A one-column scene has no cross-backend evidence to produce, ever. Filing it
    // as `parity-unevaluated` sends someone looking for a defect that is a property of the scene.
    expect(blockOf(select({ parityWithheld: [['functional/good/webgl', 'unevaluated']] }))).toEqual([
      'parity-single-column',
      'the scene has one backend column',
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

  it('does not require a committed baseline to exist', () => {
    // ★ THE CONDITION THAT WAS REMOVED, AND WHY IT CANNOT COME BACK AS "JUST CAPTURE THEM". A baseline
    // written today is a FIRST capture: it proves nothing about reproduction until something later
    // re-runs against it, so capturing the missing ones and accepting them would be circular on any
    // host. Cross-time reproduction is stage-one determinism's job; correctness is assertRender's.
    expect(select({ capture: { baselineHash: null } }).eligible).toEqual(['functional/good/webgl']);
  });

  it('still gates on a baseline that exists and does not reproduce', () => {
    // The check earns its place on measured data: 13 of 450 baselined cells reproduced byte-for-byte
    // across both of today's runs and still disagreed with their committed baseline. Stage one called
    // all 13 agreed — it compares today to today and cannot see a render that moved last week.
    expect(blockOf(select({ capture: { hash: 'moved' } }))).toEqual([
      'baseline-unreproduced-here',
      'the committed baseline does not reproduce in this environment',
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
  return { baselineHash: 'h', hash: 'h', identity, oracle: 'invoked', sourceHash: null, state: 'ready', ...overrides };
}

/** Builds a one-cell input that is eligible by default, so a test breaks exactly what it names. */
function select(options: {
  capture?: Partial<OracleCaptureFact>;
  captures?: readonly OracleCaptureFact[];
  coverage?: readonly (readonly [string, readonly string[]])[];
  determinism?: OracleDeterminismVerdict | null;
  determinismScope?: OracleDeterminismScope;
  determinismMap?: readonly (readonly [string, OracleDeterminismVerdict])[];
  held?: readonly (readonly [string, string])[];
  outstanding?: readonly string[];
  parityWithheld?: readonly (readonly [string, OracleParityWithholding])[];
  pinned?: readonly string[];
}) {
  const determinism =
    options.determinismMap ??
    (options.determinism === null ? [] : ([['functional/good/webgl', options.determinism ?? 'agreed']] as const));
  const input: OracleEligibilityInput = {
    captures: options.captures ?? [fact('functional/good/webgl', options.capture)],
    coverage: new Map(options.coverage ?? [['functional/good/webgl', ['fingerprint', 'oracle']]]),
    determinism: new Map(determinism),
    determinismScope: options.determinismScope ?? 'independent-hosts',
    held: new Map(options.held ?? []),
    outstanding: new Set(options.outstanding ?? []),
    parityWithheld: new Map(options.parityWithheld ?? []),
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

describe('findStaleCaptures', () => {
  // ★ THE DEFECT THIS MAKES MECHANICAL. A census was computed from capture roots taken before the tree
  // moved, and reported cells as lacking oracles those scenes had since gained. The failure was silent
  // and bidirectional — a deleted scene's stale error reads as a live defect, an improved scene's stale
  // facts read as a missing feature — and it took manual archaeology to notice either time.
  const current = (map: Readonly<Record<string, string>>) => (id: string) => map[id] ?? null;

  it('names a cell whose capture recorded a different source hash than the tree holds now', () => {
    const stale = findStaleCaptures(
      [fact('functional/moved/webgl', { sourceHash: 'old' }), fact('functional/same/webgl', { sourceHash: 'a' })],
      current({ 'functional/moved/webgl': 'new', 'functional/same/webgl': 'a' }),
    );

    expect(stale).toEqual({ compared: 2, stale: ['functional/moved/webgl'] });
  });

  it('ignores a capture that recorded no source hash, rather than guessing it moved', () => {
    expect(
      findStaleCaptures([fact('functional/a/webgl', { sourceHash: null })], current({ 'functional/a/webgl': 'x' })),
    ).toEqual({ compared: 0, stale: [] });
  });

  it('reports compared:0 when the field it depends on has gone away, rather than an empty stale list', () => {
    // ★ THE SILENT FLIP THIS PREVENTS. `sourceHash` lives on a record this does not own and is being
    // migrated elsewhere. If it empties, every cell takes the null branch and the stale list is empty —
    // which reads as "everything is fresh". `compared` is what separates "nothing drifted" from "I could
    // not look", in the one instrument whose whole job is noticing drift.
    const gone = findStaleCaptures(
      [fact('functional/a/webgl', { sourceHash: null }), fact('functional/b/webgl', { sourceHash: null })],
      current({ 'functional/a/webgl': 'x', 'functional/b/webgl': 'y' }),
    );

    expect(gone).toEqual({ compared: 0, stale: [] });
  });

  it('ignores a cell whose scene no longer exists — that is residue, not staleness', () => {
    // A missing scene resolves to null, and the coverage intersection already withholds those. Reporting
    // them here would file one defect under two names.
    expect(findStaleCaptures([fact('functional/gone/webgl', { sourceHash: 'old' })], current({}))).toEqual({
      compared: 0,
      stale: [],
    });
  });
});
