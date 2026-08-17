import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CalibrationRootIdentity } from './oracle-calibrate';
import {
  compareCalibrationRuns,
  deriveCalibrationIdentityVerdict,
  findDuplicateCalibrationRoot,
  formatCalibrationReport,
  readCaptureRootIdentity,
} from './oracle-calibrate';

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

/**
 * A capture root on disk. `provenance` is written into every status, or omitted entirely — which is the
 * real corpus's shape, since it predates the fields.
 */
function run(cells: Readonly<Record<string, string | null>>, provenance?: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'oracle-calib-'));
  for (const [identity, hash] of Object.entries(cells)) {
    const [subject, entry, renderer] = identity.split('/');
    const directory = join(root, subject!, entry!, renderer!);
    mkdirSync(directory, { recursive: true });
    const status = hash === null ? { error: 'boom', state: 'error' } : { hash: hash.repeat(64), state: 'ready' };
    writeFileSync(
      join(directory, 'status.json'),
      JSON.stringify(provenance === undefined ? status : { ...status, provenance }),
    );
  }
  return root;
}

/** The identity a root with no recorded provenance produces — what `formatCalibrationReport` is handed. */
function unrecorded(root: string, seen: number): CalibrationRootIdentity {
  return { environmentId: null, hostInstanceId: null, mixedEnvironments: false, mixedHosts: false, root, seen };
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
      identities: [unrecorded('run-a', 1), unrecorded('run-b', 1)],
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
      identities: [unrecorded('run-a', 1), unrecorded('run-b', 1)],
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

describe('readCaptureRootIdentity', () => {
  it('reads the host and environment the captures recorded', () => {
    const root = run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-1' });

    expect(readCaptureRootIdentity(root)).toMatchObject({
      environmentId: 'env-1',
      hostInstanceId: 'host-1',
      mixedEnvironments: false,
      mixedHosts: false,
      seen: 1,
    });
  });

  // ★ MIXED IS NOT MISSING. A root whose statuses disagree about their host must not report the same
  // `null` as a root that recorded no host at all: "split these roots" and "re-capture with a tool that
  // records identity" are different remedies, and a single collapsed field cannot ask for either.
  it('reports a root whose statuses disagree as mixed, not as unrecorded', () => {
    const root = run(
      { 'functional/a/webgl': 'a', 'functional/b/webgl': 'a' },
      { environmentId: 'env-1', hostInstanceId: 'host-1' },
    );
    writeFileSync(
      join(root, 'functional', 'b', 'webgl', 'status.json'),
      JSON.stringify({
        hash: 'a'.repeat(64),
        provenance: { environmentId: 'env-1', hostInstanceId: 'other' },
        state: 'ready',
      }),
    );

    const identity = readCaptureRootIdentity(root);

    expect(identity.mixedHosts).toBe(true);
    expect(identity.hostInstanceId).toBeNull();
    expect(identity.mixedEnvironments).toBe(false);
  });

  it('reports no identity for captures that record none', () => {
    const identity = readCaptureRootIdentity(run({ 'functional/a/webgl': 'a' }));

    expect(identity).toMatchObject({ environmentId: null, hostInstanceId: null, mixedHosts: false, seen: 1 });
  });

  it('scopes the walk to one subject when asked', () => {
    const root = run(
      { 'functional/a/webgl': 'a', 'other/b/webgl': 'a' },
      { environmentId: 'env-1', hostInstanceId: 'host-1' },
    );

    expect(readCaptureRootIdentity(root, 'functional').seen).toBe(1);
    expect(readCaptureRootIdentity(root).seen).toBe(2);
  });
});

describe('deriveCalibrationIdentityVerdict', () => {
  // ★ THE TWO FIELDS CARRY OPPOSITE INVARIANTS. Distinct hosts is what makes the runs INDEPENDENT; a
  // matching environment is what makes them COMPARABLE. A derivation that read the environment descriptor
  // as the host identity would reject every correct two-leg run while looking like a check working.
  it('calls distinct hosts under one environment independent and comparable', () => {
    expect(deriveCalibrationIdentityVerdict([identity('host-1', 'env-1'), identity('host-2', 'env-1')])).toEqual({
      environment: 'matching-environment',
      hosts: 'independent-hosts',
    });
  });

  it('calls a repeated host one-host, whatever the environment says', () => {
    expect(deriveCalibrationIdentityVerdict([identity('host-1', 'env-1'), identity('host-1', 'env-1')]).hosts).toBe(
      'one-host',
    );
  });

  // ★ ABSENT IS ITS OWN STATE, NEVER A FALLBACK TO ONE-HOST. "The captures do not say which machine" and
  // "the captures say one machine" have opposite remedies, and this is the corpus that predates the field.
  it('calls an absent host identity unevaluated rather than one-host', () => {
    expect(deriveCalibrationIdentityVerdict([identity(null, 'env-1'), identity('host-2', 'env-1')]).hosts).toBe(
      'host-identity-missing',
    );
  });

  it('reports a root that is not one host before it reports anything about the pair', () => {
    const mixed = { ...identity(null, 'env-1'), mixedHosts: true };

    expect(deriveCalibrationIdentityVerdict([mixed, identity('host-2', 'env-1')]).hosts).toBe(
      'mixed-hosts-within-root',
    );
  });

  it('reports differing declared environments as a mismatch', () => {
    expect(
      deriveCalibrationIdentityVerdict([identity('host-1', 'env-1'), identity('host-2', 'env-2')]).environment,
    ).toBe('environment-mismatch');
  });

  it('distinguishes an unrecorded environment from a mismatching one', () => {
    expect(deriveCalibrationIdentityVerdict([identity('host-1', null), identity('host-2', 'env-2')]).environment).toBe(
      'environment-identity-missing',
    );
  });
});

describe('formatCalibrationReport, on what the runs actually were', () => {
  // ★ THE FIRING TEST FOR THE DEFECT THIS REPLACED. `oracle-calibrate.yml` stamps a distinct
  // FLIGHT_CAPTURE_HOST_ID per matrix leg and says "keep both in every status so the comparer can enforce
  // both claims" — and the comparer read only the pixel hash, so it printed a both-branches disclaimer
  // over data that already answered the question. A tool that disclaims what its input states is not being
  // careful; it is not reading its input.
  it('states that the runs were independent hosts instead of offering both branches', () => {
    const text = formatCalibrationReport(
      compareCalibrationRuns([
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-1' }),
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-2' }),
      ]),
    );

    expect(text).toContain('hosts:       independent-hosts');
    expect(text).toContain('environment: matching-environment');
    expect(text).toContain('this IS the evidence a single canonical environment needs');
    expect(text).not.toContain('cannot tell which');
    // ★ Stability is not correctness, and the report must say so where the reader is most likely to
    // over-read it: at its own strongest verdict.
    expect(text).toContain('STABLE across hosts');
    expect(text).toContain('says nothing about whether they are CORRECT');
  });

  it('keeps the cannot-tell disclaimer when the captures record no host', () => {
    const text = formatCalibrationReport(
      compareCalibrationRuns([run({ 'functional/a/webgl': 'a' }), run({ 'functional/a/webgl': 'a' })]),
    );

    expect(text).toContain('hosts:       host-identity-missing');
    expect(text).toContain('cannot tell which');
    expect(text).not.toContain('this IS the evidence');
  });

  it('names one-host as one host rather than leaving it to the reader', () => {
    const text = formatCalibrationReport(
      compareCalibrationRuns([
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-1' }),
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-1' }),
      ]),
    );

    expect(text).toContain('hosts:       one-host');
    expect(text).toContain('measured ONE machine reproducing itself');
    expect(text).not.toContain('this IS the evidence');
  });

  // Agreement across two DIFFERENT declared environments is a real measurement of something else. The
  // §10 question is whether ONE environment reproduces across hosts, and this shape cannot answer it.
  it('refuses the canonical-environment reading when the roots declare different environments', () => {
    const text = formatCalibrationReport(
      compareCalibrationRuns([
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-1' }),
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-2', hostInstanceId: 'host-2' }),
      ]),
    );

    expect(text).toContain('environment: environment-mismatch');
    expect(text).toContain('does not answer the');
    expect(text).not.toContain('this IS the evidence');
  });

  it('prints the identities it read, so the verdict can be checked against them', () => {
    const text = formatCalibrationReport(
      compareCalibrationRuns([
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-1' }),
        run({ 'functional/a/webgl': 'a' }, { environmentId: 'env-1', hostInstanceId: 'host-2' }),
      ]),
    );

    expect(text).toContain('run 1  host host-1  env env-1');
    expect(text).toContain('run 2  host host-2  env env-1');
  });
});

function identity(hostInstanceId: string | null, environmentId: string | null): CalibrationRootIdentity {
  return { environmentId, hostInstanceId, mixedEnvironments: false, mixedHosts: false, root: 'root', seen: 1 };
}

describe('findDuplicateCalibrationRoot', () => {
  // ★ A ROOT COMPARED WITH ITSELF AGREES WITH ITSELF, AND THE REPORT LOOKS PERFECT. This is the one
  // misuse that produces the STRONGEST verdict the tool has over a comparison that never happened, and
  // it is a realistic slip: two long artifact paths differing in one character, typed by hand.
  it('finds a root given twice', () => {
    const root = run({ 'functional/a/webgl': 'a' });

    expect(findDuplicateCalibrationRoot([root, root])).toBe(root);
  });

  it('sees through a path spelled differently', () => {
    const root = run({ 'functional/a/webgl': 'a' });

    expect(findDuplicateCalibrationRoot([root, `${root}/.`])).toBe(`${root}/.`);
  });

  it('passes distinct roots', () => {
    expect(
      findDuplicateCalibrationRoot([run({ 'functional/a/webgl': 'a' }), run({ 'functional/a/webgl': 'a' })]),
    ).toBeNull();
  });

  // A root that does not exist is still comparable BY PATH: refusing the duplicate is more useful than
  // letting a typo through to a later "nothing was compared", which names the wrong problem.
  it('compares roots that do not exist yet by resolved path', () => {
    expect(findDuplicateCalibrationRoot(['./missing-root', 'missing-root'])).toBe('missing-root');
  });
});

describe('compareCalibrationRuns, on the shape a downloaded calibration artifact actually has', () => {
  // ★ THE REHEARSAL FOR THE REAL ROOTS, RUN BEFORE THEY ARRIVE. `oracle-calibrate.yml` stages
  // `calibration/functional/<entry>/<renderer>/status.json` and uploads `calibration` as
  // `calibration-host-<n>`, so an extracted artifact root has `functional/` at its top level and the
  // host id is `<run>-<attempt>-leg-<n>`. Encoding that here means a layout or id-format surprise fails
  // in a test rather than in the one run that matters.
  it('derives independent hosts in one environment from two extracted artifact roots', () => {
    const environmentId = 'sha256-0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';
    const report = compareCalibrationRuns([
      run({ 'functional/shape-fill-solid/webgl': 'a' }, { environmentId, hostInstanceId: '32050363125-1-leg-1' }),
      run({ 'functional/shape-fill-solid/webgl': 'a' }, { environmentId, hostInstanceId: '32050363125-1-leg-2' }),
    ]);

    expect(deriveCalibrationIdentityVerdict(report.identities)).toEqual({
      environment: 'matching-environment',
      hosts: 'independent-hosts',
    });
    expect(report.agreed).toEqual(['functional/shape-fill-solid/webgl']);
    expect(formatCalibrationReport(report)).toContain('this IS the evidence a single canonical environment needs');
  });
});
