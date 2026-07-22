#!/usr/bin/env node
// Turn-key capture CLI:
// - observe <url>: one arbitrary page, zero integration, always emit eyes + diagnostics.
// - capture: a full entry × renderer report from a JSON manifest or Flight's built-in suites.
// - validate: tolerant regression/parity fingerprints over the same suite.
// - batch: capture + validate + benchmark workflow over many independently-configured subjects.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { readCaptureBatchManifest } from './captureBatchManifest.js';
import type { CaptureBenchmarkOptions } from './captureBenchmark.js';
import { runCaptureBenchmark } from './captureBenchmark.js';
import { discoverEntries } from './captureEntries.js';
import type { Entry } from './captureEntries.js';
import { captureUrl } from './captureEntry.js';
import { getFlightCaptureValidationPreset } from './captureFlightPreset.js';
import { isBrowserClosedError } from './captureInterrupt.js';
import type { CaptureManifest } from './captureManifest.js';
import { readCaptureManifest } from './captureManifest.js';
import { resolveCaptureDirectoryServer, resolveServer, resolveStaticServer } from './captureServer.js';
import { runCaptureSuite } from './captureSuite.js';
import { runCaptureValidation } from './captureValidation.js';
import type {
  CaptureWorkflowCaptureOptions,
  CaptureWorkflowOptions,
  CaptureWorkflowValidationOptions,
} from './captureWorkflow.js';
import { runCaptureBatch } from './captureWorkflow.js';

const USAGE = `usage:
  tool-capture observe <url> [--out <dir>] [--wait <ms>] [--frames <n>] [--retries <n>]
  tool-capture capture [--manifest <file>] (--url <url> | --dir <built-dir>) [options]
  tool-capture capture --tool <examples|functional> [options]
  tool-capture validate [--manifest <file>] (--url <url> | --dir <built-dir>) [options]
  tool-capture validate --tool <examples|functional> [options]
  tool-capture benchmark [--manifest <file>] (--url <url> | --dir <built-dir>) [options]
  tool-capture benchmark --tool <examples|functional> [options]
  tool-capture batch [--config <file>] [--only <subject>] [--subjects-parallel <n>] [options]

capture options:
  --filter <name> --renderer <ids> --out <dir> --wait <ms> --frames <n>
  --parallel <n> --sequential --dev --build --update-baseline --fail-on-changed
  --fail-on-error --verify --no-verify --observe --retries <n>

Every command writes a versioned aggregate JSON report beneath its artifact directory.

validation options:
  --report --update-fingerprints --no-regression --no-parity
  --stability-epsilon <n> --regression-tolerance <n> --parity-tolerance <n>

benchmark options:
  --warmup <n> --iterations <n> --samples <n> --sample-duration <ms> --benchmark-reference <renderer>
  --performance-tolerance <fraction> --stability-tolerance <fraction> --retries <n> --update-benchmarks

batch options:
  --config <file> defaults to tool-capture.batch.json; remaining options override every subject

Manifest: { "subject": "app", "entries": [{ "name": "home", "renderers": ["webgl"],
  "routes": { "webgl": "pages/home/" } }] }`;

function flag(argv: readonly string[], key: string): string | undefined {
  const equals = argv.find((arg) => arg.startsWith(`--${key}=`));
  if (equals !== undefined) return equals.slice(key.length + 3);
  const index = argv.indexOf(`--${key}`);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : undefined;
}

function hasFlag(argv: readonly string[], key: string): boolean {
  return argv.includes(`--${key}`);
}

interface CaptureCliSuite {
  entries: Entry[];
  manifest: CaptureManifest | null;
  root: string;
  server: Awaited<ReturnType<typeof resolveServer>>;
  subject: string;
}

