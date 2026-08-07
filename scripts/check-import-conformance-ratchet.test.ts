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
  ImportConformanceAuditedLossPath,
  ImportConformanceCapability,
  ImportConformanceExercisedCapability,
  ImportConformanceMeasuredPack,
  ImportConformanceNotRunPack,
  ImportConformanceOutcomeCounts,
  ImportConformanceScore,
  ImportConformanceUnmeasuredCapability,
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

    expect(report.packs[0].baseline?.summary.exercised.fireReferenced.results.passedCapabilities).toBe(
      report.packs[0].current?.summary.exercised.fireReferenced.results.passedCapabilities,
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

    expect(report.packs[0].baseline?.summary.exercised.fireReferenced.capabilities).toBe(
      report.packs[0].current?.summary.exercised.fireReferenced.capabilities,
    );
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'instrumentation-firing-reference-lost',
      detail: 'firing-test proof references were present and are now UNREFERENCED',
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
      state: 'referenced',
    };
    const removedCapability = measuredCapability('alpha');
    removedCapability.instrumentation.fires = { proofs: ['fire-test:alpha-primary'], state: 'referenced' };
    const replacedCapability = measuredCapability('alpha');
    replacedCapability.instrumentation.fires = {
      proofs: ['fire-test:alpha-primary', 'fire-test:alpha-secondary'],
      state: 'referenced',
    };
    replacedCapability.instrumentation.staysSilent = {
      proofs: ['silence-test:alpha-replacement'],
      state: 'referenced',
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
    expect(removed.packs[0].findings[0].code).toBe('instrumentation-firing-references-changed');
    expect(replaced.state).toBe('regression');
    expect(replaced.packs[0].findings[0].code).toBe('instrumentation-silence-references-changed');
  });

  it('ratchets synthetic proof references independently of corpus exercise', () => {
    const baselineCapability = syntheticallyReferencedCapability('beta');
    const currentCapability = unmeasuredCapability('beta');
    const baseline = measuredPack([measuredCapability('alpha'), baselineCapability]);
    const current = measuredPack([measuredCapability('alpha'), currentCapability]);

    const report = compareImportConformanceScores(score(baseline, '100'), score(current, '101'));

    expect(baseline.summary.proofReferenced).toEqual({ fireCapabilities: 2, silenceCapabilities: 2 });
    expect(baseline.summary.exercised.fireReferenced.capabilities).toBe(1);
    expect(report.state).toBe('regression');
    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'beta',
      code: 'instrumentation-firing-reference-lost',
      detail: 'firing-test proof references were present and are now UNREFERENCED',
    });
  });

  it('ratchets loss of the structured diagnostic channel even when a human log guard remains', () => {
    const warningOnly = unknownCapability('alpha', 2, 'loss-path-known-not-wired');
    warningOnly.instrumentation.channel = 'human-log-only';
    const report = compareImportConformanceScores(
      score(measuredPack([measuredCapability('alpha', 2)]), '100'),
      score(measuredPack([warningOnly]), '101'),
    );

    expect(report.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'structured-diagnostic-channel-lost',
      detail: 'structured diagnostic crumb changed to human-log-only',
    });
  });

  it('ratchets loss-path audit coverage, classification, time, and subject binding on the member key', () => {
    const baseline = auditedUnmeasuredCapability('alpha', 'identified');
    const auditLost = compareImportConformanceScores(
      score(measuredPack([baseline]), '100'),
      score(measuredPack([unmeasuredCapability('alpha')]), '101'),
    );
    const classificationChanged = compareImportConformanceScores(
      score(measuredPack([baseline]), '100'),
      score(measuredPack([auditedUnmeasuredCapability('alpha', 'audited-none')]), '101'),
    );
    const older = auditedUnmeasuredCapability('alpha', 'identified');
    older.lossPath.audit.auditedAt = '2026-08-06T00:00:00.000Z';
    const timeRegressed = compareImportConformanceScores(
      score(measuredPack([baseline]), '100'),
      score(measuredPack([older]), '101'),
    );
    const changedSubject = auditedUnmeasuredCapability('alpha', 'identified');
    changedSubject.lossPath.audit.subjectHash = 'sha256:changed-subject';
    const subjectLaundered = compareImportConformanceScores(
      score(measuredPack([baseline]), '100'),
      score(measuredPack([changedSubject]), '101'),
    );

    expect(auditLost.packs[0].findings[0].code).toBe('loss-path-audit-lost');
    expect(classificationChanged.packs[0].findings[0].code).toBe('loss-path-classification-changed');
    expect(timeRegressed.packs[0].findings[0].code).toBe('loss-path-audit-time-regressed');
    expect(subjectLaundered.packs[0].findings[0].code).toBe('loss-path-audit-subject-changed-without-reaudit');
  });

  it('ratchets member audit declarations and refuses a new declaration wearing an old audit record', () => {
    const baselineCapability = measuredCapability('alpha');
    const missingScope = auditIncompleteCapability('alpha');
    const lost = compareImportConformanceScores(
      score(measuredPack([baselineCapability]), '100'),
      score(measuredPack([missingScope]), '101'),
    );
    const gained = compareImportConformanceScores(
      score(measuredPack([missingScope]), '100'),
      score(measuredPack([baselineCapability]), '101'),
      { unknownBaseline: 'allow' },
    );

    expect(lost.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'instrumentation-scope-audit-lost',
      detail: 'scope audit declaration was present and is now absent',
    });
    expect(gained.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'instrument-audit-added-without-new-audit',
      detail: 'scope audit declaration was added while member audit identity and time stayed fixed',
    });
  });

  it('ratchets removal and reporting regression of a configuration-limit declaration on the capability key', () => {
    const baseline = measuredCapability('alpha');
    baseline.configurationLimits = {
      limits: [{ id: 'MAX_FRAME_ACTIONS', reporting: 'structured' }],
      state: 'declared',
    };
    const removed = compareImportConformanceScores(
      score(measuredPack([baseline]), '100'),
      score(measuredPack([measuredCapability('alpha')]), '101'),
    );
    const unobservable = loopBoundedCapability('alpha');
    const reportingRegressed = compareImportConformanceScores(
      score(measuredPack([baseline]), '100'),
      score(measuredPack([unobservable]), '101'),
      { unknownBaseline: 'allow' },
    );

    expect(removed.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'configuration-limit-declaration-lost',
      detail:
        'configuration-limit declarations were present and are now NOT APPLICABLE without a capability identity change',
    });
    expect(reportingRegressed.packs[0].findings).toContainEqual({
      capabilityId: 'alpha',
      code: 'configuration-limit-reporting-regressed',
      detail: 'MAX_FRAME_ACTIONS changed from structured reporting to unobservable',
    });
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
  it('reports proof populations without inventing exercised capabilities as their target denominator', () => {
    const report = compareImportConformanceScores(score(measuredPack(), '100'), score(measuredPack(), '101'));
    const output = formatImportConformanceRatchetReport(report);

    expect(output).toContain(
      'exercised 1/2 [exercised: alpha; total: alpha, beta] → 1/2 [exercised: alpha; total: alpha, beta]',
    );
    expect(output).toContain(
      'loss-path audit partial; audited 1 [alpha@audit:loss-path-v1 by audit-team at 2026-08-07T00:00:00.000Z subject sha256:subject:alpha: identified]; can-silently-lose 1; audited-none 0; unaudited 1 [beta]',
    );
    expect(output).toContain(
      'configuration limits [alpha: not-applicable] → [alpha: not-applicable]; diagnostic channels [alpha: structured-crumb; beta: none] → [alpha: structured-crumb; beta: none]; loss-path audit',
    );
    expect(output).toContain(
      'instrument payload-audited 1 [alpha] → 1 [alpha]; instrument scope-audited 1 [alpha] → 1 [alpha]',
    );
    expect(output).toContain(
      'fire proof-referenced all 1 [alpha [fire-test:alpha]] → 1 [alpha [fire-test:alpha]]; fire proof-referenced and exercised 1 [alpha [fire-test:alpha]] → 1 [alpha [fire-test:alpha]]; fire results pass 1/1 [alpha], fail 0/1 [], unknown 0/1 [] → pass 1/1 [alpha], fail 0/1 [], unknown 0/1 []',
    );
    expect(output).toContain(
      'silence proof-referenced all 1 [alpha [silence-test:alpha]] → 1 [alpha [silence-test:alpha]]; silence proof-referenced and exercised 1 [alpha [silence-test:alpha]] → 1 [alpha [silence-test:alpha]]; silence results pass 1/1 [alpha], fail 0/1 [], unknown 0/1 [] → pass 1/1 [alpha], fail 0/1 [], unknown 0/1 []',
    );
    expect(output).not.toContain('proof-referenced all 1/2');
    expect(output).not.toContain('proof-referenced and exercised 1/1');
    expect(output).toContain(
      'instrument assurance observed: trigger correctness proof-reference-presence; trigger specificity proof-reference-presence; trigger scope external-audit-required; payload validity external-audit-required',
    );
  });

  it('prints structurally accepted nonexistent proof names as references, never as proof verdicts', () => {
    const capability = measuredCapability('alpha');
    capability.instrumentation = {
      audits: ['payload', 'scope'],
      channel: 'structured-crumb',
      fires: { proofs: ['test-that-does-not-exist:fire'], state: 'referenced' },
      staysSilent: { proofs: ['test-that-does-not-exist:silence'], state: 'referenced' },
    };
    const baseline = parseImportConformanceScore(score(measuredPack([capability]), '100'));
    const current = parseImportConformanceScore(score(measuredPack([capability]), '101'));
    const report = compareImportConformanceScores(baseline, current);
    const output = formatImportConformanceRatchetReport(report);

    expect(report.state).toBe('pass');
    expect(current.packs[0].capabilities[0]).toMatchObject({
      instrumentation: {
        fires: { proofs: ['test-that-does-not-exist:fire'], state: 'referenced' },
        staysSilent: { proofs: ['test-that-does-not-exist:silence'], state: 'referenced' },
      },
    });
    expect(output).toContain('alpha [test-that-does-not-exist:fire]');
    expect(output).toContain('alpha [test-that-does-not-exist:silence]');
    expect(output.toLowerCase()).not.toContain('proven');
  });
});

