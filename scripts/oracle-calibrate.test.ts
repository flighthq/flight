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
