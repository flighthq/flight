import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createImportConformanceSingleMemberCaseIdentity } from './import-conformance-case';
import {
  buildImportConformanceCapabilityIndex,
  createImportConformanceNotRunScore,
  createImportConformanceScore,
  createImportConformanceShardPlan,
} from './import-conformance-core';
import type { ImportConformanceLossPath } from './import-conformance-core';
import { SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY } from './import-conformance-diagnostic-evidence';
import { formatImportConformanceScore } from './import-conformance-format';
import { createSwfImportConformanceDenominators } from './swf-capability-index';

const DEFINITIONS = [
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
] as const;
const PACK = {
  capabilityConventionRevision: 'unresolved-individuation-v1',
  id: 'swf-ruffle-fixtures',
  release: '0.1.0',
  variant: 'full',
} as const;
const PROVENANCE = { mode: 'exhaustive', runId: 'run-17', runUrl: 'https://ci.invalid/run-17' } as const;
const TEST_CENSUS = {
  basis: 'single-artifact-cross-check',
  candidateHits: 4,
  falsePositiveHits: 2,
  provenance: 'single-author',
  reference: 'synthetic-capabilities-vs-tag-coverage.md',
  state: 'provisional',
} as const;
const TEST_MARGIN = {
  behaviorPreservingRefactorRows: 1,
  discriminatedSourceRows: 2,
  frozenDeclaredRows: 2,
  rejectedCircularCandidate: 'corpus-differential-behavior',
  sameDispatchArmRows: 1,
  state: 'frozen-no-election',
} as const;

