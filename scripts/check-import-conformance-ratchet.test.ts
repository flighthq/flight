import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  compareImportConformanceScores,
  formatImportConformanceRatchetReport,
  getImportConformanceRatchetExitCode,
  runImportConformanceRatchet,
} from './check-import-conformance-ratchet';
import { parseImportConformanceScore } from './import-conformance-score';
import type {
  ImportConformanceCapability,
  ImportConformanceExercisedCapability,
  ImportConformanceMeasuredPack,
  ImportConformanceNotRunPack,
  ImportConformanceOutcomeCounts,
  ImportConformanceScore,
} from './import-conformance-score';

describe('compareImportConformanceScores', () => {
  it('passes stable keyed evidence and allows an unmeasured capability to gain its first witness', () => {
    const baseline = score(measuredPack([measuredCapability('alpha', 2, 'pass'), unmeasuredCapability('beta')]), '100');
    const current = score(
      measuredPack([measuredCapability('alpha', 2, 'pass'), measuredCapability('beta', 1, 'pass')]),
      '101',
    );

    const report = compareImportConformanceScores(baseline, current);

    expect(report.state).toBe('pass');
    expect(report.packs[0].findings).toEqual([]);
    expect(getImportConformanceRatchetExitCode(report)).toBe(0);
  });

  // Defeating condition 1: absence must not turn a pack into zero observations or remove it from the
  // denominator. The ratchet retains its identity as NOT RUN and returns the distinct inconclusive code.
  it('reports a MISSING PACK as NOT RUN, never as zero or pass', () => {
    const report = compareImportConformanceScores(score(measuredPack(), '100'), score(null, '101'));

    expect(report.state).toBe('not-run');
    expect(report.packs[0]).toMatchObject({ id: 'swf-ruffle-fixtures', state: 'not-run' });
    expect(report.packs[0].findings[0].code).toBe('missing-pack');
    expect(getImportConformanceRatchetExitCode(report)).toBe(2);
  });

  // Defeating condition 2: one newly measured capability cannot replace a witness lost by another.
  // The two aggregate counts below are identical; only the stable capability key exposes the regression.
  it('fails a NO-WITNESS capability even when another capability masks it in the aggregate', () => {
    const baseline = score(measuredPack([measuredCapability('alpha', 2, 'pass'), unmeasuredCapability('beta')]), '100');
    const current = score(measuredPack([unmeasuredCapability('alpha'), measuredCapability('beta', 2, 'pass')]), '101');

    const report = compareImportConformanceScores(baseline, current);

    expect(report.packs[0].baseline?.summary.exercised.capabilities).toBe(
      report.packs[0].current?.summary.exercised.capabilities,
    );
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'capability-lost-witnesses',
      detail: 'had 2 witnesses and is now UNMEASURED',
    });
    expect(getImportConformanceRatchetExitCode(report)).toBe(1);
  });

  it('fails a keyed pass regression that an equal aggregate pass count would hide', () => {
    const baseline = score(
      measuredPack([
        measuredCapability('alpha', 2, 'pass'),
        measuredCapability('beta', 2, 'fail', outcomes({ threw: 1 })),
      ]),
      '100',
    );
    const current = score(
      measuredPack([
        measuredCapability('alpha', 2, 'fail', outcomes({ silentlyWrong: 1 })),
        measuredCapability('beta', 2, 'pass'),
      ]),
      '101',
    );

    const report = compareImportConformanceScores(baseline, current);

    expect(report.packs[0].baseline?.summary.exercised.fireProven.results.passedCapabilities).toBe(
      report.packs[0].current?.summary.exercised.fireProven.results.passedCapabilities,
    );
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'fire-result-regressed',
      detail: 'fire lane changed from passing to failing',
    });
  });

  it('fails a witness-depth decrease without weighting aggregates', () => {
    const report = compareImportConformanceScores(
      score(measuredPack([measuredCapability('alpha', 3, 'pass')]), '100'),
      score(measuredPack([measuredCapability('alpha', 1, 'pass')]), '101'),
    );

    expect(report.state).toBe('regression');
    expect(report.packs[0].findings[0]).toMatchObject({
      capabilityId: 'alpha',
      code: 'witness-depth-regressed',
    });
  });

  it('requires the caller to explicitly allow a baseline with UNKNOWN instrumentation', () => {
    const baseline = score(measuredPack([unknownCapability('alpha', 2)]), '100');
    const current = score(
      measuredPack([measuredCapability('alpha', 2, 'fail', outcomes({ importedWrong: 1 }))]),
      '101',
    );

    const strict = compareImportConformanceScores(baseline, current);
    const dayOne = compareImportConformanceScores(baseline, current, { unknownBaseline: 'allow' });

    expect(strict.state).toBe('incomparable');
    expect(strict.packs[0].findings[0].code).toBe('baseline-contains-unknown');
    expect(dayOne.state).toBe('pass');
    expect(dayOne.packs[0].findings).toEqual([]);
  });

  it('fails measured-to-UNKNOWN instrumentation loss even when another keyed gain masks the aggregate', () => {
    const baseline = score(measuredPack([measuredCapability('alpha', 2, 'pass'), unknownCapability('beta', 2)]), '100');
    const current = score(measuredPack([unknownCapability('alpha', 2), measuredCapability('beta', 2, 'pass')]), '101');

    const report = compareImportConformanceScores(baseline, current, { unknownBaseline: 'allow' });

    expect(report.packs[0].baseline?.summary.exercised.fireProven.capabilities).toBe(
      report.packs[0].current?.summary.exercised.fireProven.capabilities,
    );
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'instrumentation-firing-proof-lost',
      detail: 'firing-test instrumentation was proven and is now UNPROVEN',
    });
  });

  it('ratchets witnesses for UNKNOWN rows and fails UNKNOWN-to-UNMEASURED loss', () => {
    const shallower = compareImportConformanceScores(
      score(measuredPack([unknownCapability('alpha', 3)]), '100'),
      score(measuredPack([unknownCapability('alpha', 1)]), '101'),
      { unknownBaseline: 'allow' },
    );
    const absent = compareImportConformanceScores(
      score(measuredPack([unknownCapability('alpha', 3)]), '100'),
      score(measuredPack([unmeasuredCapability('alpha')]), '101'),
      { unknownBaseline: 'allow' },
    );

    expect(shallower.state).toBe('regression');
    expect(shallower.packs[0].findings[0].code).toBe('witness-depth-regressed');
    expect(absent.state).toBe('regression');
    expect(absent.packs[0].findings[0].code).toBe('capability-lost-witnesses');
  });

  it('ratchets firing-test proof removal and replacement on the stable capability key', () => {
    const baselineCapability = measuredCapability('alpha');
    baselineCapability.instrumentation.fires = {
      proofs: ['fire-test:alpha-primary', 'fire-test:alpha-secondary'],
      state: 'proven',
    };
    const removedCapability = measuredCapability('alpha');
    removedCapability.instrumentation.fires = { proofs: ['fire-test:alpha-primary'], state: 'proven' };
    const replacedCapability = measuredCapability('alpha');
    replacedCapability.instrumentation.fires = {
      proofs: ['fire-test:alpha-primary', 'fire-test:alpha-secondary'],
      state: 'proven',
    };
    replacedCapability.instrumentation.staysSilent = {
      proofs: ['silence-test:alpha-replacement'],
      state: 'proven',
    };

    const removed = compareImportConformanceScores(
      score(measuredPack([baselineCapability]), '100'),
      score(measuredPack([removedCapability]), '101'),
    );
    const replaced = compareImportConformanceScores(
      score(measuredPack([baselineCapability]), '100'),
      score(measuredPack([replacedCapability]), '101'),
    );

    expect(removed.state).toBe('regression');
    expect(removed.packs[0].findings[0].code).toBe('instrumentation-firing-proof-changed');
    expect(replaced.state).toBe('regression');
    expect(replaced.packs[0].findings[0].code).toBe('instrumentation-silence-proof-changed');
  });

  it('ratchets licensed pass to per-observation UNKNOWN independently in each proof lane', () => {
    const fire = compareImportConformanceScores(
      score(measuredPack([fireOnlyPass('alpha')]), '100'),
      score(measuredPack([fireOnlyUnknownCrumb('alpha')]), '101'),
      { unknownBaseline: 'allow' },
    );
    const silence = compareImportConformanceScores(
      score(measuredPack([silenceOnlyPass('alpha')]), '100'),
      score(measuredPack([silenceOnlyUnknownNoCrumb('alpha')]), '101'),
      { unknownBaseline: 'allow' },
    );

    expect(fire.state).toBe('regression');
    expect(fire.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'fire-result-became-unknown',
      detail: 'fire lane changed from PASS to UNKNOWN because an observation is unlicensed',
    });
    expect(silence.state).toBe('regression');
    expect(silence.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'silence-result-became-unknown',
      detail: 'silence lane changed from PASS to UNKNOWN because an observation is unlicensed',
    });
  });

  // Defeating condition 3: scores over different fixture material may both be internally correct, but
  // their delta is meaningless. The ratchet refuses the comparison instead of blessing either number.
  it('refuses a FIXTURE-RELEASE BUMP as incomparable', () => {
    const baseline = score(measuredPack(), '100');
    const current = score(measuredPack(undefined, { release: 'ruffle-fixtures-2026-08-08' }), '101');

    const report = compareImportConformanceScores(baseline, current);

    expect(report.state).toBe('incomparable');
    expect(report.packs[0].findings[0].code).toBe('fixture-release-changed');
    expect(getImportConformanceRatchetExitCode(report)).toBe(2);
  });

  it('also requires the exact fixture variant', () => {
    const report = compareImportConformanceScores(
      score(measuredPack(), '100'),
      score(measuredPack(undefined, { variant: 'without-licenses-v2' }), '101'),
    );

    expect(report.state).toBe('incomparable');
    expect(report.packs[0].findings[0].code).toBe('fixture-variant-changed');
  });

  // Defeating condition 4: one dead shard makes the whole pack NOT RUN. The completed capability below
  // looks perfect on purpose; its partial aggregate is structurally unreachable from the formatter.
  it('reports a DEAD SHARD as whole-pack NOT RUN and never formats its partial denominator', () => {
    const baselinePack = measuredPack([measuredCapability('alpha', 2, 'pass'), measuredCapability('beta', 2, 'pass')]);
    const currentPack: ImportConformanceNotRunPack = {
      ...baselinePack,
      capabilities: [
        measuredCapability('alpha', 2, 'pass'),
        {
          completedWitnesses: 1,
          expectedWitnesses: 2,
          id: 'beta',
          reason: 'missing-shard',
          state: 'not-run',
        },
      ],
      outcomes: null,
      reason: 'missing-shard',
      sharding: {
        ...baselinePack.sharding,
        shards: [
          { id: 0, state: 'measured' },
          { id: 1, reason: 'worker exited', state: 'not-run' },
        ],
      },
      state: 'not-run',
      summary: null,
    };
    const report = compareImportConformanceScores(score(baselinePack, '100'), score(currentPack, '101'));

    expect(report.state).toBe('not-run');
    expect(report.packs[0].state).toBe('not-run');
    expect(getImportConformanceRatchetExitCode(report)).toBe(2);
    expect(formatImportConformanceRatchetReport(report)).not.toContain('exercised ');
  });

  it('refuses a measured score with a smaller shard set even when its plan hash was copied', () => {
    const baseline = score(measuredPack(), '100');
    const current = score(
      measuredPack(undefined, {
        sharding: {
          algorithm: 'fixture-count-v1',
          planHash: PLAN_HASH,
          shards: [{ id: 0, state: 'measured' }],
        },
      }),
      '101',
    );

    const report = compareImportConformanceScores(baseline, current);

    expect(report.state).toBe('incomparable');
    expect(report.packs[0].findings[0].code).toBe('shard-set-changed');
  });

  it('refuses shard-plan variance as an incomparable measurement rather than gating on noise', () => {
    const report = compareImportConformanceScores(
      score(measuredPack(), '100'),
      score(
        measuredPack(undefined, {
          sharding: {
            algorithm: 'fixture-count-v1',
            planHash: 'sha256:different-plan',
            shards: [
              { id: 0, state: 'measured' },
              { id: 1, state: 'measured' },
            ],
          },
        }),
        '101',
      ),
    );

    const reportFinding = report.packs[0].findings[0];
    expect(report.state).toBe('incomparable');
    expect(reportFinding.code).toBe('shard-plan-changed');
  });

  it('refuses to compare a score artifact to the same run that seeded its baseline', () => {
    const report = compareImportConformanceScores(score(measuredPack(), '100'), score(measuredPack(), '100'));

    expect(report.state).toBe('incomparable');
    expect(report.packs[0].findings[0].code).toBe('reused-run');
  });
});