describe('parseImportConformanceScore', () => {
  // Defeating condition 5: a plausible number with no named full run behind it is not a baseline. This
  // is the mechanical boundary that prevents the old 306-file census from becoming an authoritative seed.
  it('refuses an UNKNOWN-PROVENANCE baseline', () => {
    const missingProvenance: Record<string, unknown> = { ...score(measuredPack(), '100') };
    delete missingProvenance.provenance;

    expect(() => parseImportConformanceScore(missingProvenance, 'baseline')).toThrow(
      'must contain exactly: instrumentAssurance, packs, provenance, schemaVersion',
    );
  });

  it('makes all four independent instrument assurance properties structural without inventing audit verdicts', () => {
    const parsed = parseImportConformanceScore(score(measuredPack(), '100'));
    const falsePayloadAssurance = score(measuredPack(), '100') as unknown as {
      instrumentAssurance: { payloadValidity: string };
    };
    falsePayloadAssurance.instrumentAssurance.payloadValidity = 'proof-reference-presence';

    expect(parsed.instrumentAssurance).toEqual({
      payloadValidity: 'external-audit-required',
      triggerCorrectness: 'proof-reference-presence',
      triggerScope: 'external-audit-required',
      triggerSpecificity: 'proof-reference-presence',
    });
    expect(() => parseImportConformanceScore(falsePayloadAssurance)).toThrow(
      "instrumentAssurance.payloadValidity: must be exactly 'external-audit-required'",
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
    pack.summary.exercised.fireReferenced.results.passedCapabilities = 0;

    expect(() => parseImportConformanceScore(score(pack, '100'))).toThrow(
      'exercised.fireReferenced.results.passedCapabilities: must equal the capability rows (1)',
    );

    const proofCount = measuredPack();
    proofCount.summary.proofReferenced.fireCapabilities = 2;
    expect(() => parseImportConformanceScore(score(proofCount, '100'))).toThrow(
      'proofReferenced.fireCapabilities: must equal the capability rows (1)',
    );

    const auditCount = measuredPack();
    auditCount.summary.lossPathPopulation.auditedCapabilities = 2;
    expect(() => parseImportConformanceScore(score(auditCount, '100'))).toThrow(
      'lossPathPopulation.auditedCapabilities: must equal the capability rows (1)',
    );

    const instrumentAuditCount = measuredPack();
    instrumentAuditCount.summary.instrumentAudited.scopeCapabilities = 2;
    expect(() => parseImportConformanceScore(score(instrumentAuditCount, '100'))).toThrow(
      'instrumentAudited.scopeCapabilities: must equal the capability rows (1)',
    );
  });

  it('derives the audit population by member and licenses audited-none without proof references', () => {
    const pack = measuredPack([
      measuredCapability('alpha'),
      auditedNoneCapability('background'),
      unmeasuredCapability('beta'),
    ]);
    const parsed = parseImportConformanceScore(score(pack, '100'));

    expect(parsed.packs[0]).toMatchObject({
      summary: {
        lossPathPopulation: {
          auditedCapabilities: 2,
          auditedNoLossPathCapabilities: 1,
          auditState: 'partial',
          canSilentlyLoseCapabilities: 1,
          unauditedCapabilities: 1,
        },
      },
    });
    expect(parsed.packs[0].capabilities[1]).toMatchObject({
      id: 'background',
      instrumentation: { fires: { state: 'unreferenced' }, staysSilent: { state: 'unreferenced' } },
      lossPath: { state: 'audited-none' },
      results: { fire: { state: 'pass' }, silence: { state: 'pass' } },
    });
    const report = compareImportConformanceScores(
      score(measuredPack([auditedNoneCapability('background')]), '100'),
      score(measuredPack([auditedNoneCapability('background')]), '101'),
    );
    expect(report.state).toBe('pass');
  });

  it('requires audit identity, time, and subject binding on each audited member', () => {
    const missingAudit = measuredCapability('alpha') as unknown as { lossPath: unknown };
    missingAudit.lossPath = { state: 'identified' };
    const inheritedAudit = measuredCapability('alpha') as unknown as { lossPath: unknown };
    inheritedAudit.lossPath = { audit: identifiedLossPath('alpha').audit, state: 'unaudited' };
    const invalidTime = measuredCapability('alpha');
    if (invalidTime.lossPath.state === 'unaudited') throw new Error('test fixture must be audited');
    invalidTime.lossPath.audit.auditedAt = '2026-08-07';
    const mislabeledNone = measuredCapability('alpha');
    if (mislabeledNone.lossPath.state === 'unaudited') throw new Error('test fixture must be audited');
    mislabeledNone.lossPath.state = 'audited-none';

    expect(() => parseImportConformanceScore(score(measuredPack([missingAudit as never]), '100'))).toThrow(
      'lossPath: must contain exactly: audit, state',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([inheritedAudit as never]), '100'))).toThrow(
      'lossPath: must contain exactly: state',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([invalidTime]), '100'))).toThrow(
      'lossPath.audit.auditedAt: must be a canonical UTC instant with millisecond precision',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([mislabeledNone]), '100'))).toThrow(
      'instrumentation: proof references and instrument audits require a positively identified loss path',
    );
  });

  it('makes missing member audits explicit UNKNOWN and validates the declaration vocabulary', () => {
    const silentlyPassing = measuredCapability('alpha');
    silentlyPassing.instrumentation.audits = ['payload'];
    const explicitUnknown = auditIncompleteCapability('alpha');
    const unknownAudit = measuredCapability('alpha') as unknown as {
      instrumentation: { audits: string[] };
    };
    unknownAudit.instrumentation.audits = ['shape'];
    const duplicateAudit = measuredCapability('alpha');
    duplicateAudit.instrumentation.audits = ['payload', 'payload'];

    expect(() => parseImportConformanceScore(score(measuredPack([silentlyPassing]), '100'))).toThrow(
      'outcomes: otherwise-clean and unsupported observations require both member audit declarations or keyed instrument-audit-incomplete observations',
    );
    expect(parseImportConformanceScore(score(measuredPack([explicitUnknown]), '100')).packs[0]).toMatchObject({
      summary: {
        instrumentAudited: { payloadCapabilities: 1, scopeCapabilities: 0 },
      },
    });
    expect(() => parseImportConformanceScore(score(measuredPack([unknownAudit as never]), '100'))).toThrow(
      "instrumentation.audits[0]: must be 'payload' or 'scope'",
    );
    expect(() => parseImportConformanceScore(score(measuredPack([duplicateAudit]), '100'))).toThrow(
      'instrumentation.audits: instrument audits must be unique and sorted in ascending order',
    );
  });

  it('never treats a human log guard as a structured diagnostic crumb', () => {
    const warningOnly = unknownCapability('alpha', 2, 'loss-path-known-not-wired');
    warningOnly.instrumentation.channel = 'human-log-only';
    const parsed = parseImportConformanceScore(score(measuredPack([warningOnly]), '100'));
    const falselyReferenced = structuredClone(warningOnly);
    falselyReferenced.instrumentation.fires = { proofs: ['fire-test:alpha'], state: 'referenced' };

    expect(parsed.packs[0]).toMatchObject({
      capabilities: [
        {
          instrumentation: { audits: [], channel: 'human-log-only' },
          results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
        },
      ],
      summary: {
        instrumentAudited: { payloadCapabilities: 0, scopeCapabilities: 0 },
        proofReferenced: { fireCapabilities: 0, silenceCapabilities: 0 },
      },
    });
    expect(() => parseImportConformanceScore(score(measuredPack([falselyReferenced]), '100'))).toThrow(
      'instrumentation: proof references and instrument audits require a structured diagnostic crumb',
    );
  });

  it('accepts UNKNOWN observations as exercised but outside both referenced populations', () => {
    const pack = measuredPack([measuredCapability('alpha', 2, 'pass'), unknownCapability('beta', 1)]);
    const parsed = parseImportConformanceScore(score(pack, '100'));

    expect(parsed.packs[0]).toMatchObject({
      state: 'measured',
      summary: {
        exercised: {
          capabilities: 2,
          fireReferenced: {
            capabilities: 1,
            results: { failedCapabilities: 0, passedCapabilities: 1, unknownCapabilities: 0 },
          },
          silenceReferenced: {
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
      'summary: must contain exactly: exercised, instrumentAudited, lossPathPopulation, proofReferenced, totalCapabilities',
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

  it('keeps the fire-referenced and silence-referenced populations and verdicts independent', () => {
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
          fireReferenced: {
            capabilities: 3,
            results: { failedCapabilities: 1, passedCapabilities: 1, unknownCapabilities: 1 },
          },
          silenceReferenced: {
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
      'no-crumb pass or silently-wrong outcomes require referenced firing instrumentation',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([noSilence]), '100'))).toThrow(
      'outcomes.unsupportedClean: requires referenced silence instrumentation',
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
    wrongReason.unknownObservations[0].reason = 'loss-path-known-not-wired';
    (wrongReason.unknownObservations[0] as unknown as Record<string, unknown>).granularity = 'whole-object';
    const collapsedReason = unknownCapability('alpha', 1) as unknown as {
      unknownObservations: Array<{ reason: string; reference: string }>;
    };
    collapsedReason.unknownObservations[0].reason = 'diagnostic-instrumentation-missing';

    expect(() => parseImportConformanceScore(score(measuredPack([duplicate]), '100'))).toThrow(
      'observation references must be unique and sorted in ascending order',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([wrongReason]), '100'))).toThrow(
      'requires both instrumentation directions to be unreferenced',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([collapsedReason as never]), '100'))).toThrow(
      "must be 'diagnostic-cause-unknown', 'fire-proof-missing-for-no-crumb', 'instrument-audit-incomplete', 'loop-bounded-configuration-limit', 'loss-path-known-not-wired', 'loss-path-not-identified', or 'silence-proof-missing-for-crumb'",
    );
  });

  it('keeps a crumb with an inseparable file-versus-importer cause UNKNOWN instead of scoring it as fact', () => {
    const capability = measuredCapability('alpha', 1);
    capability.results = { fire: { state: 'unknown' }, silence: { state: 'unknown' } };
    capability.unknownObservations = [
      {
        reason: 'diagnostic-cause-unknown',
        reference: 'fixture:alpha:shape-body-unreadable',
      },
    ];
    const parsed = parseImportConformanceScore(score(measuredPack([capability]), '100'));
    const doubleCounted = structuredClone(capability);
    doubleCounted.outcomes.unsupportedClean = 1;

    expect(parsed.packs[0].capabilities[0]).toMatchObject({
      outcomes: { unsupportedClean: 0 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [
        {
          reason: 'diagnostic-cause-unknown',
          reference: 'fixture:alpha:shape-body-unreadable',
        },
      ],
    });
    expect(() => parseImportConformanceScore(score(measuredPack([doubleCounted]), '100'))).toThrow(
      'witnesses: cannot be smaller than the 2 classified observations',
    );
  });

  it('requires exact capability-scoped UNKNOWN evidence for every unobservable loop-bounded configuration limit', () => {
    const loopBounded = loopBoundedCapability('alpha');
    const parsed = parseImportConformanceScore(score(measuredPack([loopBounded]), '100'));
    const missingUnknown = structuredClone(loopBounded);
    missingUnknown.unknownObservations = [];
    missingUnknown.results = { fire: { state: 'pass' }, silence: { state: 'pass' } };
    const falsePass = structuredClone(loopBounded);
    falsePass.results = { fire: { state: 'pass' }, silence: { state: 'pass' } };
    const structured = measuredCapability('alpha');
    structured.configurationLimits = {
      limits: [{ id: 'MAX_FRAME_ACTIONS', reporting: 'structured' }],
      state: 'declared',
    };

    expect(parsed.packs[0].capabilities[0]).toMatchObject({
      configurationLimits: {
        limits: [{ id: 'MAX_FRAME_ACTIONS', reporting: 'unobservable' }],
        state: 'declared',
      },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [
        {
          reason: 'loop-bounded-configuration-limit',
          reference: 'MAX_FRAME_ACTIONS',
        },
      ],
    });
    expect(() => parseImportConformanceScore(score(measuredPack([missingUnknown]), '100'))).toThrow(
      'configurationLimits: unobservable limit ids must exactly match the capability-scoped loop-bounded-configuration-limit UNKNOWN references',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([falsePass]), '100'))).toThrow(
      "results.fire.state: must equal the licensed observations ('unknown')",
    );
    expect(parseImportConformanceScore(score(measuredPack([structured]), '100')).packs[0]).toMatchObject({
      capabilities: [
        {
          configurationLimits: {
            limits: [{ id: 'MAX_FRAME_ACTIONS', reporting: 'structured' }],
            state: 'declared',
          },
          results: { fire: { state: 'pass' }, silence: { state: 'pass' } },
        },
      ],
    });
    const report = compareImportConformanceScores(
      score(measuredPack([loopBounded]), '100'),
      score(measuredPack([loopBounded]), '101'),
      { unknownBaseline: 'allow' },
    );
    expect(formatImportConformanceRatchetReport(report)).toContain(
      'configuration limits [alpha: declared [MAX_FRAME_ACTIONS unobservable]] → [alpha: declared [MAX_FRAME_ACTIONS unobservable]]',
    );
    expect(formatImportConformanceRatchetReport(report)).toContain(
      'unknown observations loop-bounded-limit capability-scoped 1 [alpha@MAX_FRAME_ACTIONS]',
    );
  });

  it('allows one configuration limit to contaminate multiple capability rows without collapsing their keys', () => {
    const parsed = parseImportConformanceScore(
      score(
        measuredPack([
          loopBoundedCapability('swf.button.define-button', 'MAX_BUTTON_RECORDS'),
          loopBoundedCapability('swf.button.define-button-2', 'MAX_BUTTON_RECORDS'),
        ]),
        '100',
      ),
    );

    expect(parsed.packs[0]).toMatchObject({
      capabilities: [
        {
          id: 'swf.button.define-button',
          unknownObservations: [{ reason: 'loop-bounded-configuration-limit', reference: 'MAX_BUTTON_RECORDS' }],
        },
        {
          id: 'swf.button.define-button-2',
          unknownObservations: [{ reason: 'loop-bounded-configuration-limit', reference: 'MAX_BUTTON_RECORDS' }],
        },
      ],
      summary: { exercised: { capabilities: 2 }, totalCapabilities: 2 },
    });
  });

  it('keeps known-but-unwired and unidentified loss paths as separate remedy populations', () => {
    const baseline = measuredPack([
      unknownCapability('alpha', 1, 'loss-path-known-not-wired'),
      unknownCapability('beta', 1, 'loss-path-not-identified'),
    ]);
    const report = compareImportConformanceScores(score(baseline, '100'), score(baseline, '101'), {
      unknownBaseline: 'allow',
    });

    expect(formatImportConformanceRatchetReport(report)).toContain(
      'known-unwired capability-scoped 1 [alpha@fixture:alpha:loss-family/whole-object], loss-path-unidentified capability-scoped 1 [beta@fixture:beta:loss-path-audit]',
    );
  });

  it('requires loss granularity only for characterized unwired families and permits both axes on one capability', () => {
    const both = unknownCapability('morph', 2, 'loss-path-known-not-wired');
    both.unknownObservations = [
      {
        granularity: 'partial-object',
        reason: 'loss-path-known-not-wired',
        reference: 'swfMorphShape:single-path-pair',
      },
      {
        granularity: 'whole-object',
        reason: 'loss-path-known-not-wired',
        reference: 'swfMorphShape:whole-morph',
      },
    ];
    const missingGranularity = structuredClone(both) as unknown as {
      unknownObservations: Array<Record<string, unknown>>;
    };
    delete missingGranularity.unknownObservations[0].granularity;
    const fabricatedGranularity = fireOnlyUnknownCrumb('alpha') as unknown as {
      unknownObservations: Array<Record<string, unknown>>;
    };
    fabricatedGranularity.unknownObservations[0].granularity = 'partial-object';

    expect(parseImportConformanceScore(score(measuredPack([both]), '100')).packs[0]).toMatchObject({
      capabilities: [{ unknownObservations: both.unknownObservations }],
    });
    expect(() => parseImportConformanceScore(score(measuredPack([missingGranularity as never]), '100'))).toThrow(
      'must contain exactly: granularity, reason, reference',
    );
    expect(() => parseImportConformanceScore(score(measuredPack([fabricatedGranularity as never]), '100'))).toThrow(
      'must contain exactly: reason, reference',
    );
  });

  it('removes the incoherent flat measured pack outcome aggregate', () => {
    const pack = { ...measuredPack(), outcomes: outcomes() };

    expect(() => parseImportConformanceScore(score(pack as never, '100'))).toThrow(
      'must contain exactly: capabilities, id, importerSourceHash, release, sharding, state, summary, variant',
    );
  });

  it('cannot represent referenced instrumentation without stable proof ids', () => {
    const absent = measuredPack();
    delete (absent.capabilities[0] as unknown as Record<string, unknown>).instrumentation;
    const empty = {
      ...measuredCapability('alpha'),
      instrumentation: {
        audits: ['payload', 'scope'],
        channel: 'structured-crumb',
        fires: { proofs: [], state: 'referenced' },
        staysSilent: { proofs: ['silence-test:alpha'], state: 'referenced' },
      },
    };
    const duplicate = {
      ...measuredCapability('alpha'),
      instrumentation: {
        audits: ['payload', 'scope'],
        channel: 'structured-crumb',
        fires: { proofs: ['proof-a', 'proof-a'], state: 'referenced' },
        staysSilent: { proofs: ['silence-test:alpha'], state: 'referenced' },
      },
    };

    expect(() => parseImportConformanceScore(score(absent, '100'))).toThrow(
      'must contain exactly: configurationLimits, id, instrumentation, lossPath, outcomes, results, state, unknownObservations, witnesses',
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
    configurationLimits: { state: 'not-applicable' },
    id,
    instrumentation: {
      audits: ['payload', 'scope'],
      channel: 'structured-crumb',
      fires: { proofs: [`fire-test:${id}`], state: 'referenced' },
      staysSilent: { proofs: [`silence-test:${id}`], state: 'referenced' },
    },
    lossPath: identifiedLossPath(id),
    outcomes: outcomeCounts,
    results: { fire: { state: result }, silence: { state: result } },
    state: 'exercised',
    unknownObservations: [],
    witnesses,
  };
}

function auditIncompleteCapability(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id);
  capability.instrumentation.audits = ['payload'];
  capability.results = { fire: { state: 'unknown' }, silence: { state: 'unknown' } };
  capability.unknownObservations = [
    {
      reason: 'instrument-audit-incomplete',
      reference: `fixture:${id}:instrument-audit`,
    },
  ];
  return capability;
}

function loopBoundedCapability(id: string, limitId = 'MAX_FRAME_ACTIONS'): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 2);
  capability.configurationLimits = {
    limits: [{ id: limitId, reporting: 'unobservable' }],
    state: 'declared',
  };
  capability.results = { fire: { state: 'unknown' }, silence: { state: 'unknown' } };
  capability.unknownObservations = [{ reason: 'loop-bounded-configuration-limit', reference: limitId }];
  return capability;
}

