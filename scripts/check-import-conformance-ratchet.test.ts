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
} from './import-conformance-score';

describe('compareImportConformanceScores', () => {
  it('passes stable keyed evidence and allows an unmeasured capability to gain its first witness', () => {
    const baseline = score(measuredPack([measuredCapability('alpha', 2, true), unmeasuredCapability('beta')]), '100');
    const current = score(
      measuredPack([measuredCapability('alpha', 2, true), measuredCapability('beta', 1, true)]),
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
    const baseline = score(measuredPack([measuredCapability('alpha', 2, true), unmeasuredCapability('beta')]), '100');
    const current = score(measuredPack([unmeasuredCapability('alpha'), measuredCapability('beta', 2, true)]), '101');

    const report = compareImportConformanceScores(baseline, current);

    expect(report.packs[0].baseline?.summary.exercisedCapabilities).toBe(
      report.packs[0].current?.summary.exercisedCapabilities,
    );
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'capability-lost-witnesses',
      detail: 'was measured with 2 witnesses and is now UNMEASURED',
    });
    expect(getImportConformanceRatchetExitCode(report)).toBe(1);
  });

  it('fails a keyed pass regression that an equal aggregate pass count would hide', () => {
    const baseline = score(
      measuredPack([measuredCapability('alpha', 2, true), measuredCapability('beta', 2, false)]),
      '100',
    );
    const current = score(
      measuredPack([measuredCapability('alpha', 2, false), measuredCapability('beta', 2, true)]),
      '101',
    );

    const report = compareImportConformanceScores(baseline, current);

    expect(report.packs[0].baseline?.summary.passedCapabilities).toBe(
      report.packs[0].current?.summary.passedCapabilities,
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
      score(measuredPack([measuredCapability('alpha', 3, true)]), '100'),
      score(measuredPack([measuredCapability('alpha', 1, true)]), '101'),
    );

    expect(report.state).toBe('regression');
    expect(report.packs[0].findings[0]).toMatchObject({
      capabilityId: 'alpha',
      code: 'witness-depth-regressed',
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
    const baselinePack = measuredPack([measuredCapability('alpha', 2, true), measuredCapability('beta', 2, true)]);
    const currentPack: ImportConformanceNotRunPack = {
      ...baselinePack,
      capabilities: [
        measuredCapability('alpha', 2, true),
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
  it('reports exercised, pass, and single-witness numbers together for every measured pack', () => {
    const report = compareImportConformanceScores(score(measuredPack(), '100'), score(measuredPack(), '101'));
    const output = formatImportConformanceRatchetReport(report);

    expect(output).toContain('exercised 1/2 → 1/2; pass 1/1 → 1/1; single-witness 0 → 0');
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
    const invalid = score(measuredPack([measuredCapability('alpha', 0, true)]), '100');

    expect(() => parseImportConformanceScore(invalid)).toThrow(
      'witnesses: must be an integer greater than or equal to 1',
    );
  });

  it('refuses aggregates that do not exactly follow the stable capability rows', () => {
    const pack = measuredPack();
    pack.summary.passedCapabilities = 0;

    expect(() => parseImportConformanceScore(score(pack, '100'))).toThrow(
      'passedCapabilities: must equal the capability rows (1)',
    );
  });

  it('refuses a measured pack that labels any shard not-run', () => {
    const pack = measuredPack();
    pack.sharding.shards[1] = { id: 1, reason: 'worker exited', state: 'not-run' };

    expect(() => parseImportConformanceScore(score(pack, '100'))).toThrow(
      "a measured pack cannot contain a 'not-run' shard",
    );
  });

  it('allows cleanly reported unsupported evidence to pass but never a defect outcome', () => {
    const clean = measuredCapability('alpha', 1, true, outcomes({ unsupportedClean: 1 }));
    expect(parseImportConformanceScore(score(measuredPack([clean]), '100')).packs[0].state).toBe('measured');

    const silent = measuredCapability('alpha', 1, true, outcomes({ silentlyWrong: 1 }));
    expect(() => parseImportConformanceScore(score(measuredPack([silent]), '100'))).toThrow(
      'passed: cannot be true when a defect outcome is present',
    );
  });
});

describe('runImportConformanceRatchet', () => {
  // The synthetic importer break is deliberately written to files and driven through the real command
  // boundary. A later arc checkpoint repeats this against the real runner/importer before enforcement.
  it('returns red for a deliberately broken importer score', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-import-conformance-'));
    const baselinePath = join(directory, 'baseline.json');
    const currentPath = join(directory, 'current.json');
    const baseline = score(measuredPack([measuredCapability('alpha', 2, true)]), '100');
    const current = score(measuredPack([measuredCapability('alpha', 2, false, outcomes({ silentlyWrong: 1 }))]), '101');
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
  passed = true,
  outcomeCounts = outcomes(),
): ImportConformanceMeasuredCapability {
  return { id, outcomes: outcomeCounts, passed, state: 'measured', witnesses };
}

function measuredPack(
  capabilities: ImportConformanceCapability[] = [measuredCapability('alpha'), unmeasuredCapability('beta')],
  overrides: Partial<ImportConformanceMeasuredPack> = {},
): ImportConformanceMeasuredPack {
  const measured = capabilities.filter(
    (capability): capability is ImportConformanceMeasuredCapability => capability.state === 'measured',
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
      exercisedCapabilities: measured.length,
      passedCapabilities: measured.filter((capability) => capability.passed).length,
      singleWitnessCapabilities: measured.filter((capability) => capability.witnesses === 1).length,
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

const PLAN_HASH = 'sha256:plan';