async function resolveCaptureCliSuite(argv: readonly string[]): Promise<CaptureCliSuite> {
  const root = resolve(flag(argv, 'root') ?? process.cwd());
  const manifestPath = flag(argv, 'manifest');
  const toolName = flag(argv, 'tool');
  let manifest: CaptureManifest | null = null;
  let subject: string;
  let entries: Entry[];

  if (manifestPath !== undefined) {
    manifest = readCaptureManifest(resolve(root, manifestPath));
    subject = flag(argv, 'subject') ?? manifest.subject;
    entries = manifest.entries;
  } else if (toolName === 'examples' || toolName === 'functional') {
    subject = flag(argv, 'subject') ?? toolName;
    entries = discoverEntries(toolName, root);
  } else {
    const conventionalManifest = resolve(root, 'tool-capture.json');
    if (!existsSync(conventionalManifest)) throw new Error(`suite requires --manifest or --tool\n${USAGE}`);
    manifest = readCaptureManifest(conventionalManifest);
    subject = flag(argv, 'subject') ?? manifest.subject;
    entries = manifest.entries;
  }

  const externalUrl = flag(argv, 'url');
  const directory = flag(argv, 'dir');
  let server;
  if (externalUrl !== undefined) {
    console.log(`Using server at ${externalUrl}\n`);
    server = await resolveServer({ root, externalUrl });
  } else if (directory !== undefined) {
    console.log(`Serving ${resolve(root, directory)}…`);
    server = await resolveCaptureDirectoryServer(resolve(root, directory));
    console.log(`Ready at ${server.url}\n`);
  } else if (toolName === 'examples' || toolName === 'functional') {
    if (hasFlag(argv, 'dev')) console.log(`Starting ${toolName} dev server…`);
    else if (hasFlag(argv, 'build')) console.log(`Building and serving ${toolName} dist…`);
    else console.log(`Serving ${toolName} dist (use --build to rebuild, --dev for Vite)…`);
    server = hasFlag(argv, 'dev')
      ? await resolveServer({ tool: toolName, root })
      : await resolveStaticServer({ tool: toolName, root, forceBuild: hasFlag(argv, 'build') });
    console.log(`Ready at ${server.url}\n`);
  } else {
    throw new Error(`suite requires --url or --dir for manifest suites\n${USAGE}`);
  }
  return { entries, manifest, root, server, subject };
}

async function capture(argv: readonly string[]): Promise<number> {
  const { subject, entries, server, root } = await resolveCaptureCliSuite(argv);
  const result = await runCaptureSuite({
    ...captureOptions(argv),
    subject,
    entries,
    server,
    root,
  });
  if (result.aborted) return 130;
  return result.shouldFail ? 1 : 0;
}

async function validate(argv: readonly string[]): Promise<number> {
  const { subject, entries, server, root, manifest } = await resolveCaptureCliSuite(argv);
  const result = await runCaptureValidation({
    ...validationOptions(argv, subject, manifest),
    subject,
    entries,
    server,
    root,
  });
  if (result.aborted) return 130;
  return result.shouldFail ? 1 : 0;
}

async function benchmark(argv: readonly string[]): Promise<number> {
  const { subject, entries, server, root, manifest } = await resolveCaptureCliSuite(argv);
  const result = await runCaptureBenchmark({
    ...benchmarkOptions(argv, manifest),
    subject,
    entries,
    server,
    root,
  });
  return result.shouldFail ? 1 : 0;
}

function captureOptions(argv: readonly string[]): CaptureWorkflowCaptureOptions {
  const frames = flag(argv, 'frames');
  const observe = hasFlag(argv, 'observe');
  return {
    outBase: flag(argv, 'out') ?? '.artifacts',
    filter: flag(argv, 'filter'),
    rendererFilter: (flag(argv, 'renderer') ?? '').split(',').filter(Boolean),
    extraWait: parseNonNegativeInteger(flag(argv, 'wait'), 0),
    captureFrames: parseNonNegativeInteger(frames?.split(',')[0], 0),
    workerCount: Math.max(1, parseNonNegativeInteger(flag(argv, 'parallel'), 6)),
    sequential: hasFlag(argv, 'sequential'),
    updateBaseline: hasFlag(argv, 'update-baseline'),
    failOnChanged: hasFlag(argv, 'fail-on-changed'),
    failOnError: hasFlag(argv, 'fail-on-error'),
    observe,
    verify: hasFlag(argv, 'verify') ? true : hasFlag(argv, 'no-verify') ? false : undefined,
    maxRetries: parseNonNegativeInteger(flag(argv, 'retries'), observe ? 2 : 1),
  };
}

function validationOptions(
  argv: readonly string[],
  subject: string,
  manifest: CaptureManifest | null,
): CaptureWorkflowValidationOptions {
  const preset = getFlightCaptureValidationPreset(subject);
  return {
    filter: flag(argv, 'filter'),
    rendererFilter: (flag(argv, 'renderer') ?? '').split(',').filter(Boolean),
    captureFrames: Math.max(1, parseNonNegativeInteger(flag(argv, 'frames'), 1)),
    report: hasFlag(argv, 'report'),
    updateFingerprints: hasFlag(argv, 'update-fingerprints'),
    gateRegression: !hasFlag(argv, 'no-regression'),
    gateParity: !hasFlag(argv, 'no-parity'),
    stabilityEpsilon: parseNumber(flag(argv, 'stability-epsilon')),
    regressionTolerance: parseNumber(flag(argv, 'regression-tolerance')),
    parityTolerance: parseNumber(flag(argv, 'parity-tolerance')),
    sequential: hasFlag(argv, 'sequential'),
    workerCount: Math.max(1, parseNonNegativeInteger(flag(argv, 'parallel'), 6)),
    fingerprintSkip: manifest?.validation?.fingerprintSkip ?? (manifest === null ? preset.fingerprintSkip : []),
    paritySkip: manifest?.validation?.paritySkip ?? (manifest === null ? preset.paritySkip : {}),
    parityGroups: manifest?.validation?.parityGroups ?? (manifest === null ? preset.parityGroups : undefined),
  };
}

