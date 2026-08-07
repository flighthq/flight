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
        configurationLimitsByCapability: new Map(),
        importerDeclaredCensus: TEST_CENSUS,
        unwiredLossesByCapability: new Map(),
      },
    );

    expect(formatImportConformanceScore(score)).toContain(
      'instrument-assurance: payload-validity=external-audit-required trigger-correctness=proof-reference-presence trigger-scope=external-audit-required trigger-specificity=proof-reference-presence\n' +
        'oracle-assurance: ratchet=recorded-run-regression-only first-capture-defects=undetectable format-derived-properties=required-not-implemented\n' +
        'swf-ruffle-fixtures 0.1.0 [full]\n' +
        'importer-capability-evidence: exercised importer-declared capability rows 1 [exercised: swf.fill.solid; importer-declared: swf.fill.solid, swf.text.define-text]; declared capability row tally 2; importer-declared capability denominator UNRESOLVED (individuation-rule-not-operational); provisional census from one artifact cross-check synthetic-capabilities-vs-tag-coverage.md (2 false positives in 4 candidate hits; single author); SWF-format capability denominator UNMEASURED; ratchet honest limit recorded-run-regression-only: detects regression from a recorded run and cannot see a defect present at first capture; format-derived property oracles required-not-implemented\n' +
        'configuration-limits: 0 []\n' +
        'loss-path-audit: partial; audited 1 [swf.fill.solid@audit:loss-path-v1 by builder2 at 2026-08-07T00:00:00.000Z subject sha256:subject:swf.fill.solid: identified]; can-silently-lose 1; audited-none 0; unaudited 1 [swf.text.define-text]\n' +
        'diagnostic-channels: structured-crumb 1 [swf.fill.solid]; human-log-only 0 []; none 1 [swf.text.define-text]\n' +
        'instrument-payload-audited: 1 [swf.fill.solid]\n' +
        'instrument-scope-audited: 1 [swf.fill.solid]\n' +
        'fire-proof-referenced-all: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#reports solid-fill loss]]\n' +
        'fire-proof-referenced-and-exercised: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#reports solid-fill loss]]\n' +
        'fire-results: pass 1/1 [swf.fill.solid], fail 0/1 [], unknown 0/1 []\n' +
        'silence-proof-referenced-all: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent]]\n' +
        'silence-proof-referenced-and-exercised: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent]]\n' +
        'silence-results: pass 1/1 [swf.fill.solid], fail 0/1 [], unknown 0/1 []\n' +
        'witness-depth: 1 single-witness [swf.fill.solid]\n' +
        'unknown-observations: configuration-limit 0 [], cause-unknown 0 [], instrument-audit-incomplete 0 [], known-unwired 0 [], loss-path-unidentified 0 [], no-fire 0 [], no-silence 0 []\n',
    );
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
        configurationLimitsByCapability: new Map([
          [
            'swf.fill.solid',
            {
              limits: [{ id: 'MAX_FILL_RECORDS', reporting: 'unobservable' as const }] as const,
              state: 'declared' as const,
            },
          ],
        ]),
        importerDeclaredCensus: TEST_CENSUS,
        unwiredLossesByCapability: new Map([
          [
            'swf.fill.solid',
            [
              {
                contentFidelity: 'substituted' as const,
                reason: 'loss-path-known-not-wired' as const,
                reference: 'font-definition-overwrite',
              },
            ],
          ],
        ]),
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

  it('does not reintroduce pass over exercised as an alias', () => {
    const source = readFileSync(join(import.meta.dirname, 'import-conformance-format.ts'), 'utf8');
    expect(source).not.toContain('pass-of-exercised');
    expect(source).not.toContain('pass-of-instrumented');
    expect(source).not.toContain('instrumented-of-exercised');
    expect(source).not.toMatch(/proof-referenced-(?:all|and-exercised):[^\n]*\d+\/\d+/);
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
