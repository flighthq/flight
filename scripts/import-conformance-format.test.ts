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
          capabilityOutcomes: [{ id: 'swf.fill.solid', outcome: 'passed' }],
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
      'measured',
      hash('importer'),
      PROVENANCE,
    );

    expect(formatImportConformanceScore(score)).toContain(
      'exercised-of-total: 1/2\n' +
        'instrumented-of-exercised: 1/1\n' +
        'pass-of-instrumented: 1/1\n' +
        'witness-depth: 1 single-witness/1 exercised\n',
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
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
