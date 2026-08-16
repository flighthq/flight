import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compareCalibrationRuns, formatCalibrationReport } from './oracle-calibrate';

describe('compareCalibrationRuns', () => {
  it('reports agreement when every run recorded the same pixel hash', () => {
    const report = compareCalibrationRuns([run({ 'functional/a/webgl': 'a' }), run({ 'functional/a/webgl': 'a' })]);

    expect(report.agreed).toEqual(['functional/a/webgl']);
    expect(report.disagreed).toEqual([]);
  });

  it('reports disagreement when two runs recorded different hashes', () => {
    const report = compareCalibrationRuns([run({ 'functional/a/webgl': 'a' }), run({ 'functional/a/webgl': 'b' })]);

    expect(report.disagreed).toEqual(['functional/a/webgl']);
    expect(report.agreed).toEqual([]);
  });

  // ★ A cell one run never captured is INCOMPLETE, never counted as agreement. A run that did not capture
  // says nothing about whether it would have matched, and folding it either way manufactures a result
  // from an absent measurement — which is the failure this whole tier exists to avoid.
  it('refuses to score a cell some run never captured', () => {
    const report = compareCalibrationRuns([
      run({ 'functional/a/webgl': 'a', 'functional/b/webgl': 'x' }),
      run({ 'functional/a/webgl': 'a' }),
    ]);

    expect(report.agreed).toEqual(['functional/a/webgl']);
    expect(report.incomplete).toEqual(['functional/b/webgl']);
    expect(report.disagreed).toEqual([]);
  });

  it('treats a failed capture as absent rather than as a hash', () => {
    const report = compareCalibrationRuns([run({ 'functional/a/webgl': 'a' }), run({ 'functional/a/webgl': null })]);

    expect(report.incomplete).toEqual(['functional/a/webgl']);
  });

  it('compares more than two runs', () => {
    const report = compareCalibrationRuns([
      run({ 'functional/a/webgl': 'a' }),
      run({ 'functional/a/webgl': 'a' }),
      run({ 'functional/a/webgl': 'c' }),
    ]);

    expect(report.runs).toBe(3);
    expect(report.disagreed).toEqual(['functional/a/webgl']);
  });
});

describe('formatCalibrationReport', () => {
  // ★ THE FIRING TEST FOR THE VERDICT BUG THIS TOOL SHIPPED WITH. With nothing compared, the two-branch
  // version fell through and announced "at least one cell differed" — a verdict about a measurement that
  // never happened, produced by the tool built to prevent exactly that.
  it('says nothing was compared rather than claiming a disagreement', () => {
    const text = formatCalibrationReport(compareCalibrationRuns([run({}), run({})]));

    expect(text).toContain('NOTHING WAS COMPARED');
    expect(text).not.toContain('at least one cell differed');
  });

  it('states a single-environment verdict when everything agreed', () => {
    const text = formatCalibrationReport(
      compareCalibrationRuns([run({ 'functional/a/webgl': 'a' }), run({ 'functional/a/webgl': 'a' })]),
    );

    expect(text).toContain('byte-identical across the runs given');
    // ★ It must NOT assert a canonical environment: the tool is handed directories and cannot tell a
    // two-host comparison from two repeats on one machine, which answer different questions.
    expect(text).toContain('cannot tell which');
    expect(text).not.toMatch(/single canonical environment is viable/);
  });

  it('demands a magnitude measurement when anything differed, rather than implying a threshold', () => {
    const text = formatCalibrationReport(
      compareCalibrationRuns([run({ 'functional/a/webgl': 'a' }), run({ 'functional/a/webgl': 'b' })]),
    );

    // Hash equality can say THAT two renders differ and never HOW far apart they are; the report must not
    // let a reader infer a tolerance from it.
    expect(text).toContain('magnitude measurement is now required');
    expect(text).toContain('cannot say HOW far apart');
  });
});

function run(cells: Readonly<Record<string, string | null>>): string {
  const root = mkdtempSync(join(tmpdir(), 'oracle-calib-'));
  for (const [identity, hash] of Object.entries(cells)) {
    const [subject, entry, renderer] = identity.split('/');
    const directory = join(root, subject!, entry!, renderer!);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'status.json'),
      JSON.stringify(hash === null ? { error: 'boom', state: 'error' } : { hash: hash.repeat(64), state: 'ready' }),
    );
  }
  return root;
}