describe('formatImportConformanceScore', () => {
  it('emits the raw evidence populations with their honest limits', () => {
    const index = buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, [
      {
        capabilities: ['swf.fill.solid'],
        ...createImportConformanceSingleMemberCaseIdentity('fixture.swf', hash('fixture')),
      },
    ]);
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(index.cases, 1),
      new Set([0]),
      [
        {
          caseHash: index.cases[0]!.caseHash,
          capabilityOutcomes: [
            { diagnosticCause: 'separable', diagnosticReported: false, id: 'swf.fill.solid', outcome: 'passed' },
          ],
          importOutcome: 'passed',
          oracleOutcomes: [],
          outcome: 'passed',
          reference: 'fixture.swf',
        },
      ],
      new Map([
        [
          'swf.fill.solid',
          {
            audits: ['payload', 'scope'] as const,
            channel: 'structured-crumb' as const,
            fires: ['packages/swf/src/swfDocument.test.ts#reports solid-fill loss'],
            staysSilent: ['packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent'],
          },
        ],
      ]),
      new Map([
        [
          'swf.fill.solid',
          {
            audit: {
              auditId: 'audit:loss-path-v1',
              auditor: 'builder2',
              auditedAt: '2026-08-07T00:00:00.000Z',
              subjectHash: 'sha256:subject:swf.fill.solid',
            },
            state: 'identified' as const,
          },
        ],
        ['swf.text.define-text', { state: 'unaudited' as const }],
      ]),
      hash('importer'),
      PROVENANCE,
      {
        capabilityScopedUnknownMappings: { configurationLimits: [], unwiredLossFamilies: [] },
        denominators: createSwfImportConformanceDenominators(2, TEST_CENSUS, TEST_MARGIN),
        diagnosticEvidencePolicy: SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
      },
    );

    const output = formatImportConformanceScore(score);
    expect(output).toContain(
      'instrument-assurance: payload-validity=external-audit-required trigger-correctness=proof-reference-presence trigger-scope=external-audit-required trigger-specificity=proof-reference-presence\n' +
        'oracle-assurance: ratchet=recorded-run-regression-only first-capture-defects=detectable-by-declared-oracles format-derived-properties=first-class-case-outcomes\n' +
        'swf-ruffle-fixtures 0.1.0 [full; capability-convention-revision=unresolved-individuation-v1]\n' +
        'silently-wrong-fixtures: fixture-population tally 0 []\n' +
        'fixture-outcome-populations: passed fixture-population tally 1; imported wrong fixture-population tally 0; silently wrong fixture-population tally 0; unsupported clean fixture-population tally 0; threw during import (convention violation) fixture-population tally 0\n' +
        'fixture-outcome-definitions: passed=The importer returned a document after no earlier exception, adapter-declared unsupported, defect-diagnostic, or Skip-diagnostic branch matched.; importedWrong=After no exception or adapter-declared unsupported diagnostic matched, at least one Drop, Recover, or Reject diagnostic outside that adapter-owned set classified the fixture importedWrong, regardless of whether a document was returned.; silentlyWrong=The importer returned no document after no earlier exception, adapter-declared unsupported, defect-diagnostic, or Skip-diagnostic branch matched.; unsupportedClean=After no exception, either any adapter-declared unsupported diagnostic matched before defect diagnostics or, with no defect diagnostic, at least one Skip diagnostic matched, regardless of whether a document was returned.; threw=The import worker reported an exception; this first branch takes precedence over every diagnostic and imported-sentinel state.\n' +
        'capability-probe-unreadable-outcomes: fixture-population tally 0; passed fixture-population tally 0; imported wrong fixture-population tally 0; silently wrong fixture-population tally 0; unsupported clean fixture-population tally 0; threw during import (convention violation) fixture-population tally 0\n' +
        'capability-probe-unreadable-diagnostic-explanations: document failure named fixture-population tally 0; diagnostic present without document failure fixture-population tally 0; diagnostics absent fixture-population tally 0\n' +
        'capability-probe-unreadable-fixtures: []\n' +
        'oracle-outcome-populations: passed oracle-outcome tally 0; failed oracle-outcome tally 0; not-run oracle-outcome tally 0\n' +
        'oracle-cases: case tally 0 []\n' +
        'importer-capability-evidence: exercised importer-declared capability-row tally 1 [exercised: swf.fill.solid; importer-declared: swf.fill.solid, swf.text.define-text]; declared capability-row tally 2; producer-declared methodology unresolved-individuation-v1; producer-declared readings [behavior-preserving-refactor-rows=1; candidate-hits=4 @synthetic-capabilities-vs-tag-coverage.md; census-basis="single-artifact-cross-check" @synthetic-capabilities-vs-tag-coverage.md; census-provenance="single-author" @synthetic-capabilities-vs-tag-coverage.md; census-state="provisional" @synthetic-capabilities-vs-tag-coverage.md; discriminated-source-rows=2; false-positive-hits=2 @synthetic-capabilities-vs-tag-coverage.md; frozen-declared-rows=2; individuation-state="frozen-no-election"; rejected-circular-candidate="corpus-differential-behavior"; same-dispatch-arm-rows=1]; producer-declared capability denominator UNRESOLVED (individuation-rule-not-operational); swf-format capability denominator UNMEASURED (format-capability-enumeration-not-declared); unmeasured capability cause NOT DISTINGUISHED (no fixture versus upstream unreachable; no-fixture-vs-upstream-unreachable-not-distinguished); ratchet honest limit recorded-run-regression-only: detects regression from a recorded run and cannot see a defect present at first capture; format-derived property oracles first-class-case-outcomes\n' +
        'configuration-limits: keyed-limit count 0 []\n' +
        'loss-path-audit: partial; audited capability-row tally 1 [swf.fill.solid@audit:loss-path-v1 by builder2 at 2026-08-07T00:00:00.000Z subject sha256:subject:swf.fill.solid: identified]; can-silently-lose capability-row tally 1; audited-none capability-row tally 0; audit-identity-unavailable capability-row tally 0 []; unaudited capability-row tally 1 [swf.text.define-text]\n' +
        'diagnostic-channels: structured-crumb capability-row tally 1 [swf.fill.solid]; human-log-only capability-row tally 0 []; none capability-row tally 1 [swf.text.define-text]\n' +
        'instrument-payload-audited: capability-row tally 1 [swf.fill.solid]\n' +
        'instrument-scope-audited: capability-row tally 1 [swf.fill.solid]\n' +
        'fire-proof-referenced-all: capability-row tally 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#reports solid-fill loss]]\n' +
        'fire-proof-referenced-and-exercised: capability-row tally 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#reports solid-fill loss]]\n' +
        'fire-results: referenced capability-row population tally 1; pass capability-row tally 1 [swf.fill.solid], fail capability-row tally 0 [], unknown capability-row tally 0 []\n' +
        'silence-proof-referenced-all: capability-row tally 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent]]\n' +
        'silence-proof-referenced-and-exercised: capability-row tally 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent]]\n' +
        'silence-results: referenced capability-row population tally 1; pass capability-row tally 1 [swf.fill.solid], fail capability-row tally 0 [], unknown capability-row tally 0 []\n' +
        'witness-depth: single-witness capability-row tally 1 [swf.fill.solid]\n' +
        'unknown-observations: configuration-limit keyed-observation count 0 [], cause-unknown keyed-observation count 0 [], instrument-audit-incomplete keyed-observation count 0 [], known-unwired keyed-observation count 0 [], loss-path-audit-unidentified keyed-observation count 0 [], loss-path-unidentified keyed-observation count 0 [], no-fire keyed-observation count 0 [], no-silence keyed-observation count 0 []\n',
    );
    expect(output).not.toMatch(/\b\d+\/\d+\b/);
  });

  it('prints capability scope and content fidelity from raw UNKNOWN members', () => {
    const index = buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, [
      {
        capabilities: ['swf.fill.solid'],
        ...createImportConformanceSingleMemberCaseIdentity('fixture.swf', hash('fixture')),
      },
    ]);
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(index.cases, 1),
      new Set([0]),
      [
        {
          caseHash: index.cases[0]!.caseHash,
          capabilityOutcomes: [
            { diagnosticCause: 'separable', diagnosticReported: false, id: 'swf.fill.solid', outcome: 'passed' },
          ],
          importOutcome: 'passed',
          oracleOutcomes: [],
          outcome: 'passed',
          reference: 'fixture.swf',
        },
      ],
      new Map(),
      new Map<string, ImportConformanceLossPath>([
        [
          'swf.fill.solid',
          {
            audit: {
              auditId: 'audit:loss-path-v1',
              auditedAt: '2026-08-07T00:00:00.000Z',
              auditor: 'builder2',
              subjectHash: 'sha256:subject:swf.fill.solid',
            },
            state: 'identified',
          },
        ],
        ['swf.text.define-text', { state: 'unaudited' }],
      ]),
      hash('importer'),
      PROVENANCE,
      {
        capabilityScopedUnknownMappings: {
          configurationLimits: [
            {
              capabilityIds: ['swf.fill.solid'],
              id: 'MAX_FILL_RECORDS',
              reporting: 'unobservable',
            },
          ],
          unwiredLossFamilies: [
            {
              capabilityIds: ['swf.fill.solid'],
              contentFidelity: 'substituted',
              reference: 'font-definition-overwrite',
            },
          ],
        },
        denominators: createSwfImportConformanceDenominators(2, TEST_CENSUS, TEST_MARGIN),
        diagnosticEvidencePolicy: SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
      },
    );
    const output = formatImportConformanceScore(score);

    expect(output).toContain('swf.fill.solid@MAX_FILL_RECORDS=unobservable');
    expect(output).toContain(
      'swf.fill.solid@font-definition-overwrite (capability-scoped content-fidelity=substituted)',
    );
    expect(output).not.toContain('granularity');
  });

  it('prints no scoreboard denominator for NOT RUN', () => {
    const output = formatImportConformanceScore(
      createImportConformanceNotRunScore(PACK, DEFINITIONS, hash('importer'), PROVENANCE),
    );
    expect(output).toContain('NOT RUN: pack-unavailable');
    expect(output).not.toMatch(/\d+\/\d+/);
  });

  it('does not reintroduce pass-over-exercised aliases or bare numeric ratios', () => {
    const source = readFileSync(join(import.meta.dirname, 'import-conformance-format.ts'), 'utf8');
    expect(source).not.toContain('pass-of-exercised');
    expect(source).not.toContain('pass-of-instrumented');
    expect(source).not.toContain('instrumented-of-exercised');
    expect(source).not.toMatch(/proof-referenced-(?:all|and-exercised):[^\n]*\d+\/\d+/);
    expect(source).not.toMatch(/`[^`]*\$\{[^}]+\}\/\$\{[^}]+\}[^`]*`/);
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