describe('formatImportConformanceRatchetReport', () => {
  it('reports all four nested population levels together for every measured pack', () => {
    const report = compareImportConformanceScores(score(measuredPack(), '100'), score(measuredPack(), '101'));
    const output = formatImportConformanceRatchetReport(report);

    expect(output).toContain(
      'exercised 1/2 → 1/2; fire-proven 1/1 → 1/1; fire results pass 1/1, fail 0/1, unknown 0/1 → pass 1/1, fail 0/1, unknown 0/1; silence-proven 1/1 → 1/1; silence results pass 1/1, fail 0/1, unknown 0/1 → pass 1/1, fail 0/1, unknown 0/1',
    );
  });
});

describe('parseImportConformanceScore', () => {
  // Defeating condition 5: a plausible number with no named full run behind it is not a baseline. This
  // is the mechanical boundary that prevents the old 306-file census from becoming an authoritative seed.
  it('refuses an UNKNOWN-PROVENANCE baseline', () => {
    const missingProvenance: Record<string, unknown> = { ...score(measuredPack(), '100') };
    delete missingProvenance.provenance;

    expect(() => parseImportConformanceScore(missingProvenance, 'baseline')).toThrow(
      'must contain exactly: packs, provenance, schemaVersion',
    );
  });

  it('refuses provenance that does not name an exhaustive run', () => {
    const subset = {
      ...score(measuredPack(), '100'),
      provenance: { mode: 'subset', runId: '100', runUrl: 'https://ci.invalid/runs/100' },
    };

    expect(() => parseImportConformanceScore(subset, 'baseline')).toThrow("mode: must be exactly 'exhaustive'");
  });

  it('refuses a measured capability with zero witnesses before reading it as pass or fail', () => {
    const invalid = score(measuredPack([measuredCapability('alpha', 0, 'pass')]), '100');

    expect(() => parseImportConformanceScore(invalid)).toThrow(
      'witnesses: must be an integer greater than or equal to 1',
    );
  });

  it('refuses aggregates that do not exactly follow the stable capability rows', () => {
    const pack = measuredPack();
    pack.summary.exercised.fireProven.results.passedCapabilities = 0;

    expect(() => parseImportConformanceScore(score(pack, '100'))).toThrow(
      'exercised.fireProven.results.passedCapabilities: must equal the capability rows (1)',
    );
  });

  it('accepts UNKNOWN observations as exercised but outside both proven populations', () => {
    const pack = measuredPack([measuredCapability('alpha', 2, 'pass'), unknownCapability('beta', 1)]);
    const parsed = parseImportConformanceScore(score(pack, '100'));

    expect(parsed.packs[0]).toMatchObject({
      state: 'measured',
      summary: {
        exercised: {
          capabilities: 2,
          fireProven: {
            capabilities: 1,
            results: { failedCapabilities: 0, passedCapabilities: 1, unknownCapabilities: 0 },
          },
          silenceProven: {
            capabilities: 1,
            results: { failedCapabilities: 0, passedCapabilities: 1, unknownCapabilities: 0 },
          },
          singleWitnessCapabilities: 1,
        },
        totalCapabilities: 2,
      },
    });
  });

  it('rejects a flat UNKNOWN alias and UNKNOWN without a witness', () => {
    const flat = measuredPack([unknownCapability('alpha', 1)]) as unknown as Record<string, unknown>;
    flat.summary = {
      exercisedCapabilities: 1,
      passedCapabilities: 0,
      singleWitnessCapabilities: 1,
      totalCapabilities: 1,
      unknownCapabilities: 1,
    };
    const noWitness = measuredPack([unknownCapability('alpha', 0)]);

    expect(() => parseImportConformanceScore(score(flat as never, '100'))).toThrow(
      'summary: must contain exactly: exercised, totalCapabilities',
    );
    expect(() => parseImportConformanceScore(score(noWitness, '100'))).toThrow(
      'witnesses: must be an integer greater than or equal to 1',
    );
  });

  it('keeps strict instrumentation-incomplete NOT RUN expressible with no numeric aggregate', () => {
    const measured = measuredPack([measuredCapability('alpha', 2, 'pass'), unknownCapability('beta', 2)]);
    const notRun: ImportConformanceNotRunPack = {
      ...measured,
      outcomes: null,
      reason: 'instrumentation-incomplete',
      state: 'not-run',
      summary: null,
    };

    const parsed = parseImportConformanceScore(score(notRun, '101'));
    const report = compareImportConformanceScores(score(measuredPack(), '100'), parsed);

    expect(parsed.packs[0]).toMatchObject({ outcomes: null, reason: 'instrumentation-incomplete', summary: null });
    expect(report.state).toBe('not-run');
    expect(formatImportConformanceRatchetReport(report)).not.toContain('exercised ');
  });

  it('refuses a measured pack that labels any shard not-run', () => {
    const pack = measuredPack();
    pack.sharding.shards[1] = { id: 1, reason: 'worker exited', state: 'not-run' };

    expect(() => parseImportConformanceScore(score(pack, '100'))).toThrow(
      "a measured pack cannot contain a 'not-run' shard",
    );
  });

  it('allows cleanly reported unsupported evidence to pass but never a defect outcome', () => {
    const clean = measuredCapability('alpha', 1, 'pass', outcomes({ unsupportedClean: 1 }));
    expect(parseImportConformanceScore(score(measuredPack([clean]), '100')).packs[0].state).toBe('measured');

    const silent = measuredCapability('alpha', 1, 'pass', outcomes({ silentlyWrong: 1 }));
    expect(() => parseImportConformanceScore(score(measuredPack([silent]), '100'))).toThrow(
      "results.fire.state: must equal the licensed observations ('fail')",
    );

    const unexplainedFailure = measuredCapability('alpha', 1, 'fail');
    expect(() => parseImportConformanceScore(score(measuredPack([unexplainedFailure]), '100'))).toThrow(
      "results.fire.state: must equal the licensed observations ('pass')",
    );
  });

  it('keeps the fire-proven and silence-proven populations and verdicts independent', () => {
    const pack = measuredPack([
      fireOnlyPass('alpha'),
      fireOnlyUnknownCrumb('beta'),
      mixedDirectFailAndUnknown('delta'),
      silenceOnlyPass('epsilon'),
      silenceOnlyUnknownNoCrumb('gamma'),
    ]);
    const parsed = parseImportConformanceScore(score(pack, '100'));

    expect(parsed.packs[0]).toMatchObject({
      summary: {
        exercised: {
          capabilities: 5,
          fireProven: {
            capabilities: 3,
            results: { failedCapabilities: 1, passedCapabilities: 1, unknownCapabilities: 1 },
          },
          silenceProven: {
            capabilities: 2,
            results: { failedCapabilities: 0, passedCapabilities: 1, unknownCapabilities: 1 },
          },
        },
      },
    });
    const exercised = parsed.packs[0].capabilities.filter(
      (capability): capability is ImportConformanceExercisedCapability => capability.state === 'exercised',
    );
    expect(exercised.find((capability) => capability.id === 'delta')?.unknownObservations).toEqual([
      { reason: 'silence-proof-missing-for-crumb', reference: 'fixture:delta:crumb' },
    ]);
  });

  it('never counts an unlicensed semantic observation under the four outcome fields', () => {
    const noFire = silenceOnlyUnknownNoCrumb('alpha');
    noFire.witnesses = 2;
    noFire.outcomes.silentlyWrong = 1;
    const noSilence = fireOnlyUnknownCrumb('alpha');
    noSilence.witnesses = 2;
    noSilence.outcomes.unsupportedClean = 1;

    expect(() => parseImportConformanceScore(score(measuredPack([noFire]), '100'))).toThrow(
      'no-crumb pass or silently-wrong outcomes require proven firing instrumentation',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([noSilence]), '100'))).toThrow(
      'outcomes.unsupportedClean: requires proven silence instrumentation',
    );
  });

  it('requires every UNKNOWN observation to retain a unique reference and an exact actionable reason', () => {
    const duplicate = fireOnlyUnknownCrumb('alpha');
    duplicate.witnesses = 2;
    duplicate.unknownObservations.push({
      reason: 'fire-proof-missing-for-no-crumb',
      reference: 'fixture:alpha:crumb',
    });
    const wrongReason = fireOnlyUnknownCrumb('alpha');
    wrongReason.unknownObservations[0].reason = 'diagnostic-instrumentation-missing';

    expect(() => parseImportConformanceScore(score(measuredPack([duplicate]), '100'))).toThrow(
      'observation references must be unique and sorted in ascending order',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([wrongReason]), '100'))).toThrow(
      'requires both instrumentation directions to be unproven',
    );
  });

  it('removes the incoherent flat measured pack outcome aggregate', () => {
    const pack = { ...measuredPack(), outcomes: outcomes() };

    expect(() => parseImportConformanceScore(score(pack as never, '100'))).toThrow(
      'must contain exactly: capabilities, id, importerSourceHash, release, sharding, state, summary, variant',
    );
  });

  it('cannot represent proven instrumentation without stable proof ids', () => {
    const absent = measuredPack();
    delete (absent.capabilities[0] as unknown as Record<string, unknown>).instrumentation;
    const empty = {
      ...measuredCapability('alpha'),
      instrumentation: {
        fires: { proofs: [], state: 'proven' },
        staysSilent: { proofs: ['silence-test:alpha'], state: 'proven' },
      },
    };
    const duplicate = {
      ...measuredCapability('alpha'),
      instrumentation: {
        fires: { proofs: ['proof-a', 'proof-a'], state: 'proven' },
        staysSilent: { proofs: ['silence-test:alpha'], state: 'proven' },
      },
    };

    expect(() => parseImportConformanceScore(score(absent, '100'))).toThrow(
      'must contain exactly: id, instrumentation, outcomes, results, state, unknownObservations, witnesses',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([empty as never]), '100'))).toThrow(
      'instrumentation.fires.proofs: must be a non-empty array',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([duplicate as never]), '100'))).toThrow(
      'instrumentation.fires.proofs: instrumentation proof ids must be unique and sorted in ascending order',
    );
  });
});