describe('formatCalibrationReport, on the population it compared', () => {
  it('names every agreed cell rather than only counting them', () => {
    // ★ THE FIRING TEST FOR A GAP THAT ALREADY COST SOMETHING. The cross-host run behind the first
    // blessed reference recorded only "eight GPU-shaded cells"; when that lock was later questioned,
    // the tree could not say whether the locked cell had been among the eight, so a measurement that
    // may well have covered it could not be used to defend it. A count cannot answer "was this one
    // covered", and that is the only question a reader comes back with.
    const text = formatCalibrationReport({
      agreed: ['functional/shape-fill-solid/webgl'],
      cells: [{ hashes: ['a', 'a'], identity: 'functional/shape-fill-solid/webgl' }],
      disagreed: [],
      incomplete: [],
      runs: 2,
      seen: 1,
    });

    expect(text).toContain('AGREED     functional/shape-fill-solid/webgl');
  });
});

describe('formatCalibrationReport, on its own accounting', () => {
  it('says BROKEN when the buckets do not sum to the cells seen', () => {
    // The exact shape of the real miss: totals that look complete because nothing names the discrepancy.
    const text = formatCalibrationReport({
      agreed: ['functional/a/webgl'],
      cells: [{ hashes: ['a', 'a'], identity: 'functional/a/webgl' }],
      disagreed: [],
      incomplete: [],
      runs: 2,
      seen: 3,
    });

    expect(text).toContain('accounting:        BROKEN');
    expect(text).toContain('2 cell(s) unaccounted for');
  });
});

describe('compareCalibrationRuns, on cells that never produced a hash', () => {
  // ★ THE DEFEATING TEST FOR A CELL THAT VANISHED RATHER THAN BEING LABELLED. `readRunHashes` used to
  // record a cell only when its status parsed AND said `ready`, and the identity set was built from
  // those keys — so a cell that FAILED ON EVERY RUN entered no map, no identity set, and no bucket. It
  // did not appear as `incomplete`; it disappeared, and the report's own totals looked complete without
  // it. That is the exact failure the doc comment promised could not happen, and it went unnoticed in a
  // real cross-host run: 491/0/0 against a 493-cell corpus, caught only because someone happened to know
  // the corpus size.
  it('reports a cell that failed on EVERY run as incomplete, not as absent', () => {
    const a = run({ 'functional/broken/webgl': null, 'functional/fine/webgl': 'a' });
    const b = run({ 'functional/broken/webgl': null, 'functional/fine/webgl': 'a' });

    const report = compareCalibrationRuns([a, b]);

    expect(report.incomplete).toEqual(['functional/broken/webgl']);
    expect(report.agreed).toEqual(['functional/fine/webgl']);
    expect(report.seen).toBe(2);
  });

  it('counts a cell whose status.json is unparseable as seen and incomplete', () => {
    // A directory containing a status.json IS the cell, whatever the file says. Treating an unreadable
    // status as "an absent measurement" inferred the cell's existence from its content — the same class
    // of error as keying on `state === 'ready'`.
    const a = run({ 'functional/fine/webgl': 'a' });
    writeFileSync(join(a, 'functional', 'fine', 'webgl', 'status.json'), '{ not json');

    const report = compareCalibrationRuns([a, run({ 'functional/fine/webgl': 'a' })]);

    expect(report.incomplete).toEqual(['functional/fine/webgl']);
    expect(report.seen).toBe(1);
  });

  it('accounts for every seen cell in exactly one bucket', () => {
    const a = run({ 'functional/agree/webgl': 'a', 'functional/differ/webgl': 'b', 'functional/gone/webgl': null });
    const b = run({ 'functional/agree/webgl': 'a', 'functional/differ/webgl': 'c', 'functional/gone/webgl': null });

    const report = compareCalibrationRuns([a, b]);

    expect(report.agreed.length + report.disagreed.length + report.incomplete.length).toBe(report.seen);
    expect(report.seen).toBe(3);
  });
});
