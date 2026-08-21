import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURE_RELEASE_TAG, resolveFixtureCacheDirectory } from '../../scripts/fixtures';
import type {
  ConformanceFixtureFractionScore,
  ConformanceFixtureResult,
  ConformanceFixtureScore,
} from '../core/fixture-conformance';
import {
  createConformanceFixturePlan,
  discoverConformanceFixtureTrees,
  getConformanceFixtureTreeLabel,
  runConformanceFixturePlan,
  scoreConformanceFixturePlan,
} from '../core/fixture-conformance';
import { createImportFixtureAdapters } from './import-fixture-adapters';

export interface ImportFixtureConformanceArguments {
  adapters: readonly string[];
  concurrency: number;
  help: boolean;
  limit?: number;
  list: boolean;
  output: string;
  packs: readonly string[];
  variant?: string;
}

export function parseImportFixtureConformanceArguments(argv: readonly string[]): ImportFixtureConformanceArguments {
  const adapters: string[] = [];
  const packs: string[] = [];
  let concurrency = Math.min(8, Math.max(1, availableParallelism()));
  let help = false;
  let limit: number | undefined;
  let list = false;
  let output = DEFAULT_OUTPUT;
  let variant: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--adapter') adapters.push(requireValue(argv, ++index, '--adapter'));
    else if (argument.startsWith('--adapter=')) adapters.push(requireInlineValue(argument, '--adapter'));
    else if (argument === '--concurrency')
      concurrency = parsePositiveInteger(requireValue(argv, ++index, argument), argument);
    else if (argument.startsWith('--concurrency=')) {
      concurrency = parsePositiveInteger(requireInlineValue(argument, '--concurrency'), '--concurrency');
    } else if (argument === '--help' || argument === '-h') help = true;
    else if (argument === '--limit') limit = parsePositiveInteger(requireValue(argv, ++index, argument), argument);
    else if (argument.startsWith('--limit='))
      limit = parsePositiveInteger(requireInlineValue(argument, '--limit'), '--limit');
    else if (argument === '--list') list = true;
    else if (argument === '--output') output = requireValue(argv, ++index, argument);
    else if (argument.startsWith('--output=')) output = requireInlineValue(argument, '--output');
    else if (argument === '--pack') packs.push(requireValue(argv, ++index, '--pack'));
    else if (argument.startsWith('--pack=')) packs.push(requireInlineValue(argument, '--pack'));
    else if (argument === '--variant') variant = requireValue(argv, ++index, argument);
    else if (argument.startsWith('--variant=')) variant = requireInlineValue(argument, '--variant');
    else throw new Error(`Unknown fixture conformance option ${argument}`);
  }

  return {
    adapters: [...new Set(adapters)].sort(),
    concurrency,
    help,
    ...(limit === undefined ? {} : { limit }),
    list,
    output,
    packs: [...new Set(packs)].sort(),
    ...(variant === undefined ? {} : { variant }),
  };
}

