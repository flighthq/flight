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
  ImportConformanceMeasuredCapability,
  ImportConformanceMeasuredPack,
  ImportConformanceNotRunPack,
  ImportConformanceOutcomeCounts,
  ImportConformanceScore,
  ImportConformanceUnknownCapability,
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

    expect(report.packs[0].baseline?.summary.exercised.instrumented.passedCapabilities).toBe(
      report.packs[0].current?.summary.exercised.instrumented.passedCapabilities,
    );
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'capability-regressed',
      detail: 'changed from passing to failing',
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

    expect(report.packs[0].baseline?.summary.exercised.instrumented.capabilities).toBe(
      report.packs[0].current?.summary.exercised.instrumented.capabilities,
    );
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'capability-instrumentation-regressed',
      detail: 'was measured and is now UNKNOWN because diagnostic instrumentation is missing',
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
    baselineCapability.instrumentationProofs = ['fire-test:alpha-primary', 'fire-test:alpha-secondary'];
    const removedCapability = measuredCapability('alpha');
    removedCapability.instrumentationProofs = ['fire-test:alpha-primary'];
    const replacedCapability = measuredCapability('alpha');
    replacedCapability.instrumentationProofs = ['fire-test:alpha-replacement', 'fire-test:alpha-secondary'];

    const removed = compareImportConformanceScores(
      score(measuredPack([baselineCapability]), '100'),
      score(measuredPack([removedCapability]), '101'),
    );
    const replaced = compareImportConformanceScores(
      score(measuredPack([baselineCapability]), '100'),
      score(measuredPack([replacedCapability]), '101'),
    );

    expect(removed.state).toBe('regression');
    expect(removed.packs[0].findings[0].code).toBe('instrumentation-proof-changed');
    expect(replaced.state).toBe('regression');
    expect(replaced.packs[0].findings[0].code).toBe('instrumentation-proof-changed');
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

    expect(output).toContain('exercised 1/2 → 1/2; instrumented 1/1 → 1/1; pass 1/1 → 1/1; single-witness 0 → 0');
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
    pack.summary.exercised.instrumented.passedCapabilities = 0;

    expect(() => parseImportConformanceScore(score(pack, '100'))).toThrow(
      'exercised.instrumented.passedCapabilities: must equal the capability rows (1)',
    );
  });

  it('accepts UNKNOWN as exercised but structurally outside the instrumented denominator', () => {
    const pack = measuredPack([measuredCapability('alpha', 2, 'pass'), unknownCapability('beta', 1)]);
    const parsed = parseImportConformanceScore(score(pack, '100'));

    expect(parsed.packs[0]).toMatchObject({
      state: 'measured',
      summary: {
        exercised: {
          capabilities: 2,
          instrumented: { capabilities: 1, passedCapabilities: 1 },
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
      "result: cannot be 'pass' when a defect outcome is present",
    );

    const unexplainedFailure = measuredCapability('alpha', 1, 'fail');
    expect(() => parseImportConformanceScore(score(measuredPack([unexplainedFailure]), '100'))).toThrow(
      "result: cannot be 'fail' without a defect outcome",
    );
  });

  it('cannot represent an instrumented capability without stable firing-test proof', () => {
    const absent = measuredCapability('alpha') as unknown as Record<string, unknown>;
    delete absent.instrumentationProofs;
    const empty = { ...measuredCapability('alpha'), instrumentationProofs: [] };
    const duplicate = { ...measuredCapability('alpha'), instrumentationProofs: ['proof-a', 'proof-a'] };

    expect(() => parseImportConformanceScore(score(measuredPack([absent as never]), '100'))).toThrow(
      'must contain exactly: id, instrumentationProofs, outcomes, result, state, witnesses',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([empty as never]), '100'))).toThrow(
      'instrumentationProofs: must be a non-empty array',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([duplicate as never]), '100'))).toThrow(
      'instrumentationProofs: instrumentation proof ids must be unique and sorted in ascending order',
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
      expect(output.join('\n')).toContain('capability-regressed [alpha]');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

function measuredCapability(
  id: string,
  witnesses = 2,
  result: ImportConformanceMeasuredCapability['result'] = 'pass',
  outcomeCounts = outcomes(),
): ImportConformanceMeasuredCapability {
  return {
    id,
    instrumentationProofs: [`fire-test:${id}`],
    outcomes: outcomeCounts,
    result,
    state: 'measured',
    witnesses,
  };
}

function measuredPack(
  capabilities: ImportConformanceCapability[] = [measuredCapability('alpha'), unmeasuredCapability('beta')],
  overrides: Partial<ImportConformanceMeasuredPack> = {},
): ImportConformanceMeasuredPack {
  const measured = capabilities.filter(
    (capability): capability is ImportConformanceMeasuredCapability => capability.state === 'measured',
  );
  const unknown = capabilities.filter(
    (capability): capability is ImportConformanceUnknownCapability => capability.state === 'unknown',
  );
  return {
    capabilities,
    id: 'swf-ruffle-fixtures',
    importerSourceHash: 'sha256:importer',
    outcomes: outcomes(),
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
        capabilities: measured.length + unknown.length,
        instrumented: {
          capabilities: measured.length,
          passedCapabilities: measured.filter((capability) => capability.result === 'pass').length,
        },
        singleWitnessCapabilities:
          measured.filter((capability) => capability.witnesses === 1).length +
          unknown.filter((capability) => capability.witnesses === 1).length,
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

function unknownCapability(id: string, witnesses: number): ImportConformanceUnknownCapability {
  return { id, reason: 'diagnostic-instrumentation-missing', state: 'unknown', witnesses };
}

const PLAN_HASH = 'sha256:plan';
