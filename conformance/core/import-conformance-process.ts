import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ImportConformanceExhaustiveArguments {
  mode: 'exhaustive';
  pack: 'swf-ruffle-fixtures';
  runId: string;
  runUrl: string;
  scoreFile: string;
}

export interface ImportConformanceSubsetArguments {
  capability: string;
  mode: 'subset';
  pack: 'swf-ruffle-fixtures';
}

export type ImportConformanceArguments = ImportConformanceExhaustiveArguments | ImportConformanceSubsetArguments;

export interface ImportConformanceShardSelection {
  index: number;
  total: number;
}

export const IMPORT_CONFORMANCE_FAILURE_EXIT_CODE = 1;
export const IMPORT_CONFORMANCE_NOT_RUN_EXIT_CODE = 2;
export const IMPORT_CONFORMANCE_SUCCESS_EXIT_CODE = 0;

export function parseImportConformanceArguments(argv: readonly string[]): ImportConformanceArguments {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (!argument.startsWith('--')) throw new Error(`Unexpected positional argument ${argument}`);
    const equals = argument.indexOf('=');
    const name = equals < 0 ? argument : argument.slice(0, equals);
    if (!OPTION_NAMES.has(name)) throw new Error(`Unknown option ${name}`);
    if (options.has(name)) throw new Error(`Duplicate option ${name}`);
    const value = equals < 0 ? argv[++index] : argument.slice(equals + 1);
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${name} requires a value`);
    options.set(name, value);
  }

  const pack = options.get('--pack');
  if (pack !== PACK_ID) throw new Error(`--pack must be ${PACK_ID}`);
  const capability = options.get('--capability');
  if (capability !== undefined) {
    for (const forbidden of ['--run-id', '--run-url', '--score-file']) {
      if (options.has(forbidden)) throw new Error(`${forbidden} is unavailable for a capability subset`);
    }
    return { capability, mode: 'subset', pack };
  }

  const runId = requireOption(options, '--run-id');
  const runUrl = requireOption(options, '--run-url');
  return {
    mode: 'exhaustive',
    pack,
    runId,
    runUrl,
    scoreFile: options.get('--score-file') ?? DEFAULT_SCORE_FILE,
  };
}

export function parseImportConformanceShardSelection(value: string | undefined): ImportConformanceShardSelection {
  if (value === undefined || value === '') return { index: 0, total: 1 };
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (match === null) throw new Error('FLIGHT_CONFORMANCE_SHARD must be index/total');
  const oneBasedIndex = Number(match[1]);
  const total = Number(match[2]);
  if (
    !Number.isSafeInteger(oneBasedIndex) ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    oneBasedIndex < 1 ||
    oneBasedIndex > total
  ) {
    throw new Error('FLIGHT_CONFORMANCE_SHARD must satisfy 1 <= index <= total');
  }
  return { index: oneBasedIndex - 1, total };
}

export function prepareImportConformanceScoreTarget(path: string): void {
  rmSync(path, { force: true });
}

export function writeImportConformanceScoreAtomically(path: string, score: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  try {
    writeFileSync(temporary, `${JSON.stringify(score, null, 2)}\n`);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function requireOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (value === undefined) throw new Error(`${name} is required for an exhaustive score`);
  return value;
}

const DEFAULT_SCORE_FILE = '.artifacts/import-conformance/score.json';
const OPTION_NAMES = new Set(['--capability', '--pack', '--run-id', '--run-url', '--score-file']);
const PACK_ID = 'swf-ruffle-fixtures' as const;