function benchmarkOptions(
  argv: readonly string[],
  manifest: CaptureManifest | null,
): Omit<CaptureBenchmarkOptions, 'entries' | 'root' | 'server' | 'subject'> {
  const configured = manifest?.benchmark;
  return {
    filter: flag(argv, 'filter'),
    rendererFilter: (flag(argv, 'renderer') ?? '').split(',').filter(Boolean),
    warmupIterations: parseNonNegativeInteger(flag(argv, 'warmup'), configured?.warmupIterations ?? 3),
    iterations: Math.max(1, parseNonNegativeInteger(flag(argv, 'iterations'), configured?.iterations ?? 10)),
    samples: Math.max(3, parseNonNegativeInteger(flag(argv, 'samples'), configured?.samples ?? 7)),
    sampleDurationMs: parseNumber(flag(argv, 'sample-duration')) ?? configured?.sampleDurationMs,
    maxRetries: parseNonNegativeInteger(flag(argv, 'retries'), configured?.maxRetries ?? 1),
    reference: flag(argv, 'benchmark-reference') ?? configured?.reference,
    regressionTolerance: parseNumber(flag(argv, 'performance-tolerance')) ?? configured?.regressionTolerance,
    stabilityTolerance: parseNumber(flag(argv, 'stability-tolerance')) ?? configured?.stabilityTolerance,
    updateBaselines: hasFlag(argv, 'update-benchmarks'),
  };
}

async function batch(argv: readonly string[]): Promise<number> {
  const root = resolve(flag(argv, 'root') ?? process.cwd());
  const configPath = resolve(root, flag(argv, 'config') ?? 'tool-capture.batch.json');
  const manifest = readCaptureBatchManifest(configPath);
  const only = flag(argv, 'only');
  const globalArgs = removeBatchOptions(argv);
  const subjects = manifest.subjects
    .filter((subject) => only === undefined || subject.name === only)
    .map((subject) => ({
      name: subject.name,
      async resolve(): Promise<CaptureWorkflowOptions> {
        // Put global CLI arguments first: flag() deliberately takes the first occurrence, making
        // command-line values batch-wide overrides of subject defaults.
        const subjectArgv = [...globalArgs, ...subject.args];
        const suite = await resolveCaptureCliSuite(subjectArgv);
        const operations = new Set(subject.operations ?? ['capture', 'validate']);
        return {
          subject: suite.subject,
          entries: suite.entries,
          server: suite.server,
          root: suite.root,
          capture: operations.has('capture') ? captureOptions(subjectArgv) : false,
          validation: operations.has('validate')
            ? validationOptions(subjectArgv, suite.subject, suite.manifest)
            : false,
          benchmark: operations.has('benchmark') ? benchmarkOptions(subjectArgv, suite.manifest) : false,
        };
      },
    }));
  if (subjects.length === 0) throw new Error(`No batch subject matched --only=${only ?? ''}`);
  const result = await runCaptureBatch({
    subjects,
    subjectWorkerCount: Math.max(1, parseNonNegativeInteger(flag(argv, 'subjects-parallel'), 1)),
    reportPath: resolve(root, '.artifacts', 'capture-batch-report.json'),
  });
  if (result.aborted) return 130;
  return result.shouldFail ? 1 : 0;
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'observe') {
    const url = argv[0];
    if (url === undefined || url.startsWith('--')) throw new Error(`observe requires a <url>\n${USAGE}`);
    const outDir = resolve(flag(argv, 'out') ?? './capture');
    const diagnostics = await captureUrl(url, {
      outDir,
      wait: parseNonNegativeInteger(flag(argv, 'wait'), 0),
      captureFrames: parseNonNegativeInteger(flag(argv, 'frames'), 1) || 1,
      maxRetries: parseNonNegativeInteger(flag(argv, 'retries'), 2),
    });
    console.log(`captured → ${resolve(outDir, 'screenshot.png')}`);
    console.log(`observe   ${JSON.stringify(diagnostics)}`);
    process.exit(diagnostics.blank || !diagnostics.usable ? 1 : 0);
  }
  if (command === 'capture') process.exit(await capture(argv));
  if (command === 'validate') process.exit(await validate(argv));
  if (command === 'benchmark') process.exit(await benchmark(argv));
  if (command === 'batch') process.exit(await batch(argv));
  console.error(USAGE);
  process.exit(2);
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function removeBatchOptions(argv: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    const key = ['config', 'only', 'subjects-parallel'].find(
      (candidate) => argument === `--${candidate}` || argument.startsWith(`--${candidate}=`),
    );
    if (key === undefined) result.push(argument);
    else if (argument === `--${key}`) index++;
  }
  return result;
}

main().catch((err: unknown) => {
  if (isBrowserClosedError(err)) process.exit(130);
  console.error(err);
  process.exit(1);
});