function auditedNoneCapability(id: string): ImportConformanceExercisedCapability {
  return {
    configurationLimits: { state: 'not-applicable' },
    id,
    instrumentation: {
      audits: [],
      channel: 'none',
      fires: { state: 'unreferenced' },
      staysSilent: { state: 'unreferenced' },
    },
    lossPath: { ...identifiedLossPath(id), state: 'audited-none' },
    outcomes: outcomes(),
    results: { fire: { state: 'pass' }, silence: { state: 'pass' } },
    state: 'exercised',
    unknownObservations: [],
    witnesses: 1,
  };
}

function measuredPack(
  capabilities: ImportConformanceCapability[] = [measuredCapability('alpha'), unmeasuredCapability('beta')],
  overrides: Partial<ImportConformanceMeasuredPack> = {},
): ImportConformanceMeasuredPack {
  const measured = capabilities.filter(
    (capability): capability is ImportConformanceExercisedCapability => capability.state === 'exercised',
  );
  const auditable = capabilities.filter(
    (capability): capability is ImportConformanceExercisedCapability | ImportConformanceUnmeasuredCapability =>
      capability.state !== 'not-run',
  );
  const fireReferenced = measured.filter((capability) => capability.instrumentation.fires.state === 'referenced');
  const silenceReferenced = measured.filter(
    (capability) => capability.instrumentation.staysSilent.state === 'referenced',
  );
  const canSilentlyLose = auditable.filter((capability) => capability.lossPath.state === 'identified');
  const auditedNone = auditable.filter((capability) => capability.lossPath.state === 'audited-none');
  const unaudited = auditable.filter((capability) => capability.lossPath.state === 'unaudited');
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
        fireReferenced: referencedSummary(fireReferenced, 'fire'),
        silenceReferenced: referencedSummary(silenceReferenced, 'silence'),
        singleWitnessCapabilities: measured.filter((capability) => capability.witnesses === 1).length,
      },
      instrumentAudited: {
        payloadCapabilities: auditable.filter((capability) => capability.instrumentation.audits.includes('payload'))
          .length,
        scopeCapabilities: auditable.filter((capability) => capability.instrumentation.audits.includes('scope')).length,
      },
      lossPathPopulation: {
        auditedCapabilities: canSilentlyLose.length + auditedNone.length,
        auditedNoLossPathCapabilities: auditedNone.length,
        auditState: unaudited.length === 0 ? 'complete' : 'partial',
        canSilentlyLoseCapabilities: canSilentlyLose.length,
        unauditedCapabilities: unaudited.length,
      },
      proofReferenced: {
        fireCapabilities: auditable.filter((capability) => capability.instrumentation.fires.state === 'referenced')
          .length,
        silenceCapabilities: auditable.filter(
          (capability) => capability.instrumentation.staysSilent.state === 'referenced',
        ).length,
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
    instrumentAssurance: {
      payloadValidity: 'external-audit-required',
      triggerCorrectness: 'proof-reference-presence',
      triggerScope: 'external-audit-required',
      triggerSpecificity: 'proof-reference-presence',
    },
    packs: pack === null ? [] : [pack],
    provenance: { mode: 'exhaustive', runId, runUrl: `https://ci.invalid/runs/${runId}` },
    schemaVersion: 1,
  };
}

