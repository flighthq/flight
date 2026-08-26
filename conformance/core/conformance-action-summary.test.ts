import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderConformanceActionSummary } from '../../scripts/conformance-action-summary';
import type { FixtureImportConformanceReport } from '../fixtures/import-fixture-conformance';
import type { ImportConformanceScore } from './import-conformance-score';

describe('renderConformanceActionSummary', () => {
  it('renders fixture, capability, oracle, and audit measurements without turning them into verdicts', () => {
    const summary = renderConformanceActionSummary(fixtureReport(), swfReport(), {
      artifactName: 'conformance-deadbeef',
    });

    expect(summary).toContain('# Conformance report');
    expect(summary).toContain('Corpus outcomes are advisory measurements');
    expect(summary).toContain('`conformance-deadbeef` Actions artifact');
    expect(summary).toContain('| Cleanly imported files | 25.0% (1/4) |');
    expect(summary).toContain(
      '| Imported | Intentional choice | Degraded | Unsupported | Rejected | Threw | Not run |',
    );
    expect(summary).toContain('| obj | available | 50.0% (2/4) | 100.0% (2/2) | 50.0% (1/2) |');
    expect(summary).toContain('| swf-ruffle-fixtures | measured | 7 | 2 | 3 | 1 | 0 | 5 / 8 | 9 / 2 / 1 |');
    expect(summary).toContain(
      '| swf-ruffle-fixtures | 2 / 1 / 1 | 3 / 0 / 1 | 4 | 3 | partial: 4 audited, 4 unaudited |',
    );
  });

  it('reports unavailable outputs while still producing a useful summary', () => {
    const summary = renderConformanceActionSummary(undefined, undefined, {
      artifactName: 'conformance-missing',
      fixtureProblem: 'Fixture command failed before writing JSON.',
      swfProblem: 'SWF command did not run.',
    });

    expect(summary).toContain('⚠️ Fixture command failed before writing JSON.');
    expect(summary).toContain('⚠️ SWF command did not run.');
  });

  it('keeps the always-run summary before artifact upload in the conformance workflow', () => {
    const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/conformance.yml'), 'utf8');
    const summaryStep = workflow.indexOf('name: Publish conformance job summary');
    const artifactStep = workflow.indexOf('name: Upload conformance reports');

    expect(summaryStep).toBeGreaterThan(-1);
    expect(workflow.slice(summaryStep, artifactStep)).toContain('if: always()');
    expect(workflow.slice(summaryStep, artifactStep)).toContain('continue-on-error: true');
    expect(workflow.slice(summaryStep, artifactStep)).toContain('scripts/conformance-action-summary.ts');
    expect(artifactStep).toBeGreaterThan(summaryStep);
  });
});

function fixtureReport(): FixtureImportConformanceReport {
  return {
    fixtureRelease: '0.1.1',
    score: {
      families: [
        {
          acceptedImport: fraction(1, 2),
          adapter: 'obj',
          eligibleCandidateRuns: 4,
          executionCoverage: fraction(2, 2),
          implementation: 'available',
          selectedCandidateRuns: 2,
          selectionCoverage: fraction(2, 4),
        },
      ],
      features: {
        checks: { failed: 1, 'not-run': 2, passed: 3 },
        workingAsExpected: fraction(2, 3),
      },
      files: {
        acceptedCoverage: fraction(1, 4),
        executionCoverage: fraction(2, 4),
        selectionCoverage: fraction(2, 4),
      },
      outcomes: {
        degraded: 1,
        imported: 1,
        'intentional-choice': 0,
        'not-run': 0,
        rejected: 0,
        threw: 0,
        unsupported: 0,
      },
    },
  } as unknown as FixtureImportConformanceReport;
}

function swfReport(): ImportConformanceScore {
  return {
    packs: [
      {
        capabilities: Array.from({ length: 8 }, (_, index) => ({ id: `capability-${index}` })),
        fixtureOutcomes: {
          populations: { importedWrong: 2, passed: 7, silentlyWrong: 1, threw: 0, unsupportedClean: 3 },
        },
        id: 'swf-ruffle-fixtures',
        oracleOutcomes: { populations: { failed: 2, notRun: 1, passed: 9 } },
        state: 'measured',
        summary: {
          exercised: {
            capabilities: 5,
            fireReferenced: {
              results: { failedCapabilities: 1, passedCapabilities: 2, unknownCapabilities: 1 },
            },
            silenceReferenced: {
              results: { failedCapabilities: 0, passedCapabilities: 3, unknownCapabilities: 1 },
            },
          },
          instrumentAudited: { payloadCapabilities: 4, scopeCapabilities: 3 },
          lossPathPopulation: { auditState: 'partial', auditedCapabilities: 4, unauditedCapabilities: 4 },
        },
      },
    ],
  } as unknown as ImportConformanceScore;
}

function fraction(numerator: number, denominator: number) {
  return { denominator, numerator, state: 'measured', value: numerator / denominator } as const;
}