export async function runImportFixtureConformance(
  args: Readonly<ImportFixtureConformanceArguments>,
): Promise<FixtureImportConformanceReport> {
  const cacheDirectory = resolveFixtureCacheDirectory();
  const allTrees = discoverConformanceFixtureTrees(cacheDirectory);
  const variantTrees = args.variant === undefined ? allTrees : allTrees.filter((tree) => tree.variant === args.variant);
  const availablePacks = new Set(variantTrees.flatMap((tree) => tree.packs.map((pack) => pack.id)));
  const unavailablePacks = args.packs.filter((pack) => !availablePacks.has(pack));
  if (unavailablePacks.length > 0) {
    throw new Error(
      `Verified fixture pack${unavailablePacks.length === 1 ? '' : 's'} unavailable: ${unavailablePacks.join(', ')}. Acquire with npm run fixtures -- ${unavailablePacks.join(' ')}`,
    );
  }
  const trees =
    args.packs.length === 0
      ? variantTrees
      : variantTrees.filter((tree) => tree.packs.some((pack) => args.packs.includes(pack.id)));
  if (trees.length === 0) {
    const variant = args.variant === undefined ? '' : ` for variant ${args.variant}`;
    throw new Error(
      `No verified fixture trees are available${variant}. Acquire the full corpus explicitly with npm run fixtures -- --all`,
    );
  }

  const allAdapters = createImportFixtureAdapters();
  const knownAdapterIds = new Set(allAdapters.map((adapter) => adapter.id));
  const unknownAdapters = args.adapters.filter((adapter) => !knownAdapterIds.has(adapter));
  if (unknownAdapters.length > 0) throw new Error(`Unknown fixture adapter: ${unknownAdapters.join(', ')}`);
  const adapters =
    args.adapters.length === 0 ? allAdapters : allAdapters.filter((adapter) => args.adapters.includes(adapter.id));

  const plan = createConformanceFixturePlan(trees, adapters, {
    ...(args.limit === undefined ? {} : { limit: args.limit }),
  });
  const results = await runConformanceFixturePlan(plan, args.concurrency);
  const score = scoreConformanceFixturePlan(plan, results);
  return {
    fixtureRelease: FIXTURE_RELEASE_TAG,
    results,
    schemaVersion: 5,
    score,
    selection: {
      adapters: adapters.map((adapter) => adapter.id),
      ...(args.limit === undefined ? {} : { limit: args.limit }),
      packs: args.packs,
      ...(args.variant === undefined ? {} : { variant: args.variant }),
    },
    trees: trees.map((tree) => {
      const census = plan.trees.find((candidate) => candidate.tree === tree.tree && candidate.variant === tree.variant);
      if (census === undefined)
        throw new Error(`Fixture conformance plan has no tree census for ${tree.variant}/${tree.tree}`);
      return {
        candidateRuns: census.eligibleCandidateRuns,
        fixtureFiles: census.fixtureFiles,
        matchedFixtureFiles: census.matchedFixtureFiles,
        packs: tree.packs.map(({ id, verifiedFixtureFiles }) => ({ id, verifiedFixtureFiles })),
        path: relative(REPOSITORY_ROOT, tree.directory).replaceAll('\\', '/'),
        selectedCandidateRuns: census.selectedCandidateRuns,
        stampedFixtureFiles: census.stampedFixtureFiles,
        tree: tree.tree,
        variant: tree.variant,
      };
    }),
  };
}

export interface FixtureImportConformanceReport {
  fixtureRelease: string;
  results: readonly Readonly<ConformanceFixtureResult>[];
  schemaVersion: 5;
  score: Readonly<ConformanceFixtureScore>;
  selection: {
    adapters: readonly string[];
    limit?: number;
    packs: readonly string[];
    variant?: string;
  };
  trees: readonly {
    candidateRuns: number;
    fixtureFiles: number;
    matchedFixtureFiles: number;
    packs: readonly { id: string; verifiedFixtureFiles: number }[];
    path: string;
    selectedCandidateRuns: number;
    stampedFixtureFiles: number;
    tree: string;
    variant: string;
  }[];
}