function unmeasuredCapability(id: string): ImportConformanceUnmeasuredCapability {
  return {
    id,
    instrumentation: {
      audits: [],
      channel: 'none',
      fires: { state: 'unreferenced' },
      staysSilent: { state: 'unreferenced' },
    },
    lossPath: { state: 'unaudited' },
    state: 'unmeasured',
  };
}

function syntheticallyReferencedCapability(id: string): ImportConformanceUnmeasuredCapability {
  return {
    id,
    instrumentation: {
      audits: ['payload', 'scope'],
      channel: 'structured-crumb',
      fires: { proofs: [`fire-test:${id}`], state: 'referenced' },
      staysSilent: { proofs: [`silence-test:${id}`], state: 'referenced' },
    },
    lossPath: identifiedLossPath(id),
    state: 'unmeasured',
  };
}

function auditedUnmeasuredCapability(
  id: string,
  state: ImportConformanceAuditedLossPath['state'],
): ImportConformanceUnmeasuredCapability & { lossPath: ImportConformanceAuditedLossPath } {
  return {
    id,
    instrumentation: {
      audits: [],
      channel: 'none',
      fires: { state: 'unreferenced' },
      staysSilent: { state: 'unreferenced' },
    },
    lossPath: {
      audit: {
        auditId: 'audit:loss-path-v1',
        auditedAt: '2026-08-07T00:00:00.000Z',
        auditor: 'audit-team',
        subjectHash: `sha256:subject:${id}`,
      },
      state,
    },
    state: 'unmeasured',
  };
}

