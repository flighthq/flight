import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseImportConformanceScore, type ImportConformanceScore } from '../conformance/core/import-conformance-score';
import type { FixtureImportConformanceReport } from '../conformance/fixtures/import-fixture-conformance';

const FIXTURE_REPORT_PATH = '.artifacts/conformance/fixture-imports.json';
const SWF_REPORT_PATH = '.artifacts/import-conformance/score.json';

export function renderConformanceActionSummary(
  fixtureReport: Readonly<FixtureImportConformanceReport> | undefined,
  swfReport: Readonly<ImportConformanceScore> | undefined,
  options: Readonly<{
    artifactName: string;
    fixtureProblem?: string;
    swfProblem?: string;
  }>,
): string {
  const lines = [
    '# Conformance report',
    '',
    '> Corpus outcomes are advisory measurements. Contract, acquisition, corpus-completeness, harness, and seeded-ratchet failures remain gating.',
    '',
    `Full JSON reports are retained in the \`${escapeInlineCode(options.artifactName)}\` Actions artifact.`,
    '',
    '## Fixture import coverage',
    '',
  ];

  if (fixtureReport === undefined) {
    lines.push(`> ⚠️ ${options.fixtureProblem ?? 'The fixture import report was not produced.'}`, '');
  } else {
    appendFixtureSummary(lines, fixtureReport);
  }

  lines.push('## SWF capability and oracle coverage', '');
  if (swfReport === undefined) {
    lines.push(`> ⚠️ ${options.swfProblem ?? 'The SWF conformance score was not produced.'}`, '');
  } else {
    appendSwfSummary(lines, swfReport);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function appendFixtureSummary(lines: string[], report: Readonly<FixtureImportConformanceReport>): void {
  const { score } = report;
  lines.push(
    `Fixture release: \`${escapeInlineCode(report.fixtureRelease)}\``,
    '',
    '| Metric | Result |',
    '| --- | ---: |',
    `| Cleanly imported files | ${formatFraction(score.files.acceptedCoverage)} |`,
    `| Files selected for execution | ${formatFraction(score.files.selectionCoverage)} |`,
    `| Files completed | ${formatFraction(score.files.executionCoverage)} |`,
    `| Features working as expected | ${formatFraction(score.features.workingAsExpected)} |`,
    `| Feature checks (passed / failed / not run) | ${score.features.checks.passed} / ${score.features.checks.failed} / ${score.features.checks['not-run']} |`,
    '',
    '| Imported | Intentional choice | Degraded | Unsupported | Rejected | Threw | Not run |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${score.outcomes.imported} | ${score.outcomes['intentional-choice']} | ${score.outcomes.degraded} | ${score.outcomes.unsupported} | ${score.outcomes.rejected} | ${score.outcomes.threw} | ${score.outcomes['not-run']} |`,
    '',
  );

  const families = score.families.filter(
    (family) => family.eligibleCandidateRuns > 0 || family.selectedCandidateRuns > 0,
  );
  if (families.length === 0) {
    lines.push('No fixture families matched the verified corpus.', '');
    return;
  }

  lines.push(
    '<details>',
    `<summary>Adapter coverage (${families.length} matching families)</summary>`,
    '',
    '| Adapter | Implementation | Selected | Executed | Clean import |',
    '| --- | --- | ---: | ---: | ---: |',
  );
  for (const family of families) {
    lines.push(
      `| ${escapeTableCell(family.adapter)} | ${family.implementation} | ${formatFraction(family.selectionCoverage)} | ${formatFraction(family.executionCoverage)} | ${formatFraction(family.acceptedImport)} |`,
    );
  }
  lines.push('', '</details>', '');
}

function appendSwfSummary(lines: string[], report: Readonly<ImportConformanceScore>): void {
  if (report.packs.length === 0) {
    lines.push('No SWF fixture packs were recorded.', '');
    return;
  }

  lines.push(
    '| Pack | State | Passed | Imported wrong | Unsupported | Silently wrong | Threw | Capabilities exercised | Oracles P / F / NR |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const pack of report.packs) {
    if (pack.state === 'not-run') {
      lines.push(
        `| ${escapeTableCell(pack.id)} | not run: ${escapeTableCell(pack.reason)} | — | — | — | — | — | — | — |`,
      );
      continue;
    }
    const fixtures = pack.fixtureOutcomes.populations;
    const oracles = pack.oracleOutcomes.populations;
    lines.push(
      `| ${escapeTableCell(pack.id)} | measured | ${fixtures.passed} | ${fixtures.importedWrong} | ${fixtures.unsupportedClean} | ${fixtures.silentlyWrong} | ${fixtures.threw} | ${pack.summary.exercised.capabilities} / ${pack.capabilities.length} | ${oracles.passed} / ${oracles.failed} / ${oracles.notRun} |`,
    );
  }
  lines.push('');

  const measured = report.packs.filter((pack) => pack.state === 'measured');
  if (measured.length === 0) return;
  lines.push(
    '<details>',
    '<summary>SWF trigger and audit detail</summary>',
    '',
    '| Pack | Fire P / F / unknown | Silence P / F / unknown | Payload audited | Scope audited | Loss-path audit |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  );
  for (const pack of measured) {
    const { fireReferenced, silenceReferenced } = pack.summary.exercised;
    const loss = pack.summary.lossPathPopulation;
    lines.push(
      `| ${escapeTableCell(pack.id)} | ${formatLane(fireReferenced.results)} | ${formatLane(silenceReferenced.results)} | ${pack.summary.instrumentAudited.payloadCapabilities} | ${pack.summary.instrumentAudited.scopeCapabilities} | ${loss.auditState}: ${loss.auditedCapabilities} audited, ${loss.unauditedCapabilities} unaudited |`,
    );
  }
  lines.push('', '</details>', '');
}

function formatFraction(score: {
  denominator: number;
  numerator: number;
  state: 'measured' | 'not-measured';
  value: number | null;
}): string {
  return score.state === 'not-measured'
    ? `not measured (${score.numerator}/${score.denominator})`
    : `${((score.value ?? 0) * 100).toFixed(1)}% (${score.numerator}/${score.denominator})`;
}

function formatLane(results: {
  failedCapabilities: number;
  passedCapabilities: number;
  unknownCapabilities: number;
}): string {
  return `${results.passedCapabilities} / ${results.failedCapabilities} / ${results.unknownCapabilities}`;
}

function escapeInlineCode(value: string): string {
  return value.replaceAll('`', "'");
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
}

function readFixtureReport(): { problem?: string; report?: FixtureImportConformanceReport } {
  try {
    const value = JSON.parse(readFileSync(FIXTURE_REPORT_PATH, 'utf8')) as unknown;
    if (!isRecord(value) || typeof value.fixtureRelease !== 'string' || !isRecord(value.score)) {
      throw new Error('the report has an unexpected shape');
    }
    return { report: value as unknown as FixtureImportConformanceReport };
  } catch (error) {
    return { problem: describeReadProblem(FIXTURE_REPORT_PATH, error) };
  }
}

function readSwfReport(): { problem?: string; report?: ImportConformanceScore } {
  try {
    const value = JSON.parse(readFileSync(SWF_REPORT_PATH, 'utf8')) as unknown;
    return { report: parseImportConformanceScore(value, SWF_REPORT_PATH) };
  } catch (error) {
    return { problem: describeReadProblem(SWF_REPORT_PATH, error) };
  }
}

function describeReadProblem(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Report unavailable at \`${escapeInlineCode(path)}\`: ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function main(): void {
  const fixture = readFixtureReport();
  const swf = readSwfReport();
  const summary = renderConformanceActionSummary(fixture.report, swf.report, {
    artifactName: process.env['CONFORMANCE_ARTIFACT_NAME'] ?? 'conformance reports',
    ...(fixture.problem === undefined ? {} : { fixtureProblem: fixture.problem }),
    ...(swf.problem === undefined ? {} : { swfProblem: swf.problem }),
  });
  const output = process.env['GITHUB_STEP_SUMMARY'];
  if (output === undefined || output === '') process.stdout.write(summary);
  else appendFileSync(output, `\n${summary}`, 'utf8');
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