describe('runImportConformanceRatchet', () => {
  it('only consumes an UNKNOWN baseline when the CLI policy flag selects it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-import-conformance-'));
    const baselinePath = join(directory, 'baseline.json');
    const currentPath = join(directory, 'current.json');
    writeFileSync(baselinePath, JSON.stringify(score(measuredPack([unknownCapability('alpha', 2)]), '100')));
    writeFileSync(currentPath, JSON.stringify(score(measuredPack([measuredCapability('alpha', 2, 'pass')]), '101')));

    try {
      const args = ['--baseline', baselinePath, '--current', currentPath];
      expect(
        runImportConformanceRatchet(
          args,
          () => {},
          () => {},
        ),
      ).toBe(2);
      expect(
        runImportConformanceRatchet(
          ['--allow-unknown-baseline', ...args],
          () => {},
          () => {},
        ),
      ).toBe(0);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  // The synthetic importer break is deliberately written to files and driven through the real command
  // boundary. A later arc checkpoint repeats this against the real runner/importer before enforcement.
  it('returns red for a deliberately broken importer score', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-import-conformance-'));
    const baselinePath = join(directory, 'baseline.json');
    const currentPath = join(directory, 'current.json');
    const baseline = score(measuredPack([measuredCapability('alpha', 2, 'pass')]), '100');
    const current = score(
      measuredPack([measuredCapability('alpha', 2, 'fail', outcomes({ silentlyWrong: 1 }))]),
      '101',
    );
    writeFileSync(baselinePath, JSON.stringify(baseline));
    writeFileSync(currentPath, JSON.stringify(current));
    const output: string[] = [];
    const errors: string[] = [];

    try {
      const code = runImportConformanceRatchet(
        ['--baseline', baselinePath, '--current', currentPath],
        (message) => output.push(message),
        (message) => errors.push(message),
      );

      expect(code).toBe(1);
      expect(errors).toEqual([]);
      expect(output.join('\n')).toContain('REGRESSION');
      expect(output.join('\n')).toContain('fire-result-regressed [alpha]');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

function measuredCapability(
  id: string,
  witnesses = 2,
  result: ImportConformanceExercisedCapability['results']['fire']['state'] = 'pass',
  outcomeCounts = outcomes(),
): ImportConformanceExercisedCapability {
  return {
    id,
    instrumentation: {
      fires: { proofs: [`fire-test:${id}`], state: 'proven' },
      staysSilent: { proofs: [`silence-test:${id}`], state: 'proven' },
    },
    outcomes: outcomeCounts,
    results: { fire: { state: result }, silence: { state: result } },
    state: 'exercised',
    unknownObservations: [],
    witnesses,
  };
}

function measuredPack(
  capabilities: ImportConformanceCapability[] = [measuredCapability('alpha'), unmeasuredCapability('beta')],
  overrides: Partial<ImportConformanceMeasuredPack> = {},
): ImportConformanceMeasuredPack {
  const measured = capabilities.filter(
    (capability): capability is ImportConformanceExercisedCapability => capability.state === 'exercised',
  );
  const fireProven = measured.filter((capability) => capability.instrumentation.fires.state === 'proven');
  const silenceProven = measured.filter((capability) => capability.instrumentation.staysSilent.state === 'proven');
  return {
    capabilities,
    id: 'swf-ruffle-fixtures',
    importerSourceHash: 'sha256:importer',
    release: 'ruffle-fixtures-2026-08-07',
    sharding: {
      algorithm: 'fixture-count-v1',
      planHash: PLAN_HASH,
      shards: [
        { id: 0, state: 'measured' },
        { id: 1, state: 'measured' },
      ],
    },
    state: 'measured',
    summary: {
      exercised: {
        capabilities: measured.length,
        fireProven: provenSummary(fireProven, 'fire'),
        silenceProven: provenSummary(silenceProven, 'silence'),
        singleWitnessCapabilities: measured.filter((capability) => capability.witnesses === 1).length,
      },
      totalCapabilities: capabilities.length,
    },
    variant: 'without-licenses',
    ...overrides,
  };
}

function outcomes(overrides: Partial<ImportConformanceOutcomeCounts> = {}): ImportConformanceOutcomeCounts {
  return { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 0, ...overrides };
}

function score(pack: ImportConformanceScore['packs'][number] | null, runId: string): ImportConformanceScore {
  return {
    packs: pack === null ? [] : [pack],
    provenance: { mode: 'exhaustive', runId, runUrl: `https://ci.invalid/runs/${runId}` },
    schemaVersion: 1,
  };
}

function unmeasuredCapability(id: string): ImportConformanceCapability {
  return { id, state: 'unmeasured' };
}

function unknownCapability(id: string, witnesses: number): ImportConformanceExercisedCapability {
  return {
    id,
    instrumentation: { fires: { state: 'unproven' }, staysSilent: { state: 'unproven' } },
    outcomes: outcomes(),
    results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
    state: 'exercised',
    unknownObservations: Array.from({ length: witnesses }, (_, index) => ({
      reason: 'diagnostic-instrumentation-missing',
      reference: `fixture:${id}:${index.toString().padStart(6, '0')}`,
    })),
    witnesses,
  };
}

function fireOnlyPass(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 1);
  capability.instrumentation.staysSilent = { state: 'unproven' };
  capability.results.silence = { state: 'unknown' };
  return capability;
}

function fireOnlyUnknownCrumb(id: string): ImportConformanceExercisedCapability {
  const capability = fireOnlyPass(id);
  capability.results.fire = { state: 'unknown' };
  capability.unknownObservations = [{ reason: 'silence-proof-missing-for-crumb', reference: `fixture:${id}:crumb` }];
  return capability;
}

function silenceOnlyPass(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 1, 'pass', outcomes({ unsupportedClean: 1 }));
  capability.instrumentation.fires = { state: 'unproven' };
  capability.results.fire = { state: 'unknown' };
  return capability;
}

function silenceOnlyUnknownNoCrumb(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 1);
  capability.instrumentation.fires = { state: 'unproven' };
  capability.results = { fire: { state: 'unknown' }, silence: { state: 'unknown' } };
  capability.unknownObservations = [{ reason: 'fire-proof-missing-for-no-crumb', reference: `fixture:${id}:no-crumb` }];
  return capability;
}

function mixedDirectFailAndUnknown(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 2, 'fail', outcomes({ importedWrong: 1 }));
  capability.instrumentation.staysSilent = { state: 'unproven' };
  capability.unknownObservations = [{ reason: 'silence-proof-missing-for-crumb', reference: `fixture:${id}:crumb` }];
  return capability;
}

function provenSummary(
  capabilities: ImportConformanceExercisedCapability[],
  lane: 'fire' | 'silence',
): ImportConformanceMeasuredPack['summary']['exercised']['fireProven'] {
  return {
    capabilities: capabilities.length,
    results: {
      failedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'fail').length,
      passedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'pass').length,
      unknownCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'unknown').length,
    },
  };
}

const PLAN_HASH = 'sha256:plan';