function unknownCapability(
  id: string,
  witnesses: number,
  reason: 'loss-path-known-not-wired' | 'loss-path-not-identified' = 'loss-path-not-identified',
): ImportConformanceExercisedCapability {
  return {
    configurationLimits: { state: 'not-applicable' },
    id,
    instrumentation: {
      audits: [],
      channel: 'none',
      fires: { state: 'unreferenced' },
      staysSilent: { state: 'unreferenced' },
    },
    lossPath: reason === 'loss-path-not-identified' ? { state: 'unaudited' } : identifiedLossPath(id),
    outcomes: outcomes(),
    results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
    state: 'exercised',
    unknownObservations:
      reason === 'loss-path-known-not-wired'
        ? [
            {
              granularity: 'whole-object',
              reason,
              reference: `fixture:${id}:loss-family`,
            },
          ]
        : [{ reason, reference: `fixture:${id}:loss-path-audit` }],
    witnesses,
  };
}

function fireOnlyPass(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 1);
  capability.instrumentation.staysSilent = { state: 'unreferenced' };
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
  capability.instrumentation.fires = { state: 'unreferenced' };
  capability.results.fire = { state: 'unknown' };
  return capability;
}

function silenceOnlyUnknownNoCrumb(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 1);
  capability.instrumentation.fires = { state: 'unreferenced' };
  capability.results = { fire: { state: 'unknown' }, silence: { state: 'unknown' } };
  capability.unknownObservations = [{ reason: 'fire-proof-missing-for-no-crumb', reference: `fixture:${id}:no-crumb` }];
  return capability;
}

function mixedDirectFailAndUnknown(id: string): ImportConformanceExercisedCapability {
  const capability = measuredCapability(id, 2, 'fail', outcomes({ importedWrong: 1 }));
  capability.instrumentation.staysSilent = { state: 'unreferenced' };
  capability.unknownObservations = [{ reason: 'silence-proof-missing-for-crumb', reference: `fixture:${id}:crumb` }];
  return capability;
}

function referencedSummary(
  capabilities: ImportConformanceExercisedCapability[],
  lane: 'fire' | 'silence',
): ImportConformanceMeasuredPack['summary']['exercised']['fireReferenced'] {
  return {
    capabilities: capabilities.length,
    results: {
      failedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'fail').length,
      passedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'pass').length,
      unknownCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'unknown').length,
    },
  };
}

function identifiedLossPath(id: string): ImportConformanceAuditedLossPath {
  return {
    audit: {
      auditId: 'audit:loss-path-v1',
      auditedAt: '2026-08-07T00:00:00.000Z',
      auditor: 'audit-team',
      subjectHash: `sha256:subject:${id}`,
    },
    state: 'identified',
  };
}

const PLAN_HASH = 'sha256:plan';
