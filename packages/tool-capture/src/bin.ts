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
import { CAPTURE_CLI_COMMANDS, resolveCaptureCliReportPath, validateCaptureCliOptions } from './captureCliOptions.js';
import type { CaptureCliCommand } from './captureCliOptions.js';
import { discoverEntries } from './captureEntries.js';
import type { Entry } from './captureEntries.js';
import { captureUrl } from './captureEntry.js';
import { getFlightCaptureValidationPreset } from './captureFlightPreset.js';
import { isBrowserClosedError } from './captureInterrupt.js';
import type { CaptureManifest } from './captureManifest.js';
import { readCaptureManifest } from './captureManifest.js';
import { resolveCaptureDirectoryServer, resolveServer, resolveStaticServer } from './captureServer.js';
import { runCaptureSuite } from './captureSuite.js';
import { resolveCaptureTimeoutMs, setCaptureTimeoutMs } from './captureTimeout.js';
import { runCaptureValidation } from './captureValidation.js';
import { resolveCaptureWorkerCount } from './captureWorkerCount.js';
import type {
  CaptureWorkflowCaptureOptions,
  CaptureWorkflowOptions,
  CaptureWorkflowValidationOptions,
} from './captureWorkflow.js';
import { runCaptureBatch, runCaptureWorkflow } from './captureWorkflow.js';

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
  --filter <substring> --filter-exact <name> --renderer <ids> --out <dir> --wait <ms> --frames <n>
  --parallel <n> --sequential --dev --build --update-baseline --fail-on-changed
  --fail-on-error --verify --no-verify --observe --retries <n> --capture-timeout <ms>

Every command writes a versioned aggregate JSON report beneath its artifact directory.

validation options:
  --report --update-fingerprints --update-coverage --no-regression --no-parity
  --stability-epsilon <n> --regression-tolerance <n> --parity-tolerance <n>

FLIGHT_CAPTURE_WORKER_COUNT pins worker concurrency when --parallel is omitted.
FLIGHT_CAPTURE_TIMEOUT_MS pins the per-wait budget (page load, frame poll, verification) when
  --capture-timeout is omitted; default 45000. Evidence is one contended SwiftShader host: 15000
  timed out in two full-suite runs and 45000 cleared the same suite. The intermediate cliff and other
  hosts are unmeasured; override this budget when host evidence requires it.
The measured direct-timeout tail is four cells: env-ibl/webgpu (both 15000ms runs),
  env-skybox/webgpu and material-blend-modes/webgl (first run), effect-chain/webgpu (second run).
  Three same-scene siblings were healthy and merely withheld; do not count them as timeouts.

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
  const validation = validationOptions(argv, subject, manifest, root);
  if (validation.updateFingerprints) {
    const result = await runCaptureWorkflow({
      subject,
      entries,
      server,
      root,
      capture: captureOptions(argv),
      validation,
      benchmark: false,
      reportPath: resolveCaptureCliReportPath(root, flag(argv, 'out'), subject, 'workflow-report.json'),
    });
    if (result.aborted) return 130;
    return result.shouldFail ? 1 : 0;
  }
  const result = await runCaptureValidation({ ...validation, subject, entries, server, root });
  if (result.aborted) return 130;
  return result.shouldFail ? 1 : 0;
}

