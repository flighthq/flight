import { resolve } from 'node:path';

export const CAPTURE_CLI_COMMANDS = ['batch', 'benchmark', 'capture', 'observe', 'validate'] as const;

export type CaptureCliCommand = (typeof CAPTURE_CLI_COMMANDS)[number];

// These groups mirror the functions that actually read them in bin.ts. bin.test.ts extracts every
// literal flag()/hasFlag() read from those functions and compares it to this inventory, so adding an
// option to either side without the other is a failing audit rather than another accepted-and-ignored
// argument. Batch deliberately accepts their union because its configured operations delegate to all
// three pass readers.
export const CAPTURE_CLI_OPTION_GROUPS = {
  batch: ['config', 'only', 'subjects-parallel'],
  benchmark: [
    'benchmark-reference',
    'filter',
    'iterations',
    'out',
    'performance-tolerance',
    'renderer',
    'retries',
    'sample-duration',
    'samples',
    'stability-tolerance',
    'update-benchmarks',
    'warmup',
  ],
  capture: [
    'fail-on-changed',
    'fail-on-error',
    'filter',
    'filter-exact',
    'frames',
    'no-verify',
    'observe',
    'out',
    'renderer',
    'retries',
    'sequential',
    'update-baseline',
    'verify',
    'wait',
  ],
  common: ['capture-timeout'],
  observe: ['frames', 'out', 'retries', 'wait'],
  parallel: ['parallel'],
  suite: ['build', 'dev', 'dir', 'manifest', 'root', 'subject', 'tool', 'url'],
  validation: [
    'filter',
    'filter-exact',
    'frames',
    'no-parity',
    'no-regression',
    'out',
    'parity-tolerance',
    'regression-tolerance',
    'renderer',
    'report',
    'sequential',
    'stability-epsilon',
    'update-coverage',
    'update-fingerprints',
  ],
} as const;

// Kept separately from the command groups because argument shape is part of the acceptance contract:
// flag() consumes a value while hasFlag() consumes presence. bin.test.ts mechanically compares this
// inventory with every hasFlag() read, preventing `--boolean=value` from becoming an accepted no-op.
export const CAPTURE_CLI_BOOLEAN_OPTIONS = [
  'build',
  'dev',
  'fail-on-changed',
  'fail-on-error',
  'no-parity',
  'no-regression',
  'no-verify',
  'observe',
  'report',
  'sequential',
  'update-baseline',
  'update-benchmarks',
  'update-coverage',
  'update-fingerprints',
  'verify',
] as const;

export function resolveCaptureCliReportPath(
  root: string,
  outBase: string | undefined,
  subject: string,
  reportName: string,
): string | undefined {
  return outBase === undefined ? undefined : resolve(root, outBase, subject, reportName);
}

export function validateCaptureCliOptions(command: CaptureCliCommand, argv: readonly string[]): void {
  const allowed = OPTIONS_BY_COMMAND[command];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    const name = getOptionName(argument);
    if (name === null) {
      if (command !== 'observe' || index !== 0) throw new Error(`unexpected argument for ${command}: ${argument}`);
      continue;
    }
    if (!allowed.has(name)) throw new Error(`unknown option for ${command}: --${name}`);
    const equalsIndex = argument.indexOf('=');
    if (BOOLEAN_OPTIONS.has(name)) {
      if (equalsIndex >= 0) throw new Error(`option --${name} does not take a value`);
      continue;
    }
    if (equalsIndex >= 0) {
      if (argument.length === equalsIndex + 1) throw new Error(`option --${name} requires a value`);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`option --${name} requires a value`);
    index++;
  }

  // validate runs a capture pass only while writing fingerprints. Without that operation these options
  // have no consumer, so accepting them would recreate the exact silent-drop defect this audit closes.
  if (command === 'validate' && !hasOption(argv, 'update-fingerprints')) {
    for (const name of VALIDATION_CAPTURE_ONLY_OPTIONS) {
      if (hasOption(argv, name)) throw new Error(`validate option --${name} requires --update-fingerprints`);
    }
  }
}

const COMMON = CAPTURE_CLI_OPTION_GROUPS.common;
const SUITE = CAPTURE_CLI_OPTION_GROUPS.suite;
const CAPTURE = [...CAPTURE_CLI_OPTION_GROUPS.capture, ...CAPTURE_CLI_OPTION_GROUPS.parallel];
const VALIDATION = [...CAPTURE_CLI_OPTION_GROUPS.validation, ...CAPTURE_CLI_OPTION_GROUPS.parallel];
const BENCHMARK = CAPTURE_CLI_OPTION_GROUPS.benchmark;
const BOOLEAN_OPTIONS: ReadonlySet<string> = new Set(CAPTURE_CLI_BOOLEAN_OPTIONS);

const OPTIONS_BY_COMMAND: Readonly<Record<CaptureCliCommand, ReadonlySet<string>>> = {
  batch: new Set([...COMMON, ...SUITE, ...CAPTURE, ...VALIDATION, ...BENCHMARK, ...CAPTURE_CLI_OPTION_GROUPS.batch]),
  benchmark: new Set([...COMMON, ...SUITE, ...BENCHMARK]),
  capture: new Set([...COMMON, ...SUITE, ...CAPTURE]),
  observe: new Set([...COMMON, ...CAPTURE_CLI_OPTION_GROUPS.observe]),
  validate: new Set([...COMMON, ...SUITE, ...CAPTURE, ...VALIDATION]),
};

const VALIDATION_CAPTURE_ONLY_OPTIONS = CAPTURE.filter((name) => !new Set<string>(VALIDATION).has(name));

function getOptionName(argument: string): string | null {
  if (!argument.startsWith('--')) return null;
  const equalsIndex = argument.indexOf('=');
  return argument.slice(2, equalsIndex < 0 ? undefined : equalsIndex);
}

function hasOption(argv: readonly string[], name: string): boolean {
  return argv.some((argument) => argument === `--${name}` || argument.startsWith(`--${name}=`));
}