async function main(): Promise<void> {
  try {
    const args = parseImportFixtureConformanceArguments(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(USAGE);
      return;
    }
    if (args.list) {
      listInfrastructure();
      return;
    }
    const output = resolve(args.output);
    // A failed acquisition/configuration run must not leave a prior score available for a caller to mistake
    // for current evidence. The report is generated and gitignored, so clearing it is the preparation step.
    rmSync(output, { force: true });
    const report = await runImportFixtureConformance(args);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(formatReport(report, output));
  } catch (error) {
    process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function listInfrastructure(): void {
  const adapters = createImportFixtureAdapters();
  const trees = discoverConformanceFixtureTrees(resolveFixtureCacheDirectory());
  process.stdout.write(`Import fixture adapters (${adapters.length}):\n`);
  for (const adapter of adapters) {
    process.stdout.write(
      `  ${adapter.id} — ${adapter.implementation.state}; ${adapter.features.length} declared feature expectation(s)\n`,
    );
  }
  process.stdout.write(`Verified fixture trees (${trees.length}):\n`);
  for (const tree of trees) {
    process.stdout.write(
      `  ${getConformanceFixtureTreeLabel(tree)} — ${tree.packs.map((pack) => pack.id).join(', ')}\n`,
    );
  }
  if (trees.length === 0) process.stdout.write('  none\n');
  process.stdout.write('Acquire every full-variant pack explicitly with: npm run fixtures -- --all\n');
}

function formatReport(report: Readonly<FixtureImportConformanceReport>, output: string): string {
  const score = report.score;
  const lines = [
    `Fixture coverage score — release ${report.fixtureRelease}`,
    `Files running cleanly: ${formatFractionScore(score.files.acceptedCoverage)}`,
    `Files attempted: ${formatFractionScore(score.files.selectionCoverage)}; ${score.files.matchedFiles} matched; completed without throw/not-run ${formatFractionScore(score.files.executionCoverage)}`,
    `Features working as expected: ${formatFractionScore(score.features.workingAsExpected)}`,
    `Features tested: ${score.features.testedFeatures}; observed ${score.features.observedFeatures}; declared ${score.features.declaredFeatures}`,
    `Feature checks: passed ${score.features.checks.passed}, failed ${score.features.checks.failed}, not-run ${score.features.checks['not-run']}`,
    `Supporting importer evidence: accepted among attempted files ${formatFractionScore(score.files.acceptedOfAttempted)}, selected runs ${formatFractionScore(score.selectionCoverage)}, implementation ${formatFractionScore(score.implementationCoverage)}, execution ${formatFractionScore(score.executionCoverage)}, diagnostic-clean import ${formatFractionScore(score.acceptedImport)}`,
    `Intentional choices: ${score.intentionalChoices.total} choice-bearing; ${score.intentionalChoices.exclusive} otherwise clean; ${score.intentionalChoices.mixed} also carrying a primary finding`,
    `Outcome populations: imported ${score.outcomes.imported}, intentional-choice ${score.outcomes['intentional-choice']}, degraded ${score.outcomes.degraded}, unsupported ${score.outcomes.unsupported}, rejected ${score.outcomes.rejected}, threw ${score.outcomes.threw}, not-run ${score.outcomes['not-run']}`,
  ];
  for (const feature of score.features.rows.filter((candidate) => candidate.state !== 'conforming').slice(0, 20)) {
    lines.push(
      `  feature ${feature.state} ${feature.id}: passed ${feature.checks.passed}, failed ${feature.checks.failed}, not-run ${feature.checks['not-run']}`,
    );
  }
  for (const family of score.families.filter((candidate) => candidate.eligibleCandidateRuns > 0)) {
    lines.push(
      `  ${family.adapter} [${family.implementation}]: selected ${formatFractionScore(family.selectionCoverage)}, implementation ${formatFractionScore(family.implementationCoverage)}, execution ${formatFractionScore(family.executionCoverage)}, accepted-import ${formatFractionScore(family.acceptedImport)}`,
    );
  }
  const findings = report.results.filter((result) => result.state !== 'imported');
  for (const result of findings.slice(0, 20)) {
    lines.push(`  ${result.state} ${result.adapter} ${result.variant}/${result.tree}/${result.reference}`);
  }
  if (findings.length > 20) lines.push(`  … ${findings.length - 20} more non-imported outcomes in the report`);
  lines.push(`Wrote ${output}`);
  return `${lines.join('\n')}\n`;
}

function formatFractionScore(score: Readonly<ConformanceFixtureFractionScore>): string {
  return score.state === 'not-measured'
    ? `not measured (${score.numerator}/${score.denominator})`
    : `${(score.value! * 100).toFixed(1)}% (${score.numerator}/${score.denominator})`;
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${option} requires a positive integer`);
  return parsed;
}

function requireInlineValue(argument: string, option: string): string {
  const value = argument.slice(option.length + 1);
  if (value.length === 0) throw new Error(`${option} requires a value`);
  return value;
}

function requireValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('-')) throw new Error(`${option} requires a value`);
  return value;
}

const DEFAULT_OUTPUT = '.artifacts/conformance/fixture-imports.json';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const USAGE = `usage: npm run conformance:fixtures -- [options]

Scores exhaustive per-file execution and adapter-declared feature expectations over matching files in locally
verified flight-fixtures trees. Every selected file is attempted even when earlier files reject or throw.
Fixture outcomes and unavailable implementations are evidence, not a gate: they are recorded and the command succeeds.
Missing or stale corpora, fixture-file population changes, and invalid configuration exit nonzero and leave no stale report.

  --adapter <id>       run one adapter (repeatable)
  --concurrency <n>    importer runs in flight (default: up to 8)
  --limit <n>          deterministic global candidate limit
  --list               list adapters and locally verified trees
  --output <path>      JSON report (default: ${DEFAULT_OUTPUT})
  --pack <id>          run a verified pack (repeatable)
  --variant <name>     select an installed release variant
`;

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) void main();
