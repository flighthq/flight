import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildImportConformanceCapabilityIndex,
  createImportConformanceNotRunScore,
  createImportConformanceScore,
  createImportConformanceShardPlan,
} from './import-conformance-core';
import type { ImportConformanceLossPath } from './import-conformance-core';
import { formatImportConformanceScore } from './import-conformance-format';

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
      { capabilities: ['swf.fill.solid'], reference: 'fixture.swf', sourceHash: hash('fixture') },
    ]);
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(['fixture.swf'], 1),
      new Set([0]),
      [
        {
          capabilityOutcomes: [
            { diagnosticCause: 'separable', diagnosticReported: false, id: 'swf.fill.solid', outcome: 'passed' },
          ],
          outcome: 'passed',
          reference: 'fixture.swf',
          sourceHash: hash('fixture'),
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
        importerDeclaredCensus: TEST_CENSUS,
        individuationMargin: TEST_MARGIN,
      },
    );

    const output = formatImportConformanceScore(score);
    expect(output).toContain(
      'instrument-assurance: payload-validity=external-audit-required trigger-correctness=proof-reference-presence trigger-scope=external-audit-required trigger-specificity=proof-reference-presence\n' +
        'oracle-assurance: ratchet=recorded-run-regression-only first-capture-defects=undetectable format-derived-properties=required-not-implemented\n' +
        'swf-ruffle-fixtures 0.1.0 [full; capability-convention-revision=unresolved-individuation-v1]\n' +
        'importer-capability-evidence: exercised importer-declared capability-row tally 1 [exercised: swf.fill.solid; importer-declared: swf.fill.solid, swf.text.define-text]; declared capability-row tally 2; individuation margin counts [same-dispatch-arm row count 1; behavior-preserving-refactor row count 1; discriminated-source row count 2; frozen-declared row count 2; frozen-no-election]; rejected circular individuation candidate corpus-differential-behavior; importer-declared capability denominator UNRESOLVED (individuation-rule-not-operational); provisional census from one artifact cross-check synthetic-capabilities-vs-tag-coverage.md [false-positive-hit tally 2; candidate-hit tally 4; single author]; SWF-format capability denominator UNMEASURED; unmeasured capability cause NOT DISTINGUISHED (no fixture versus upstream unreachable; no-fixture-vs-upstream-unreachable-not-distinguished); ratchet honest limit recorded-run-regression-only: detects regression from a recorded run and cannot see a defect present at first capture; format-derived property oracles required-not-implemented\n' +
        'configuration-limits: keyed-limit count 0 []\n' +
        'loss-path-audit: partial; audited capability-row tally 1 [swf.fill.solid@audit:loss-path-v1 by builder2 at 2026-08-07T00:00:00.000Z subject sha256:subject:swf.fill.solid: identified]; can-silently-lose capability-row tally 1; audited-none capability-row tally 0; unaudited capability-row tally 1 [swf.text.define-text]\n' +
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
        'unknown-observations: configuration-limit keyed-observation count 0 [], cause-unknown keyed-observation count 0 [], instrument-audit-incomplete keyed-observation count 0 [], known-unwired keyed-observation count 0 [], loss-path-unidentified keyed-observation count 0 [], no-fire keyed-observation count 0 [], no-silence keyed-observation count 0 []\n',
    );
    expect(output).not.toMatch(/\b\d+\/\d+\b/);
  });

  it('prints capability scope and content fidelity from raw UNKNOWN members', () => {
    const index = buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, [
      { capabilities: ['swf.fill.solid'], reference: 'fixture.swf', sourceHash: hash('fixture') },
    ]);
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(['fixture.swf'], 1),
      new Set([0]),
      [
        {
          capabilityOutcomes: [
            { diagnosticCause: 'separable', diagnosticReported: false, id: 'swf.fill.solid', outcome: 'passed' },
          ],
          outcome: 'passed',
          reference: 'fixture.swf',
          sourceHash: hash('fixture'),
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
        importerDeclaredCensus: TEST_CENSUS,
        individuationMargin: TEST_MARGIN,
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
