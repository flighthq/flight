import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURE_RELEASE_TAG, resolveFixtureCacheDirectory } from '../../scripts/fixtures';
import type { ConformanceFixtureResult, ConformanceFixtureState } from '../core/fixture-conformance';
import {
  discoverConformanceFixtureTrees,
  getConformanceFixtureTreeLabel,
  runConformanceFixtureAdapters,
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
  const trees =
    args.packs.length === 0
      ? variantTrees
      : variantTrees.filter((tree) => tree.packs.some((pack) => args.packs.includes(pack.id)));

  const allAdapters = createImportFixtureAdapters();
  const knownAdapterIds = new Set(allAdapters.map((adapter) => adapter.id));
  const unknownAdapters = args.adapters.filter((adapter) => !knownAdapterIds.has(adapter));
  if (unknownAdapters.length > 0) throw new Error(`Unknown fixture adapter: ${unknownAdapters.join(', ')}`);
  const adapters =
    args.adapters.length === 0 ? allAdapters : allAdapters.filter((adapter) => args.adapters.includes(adapter.id));

  const results = await runConformanceFixtureAdapters(trees, adapters, {
    concurrency: args.concurrency,
    ...(args.limit === undefined ? {} : { limit: args.limit }),
  });
  return {
    fixtureRelease: FIXTURE_RELEASE_TAG,
    results,
    schemaVersion: 1,
    selection: {
      adapters: adapters.map((adapter) => adapter.id),
      ...(args.limit === undefined ? {} : { limit: args.limit }),
      packs: args.packs,
      ...(args.variant === undefined ? {} : { variant: args.variant }),
    },
    summary: summarizeResults(results),
    trees: trees.map((tree) => ({
      packs: tree.packs,
      path: relative(REPOSITORY_ROOT, tree.directory).replaceAll('\\', '/'),
      tree: tree.tree,
      variant: tree.variant,
    })),
    unavailablePacks,
  };
}

interface FixtureImportConformanceReport {
  fixtureRelease: string;
  results: readonly Readonly<ConformanceFixtureResult>[];
  schemaVersion: 1;
  selection: {
    adapters: readonly string[];
    limit?: number;
    packs: readonly string[];
    variant?: string;
  };
  summary: Readonly<Record<ConformanceFixtureState | 'total', number>>;
  trees: readonly {
    packs: readonly { id: string; verifiedFixtureFiles: number }[];
    path: string;
    tree: string;
    variant: string;
  }[];
  unavailablePacks: readonly string[];
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
    const report = await runImportFixtureConformance(args);
    const output = resolve(args.output);
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
  for (const adapter of adapters) process.stdout.write(`  ${adapter.id}\n`);
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
  const lines = [
    `Fixture import conformance — release ${report.fixtureRelease}`,
    `Verified trees: ${report.trees.length}; importer runs: ${report.summary.total}`,
    `Outcomes: imported ${report.summary.imported}, unsupported ${report.summary.unsupported}, rejected ${report.summary.rejected}, threw ${report.summary.threw}, not-run ${report.summary['not-run']}`,
  ];
  for (const pack of report.unavailablePacks) {
    lines.push(`Unavailable: ${pack}; acquire it with npm run fixtures -- ${pack}`);
  }
  const findings = report.results.filter((result) => result.state !== 'imported');
  for (const result of findings.slice(0, 20)) {
    lines.push(`  ${result.state} ${result.adapter} ${result.variant}/${result.tree}/${result.reference}`);
  }
  if (findings.length > 20) lines.push(`  … ${findings.length - 20} more non-imported outcomes in the report`);
  lines.push(`Wrote ${output}`);
  return `${lines.join('\n')}\n`;
}

function summarizeResults(
  results: readonly Readonly<ConformanceFixtureResult>[],
): Record<ConformanceFixtureState | 'total', number> {
  const summary = { imported: 0, 'not-run': 0, rejected: 0, threw: 0, total: results.length, unsupported: 0 };
  for (const result of results) summary[result.state] += 1;
  return summary;
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

Runs real Flight importers over every matching file in locally verified flight-oracles trees.
Fixture outcomes are evidence, not a gate: rejected, unsupported, and thrown inputs are recorded and the
command still succeeds. Harness/configuration errors exit nonzero.

  --adapter <id>       run one adapter (repeatable)
  --concurrency <n>    importer runs in flight (default: up to 8)
  --limit <n>          deterministic global candidate limit
  --list               list adapters and locally verified trees
  --output <path>      JSON report (default: ${DEFAULT_OUTPUT})
  --pack <id>          run a verified pack (repeatable)
  --variant <name>     select an installed release variant
`;

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) void main();
