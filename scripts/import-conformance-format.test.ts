import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildImportConformanceCapabilityIndex,
  createImportConformanceNotRunScore,
  createImportConformanceScore,
  createImportConformanceShardPlan,
} from './import-conformance-core';
import { formatImportConformanceScore } from './import-conformance-format';

const DEFINITIONS = [
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
] as const;
const PACK = { id: 'swf-ruffle-fixtures', release: '0.1.0', variant: 'full' } as const;
const PROVENANCE = { mode: 'exhaustive', runId: 'run-17', runUrl: 'https://ci.invalid/run-17' } as const;

describe('formatImportConformanceScore', () => {
  it('emits the entire nested denominator chain together', () => {
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
    );

    expect(formatImportConformanceScore(score)).toContain(
      'instrument-assurance: payload-validity=external-audit-required trigger-correctness=proof-reference-presence trigger-scope=external-audit-required trigger-specificity=proof-reference-presence\n' +
        'swf-ruffle-fixtures 0.1.0 [full]\n' +
        'exercised-of-total: 1/2 [exercised: swf.fill.solid; total: swf.fill.solid, swf.text.define-text]\n' +
        'loss-path-audit: partial; audited 1 [swf.fill.solid@audit:loss-path-v1/2026-08-07T00:00:00.000Z/sha256:subject:swf.fill.solid:identified]; can-silently-lose 1; audited-none 0; unaudited 1 [swf.text.define-text]\n' +
        'fire-proof-referenced-all: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#reports solid-fill loss]]\n' +
        'fire-proof-referenced-and-exercised: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#reports solid-fill loss]]\n' +
        'fire-results: pass 1/1 [swf.fill.solid], fail 0/1 [], unknown 0/1 []\n' +
        'silence-proof-referenced-all: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent]]\n' +
        'silence-proof-referenced-and-exercised: 1 [swf.fill.solid [packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent]]\n' +
        'silence-results: pass 1/1 [swf.fill.solid], fail 0/1 [], unknown 0/1 []\n' +
        'witness-depth: 1 single-witness [swf.fill.solid]\n' +
        'unknown-observations: cause-unknown 0 [], known-unwired 0 [], loss-path-unidentified 0 [], no-fire 0 [], no-silence 0 []\n',
    );
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