async function benchmark(argv: readonly string[]): Promise<number> {
  const { subject, entries, server, root, manifest } = await resolveCaptureCliSuite(argv);
  const result = await runCaptureBenchmark({
    ...benchmarkOptions(argv, manifest, root, subject),
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
    filterExact: flag(argv, 'filter-exact'),
    rendererFilter: (flag(argv, 'renderer') ?? '').split(',').filter(Boolean),
    extraWait: parseNonNegativeInteger(flag(argv, 'wait'), 0),
    captureFrames: parseNonNegativeInteger(frames?.split(',')[0], 0),
    workerCount: captureWorkerCount(argv),
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
  root: string,
): CaptureWorkflowValidationOptions {
  const preset = getFlightCaptureValidationPreset(subject);
  const updateCoverage = hasFlag(argv, 'update-coverage');
  const filter = flag(argv, 'filter');
  const filterExact = flag(argv, 'filter-exact');
  const rendererFilter = (flag(argv, 'renderer') ?? '').split(',').filter(Boolean);
  // ★ The same guard scripts/reachability.ts puts on its baseline: an entry-filtered run has seen only
  // part of the subject, so accepting its coverage as the pin would silently retire every entry outside
  // the filter — the erosion this manifest exists to catch, performed by the tool itself.
  // `--renderer` needs no such refusal: the regression tier is renderer-scoped by definition, and a
  // renderer-scoped update carries the pins it did not run forward instead of dropping them.
  if (updateCoverage && (filter !== undefined || filterExact !== undefined)) {
    throw new Error('Capture baseline coverage manifest updates must be whole-subject — drop --filter');
  }
  return {
    filter,
    filterExact,
    rendererFilter,
    captureFrames: Math.max(1, parseNonNegativeInteger(flag(argv, 'frames'), 1)),
    report: hasFlag(argv, 'report'),
    updateFingerprints: hasFlag(argv, 'update-fingerprints'),
    updateCoverage,
    gateRegression: !hasFlag(argv, 'no-regression'),
    gateParity: !hasFlag(argv, 'no-parity'),
    stabilityEpsilon: parseNumber(flag(argv, 'stability-epsilon')),
    regressionTolerance: parseNumber(flag(argv, 'regression-tolerance')),
    parityTolerance: parseNumber(flag(argv, 'parity-tolerance')),
    sequential: hasFlag(argv, 'sequential'),
    workerCount: captureWorkerCount(argv),
    fingerprintSkip: manifest?.validation?.fingerprintSkip ?? (manifest === null ? preset.fingerprintSkip : []),
    paritySkip: manifest?.validation?.paritySkip ?? (manifest === null ? preset.paritySkip : {}),
    parityGroups: manifest?.validation?.parityGroups ?? (manifest === null ? preset.parityGroups : undefined),
    reportPath: resolveCaptureCliReportPath(root, flag(argv, 'out'), subject, 'validation-report.json'),
  };
}

function benchmarkOptions(
  argv: readonly string[],
  manifest: CaptureManifest | null,
  root: string,
  subject: string,
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
    reportPath: resolveCaptureCliReportPath(root, flag(argv, 'out'), subject, 'benchmark-report.json'),
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
        const validation = operations.has('validate')
          ? validationOptions(subjectArgv, suite.subject, suite.manifest, suite.root)
          : false;
        return {
          subject: suite.subject,
          entries: suite.entries,
          server: suite.server,
          root: suite.root,
          // A fingerprint update is a capture operation even when a batch manifest used to call it
          // validation-only: the verified capture is the only producer of the matching five-field
          // provenance record. Read-only validation remains legitimately detached.
          capture:
            operations.has('capture') || (validation !== false && validation.updateFingerprints)
              ? captureOptions(subjectArgv)
              : false,
          validation,
          benchmark: operations.has('benchmark')
            ? benchmarkOptions(subjectArgv, suite.manifest, suite.root, suite.subject)
            : false,
          reportPath: resolveCaptureCliReportPath(
            suite.root,
            flag(subjectArgv, 'out'),
            suite.subject,
            'workflow-report.json',
          ),
        };
      },
    }));
  if (subjects.length === 0) throw new Error(`No batch subject matched --only=${only ?? ''}`);
  const result = await runCaptureBatch({
    subjects,
    subjectWorkerCount: Math.max(1, parseNonNegativeInteger(flag(argv, 'subjects-parallel'), 1)),
    reportPath: resolve(root, flag(argv, 'out') ?? '.artifacts', 'capture-batch-report.json'),
  });
  if (result.aborted) return 130;
  return result.shouldFail ? 1 : 0;
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  if (command === undefined || !CAPTURE_CLI_COMMANDS.includes(command as CaptureCliCommand)) {
    console.error(USAGE);
    process.exit(2);
  }
  const captureCommand = command as CaptureCliCommand;
  validateCaptureCliOptions(captureCommand, argv);
  // Pinned once for the process rather than threaded through every option bag: the budget governs
  // waits in the capture core, the validation loader and the stall reason alike, and those are reached
  // from three different call shapes. One resolution point is also what keeps `--capture-timeout` and
  // FLIGHT_CAPTURE_TIMEOUT_MS from being able to mean different things in different waits.
  setCaptureTimeoutMs(resolveCaptureTimeoutMs(flag(argv, 'capture-timeout'), process.env['FLIGHT_CAPTURE_TIMEOUT_MS']));
  if (command === 'observe') process.exit(await observe(argv));
  if (command === 'capture') process.exit(await capture(argv));
  if (command === 'validate') process.exit(await validate(argv));
  if (command === 'benchmark') process.exit(await benchmark(argv));
  if (command === 'batch') process.exit(await batch(argv));
}

async function observe(argv: readonly string[]): Promise<number> {
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
  return diagnostics.blank || !diagnostics.usable ? 1 : 0;
}

function captureWorkerCount(argv: readonly string[]): number {
  // The resolver's four-worker EXPEDIENT keeps today's capture legs usable under both CPU starvation
  // and workspace-mount descriptor bursts; available parallelism, not four itself, is the sizing rule.
  return resolveCaptureWorkerCount(flag(argv, 'parallel'), process.env['FLIGHT_CAPTURE_WORKER_COUNT']);
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
