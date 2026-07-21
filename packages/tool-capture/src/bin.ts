#!/usr/bin/env node
// Turn-key capture CLI:
// - observe <url>: one arbitrary page, zero integration, always emit eyes + diagnostics.
// - capture: a full entry × renderer report from a JSON manifest or Flight's built-in suites.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { discoverEntries } from './captureEntries.js';
import type { Entry } from './captureEntries.js';
import { captureUrl } from './captureEntry.js';
import { isBrowserClosedError } from './captureInterrupt.js';
import type { CaptureManifest } from './captureManifest.js';
import { readCaptureManifest } from './captureManifest.js';
import { resolveCaptureDirectoryServer, resolveServer, resolveStaticServer } from './captureServer.js';
import { runCaptureSuite } from './captureSuite.js';
import { runCaptureValidation } from './captureValidation.js';

const USAGE = `usage:
  tool-capture observe <url> [--out <dir>] [--wait <ms>] [--frames <n>]
  tool-capture capture [--manifest <file>] (--url <url> | --dir <built-dir>) [options]
  tool-capture capture --tool <examples|functional> [options]
  tool-capture validate [--manifest <file>] (--url <url> | --dir <built-dir>) [options]
  tool-capture validate --tool <examples|functional> [options]

capture options:
  --filter <name> --renderer <ids> --out <dir> --wait <ms> --frames <n>
  --parallel <n> --sequential --dev --build --update-baseline --fail-on-changed
  --fail-on-error --verify --no-verify --observe

validation options:
  --report --update-fingerprints --no-regression --no-parity
  --stability-epsilon <n> --regression-tolerance <n> --parity-tolerance <n>

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
    if (!existsSync(conventionalManifest)) throw new Error(`capture/validate requires --manifest or --tool\n${USAGE}`);
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
    throw new Error(`capture/validate requires --url or --dir for manifest suites\n${USAGE}`);
  }
  return { entries, manifest, root, server, subject };
}

async function capture(argv: readonly string[]): Promise<number> {
  const { subject, entries, server, root } = await resolveCaptureCliSuite(argv);

  const frames = flag(argv, 'frames');
  const parallel = flag(argv, 'parallel');
  const result = await runCaptureSuite({
    subject,
    entries,
    server,
    root,
    outBase: flag(argv, 'out') ?? '.artifacts',
    filter: flag(argv, 'filter'),
    rendererFilter: (flag(argv, 'renderer') ?? '').split(',').filter(Boolean),
    extraWait: parseNonNegativeInteger(flag(argv, 'wait'), 0),
    captureFrames: parseNonNegativeInteger(frames?.split(',')[0], 0),
    workerCount: Math.max(1, parseNonNegativeInteger(parallel, 6)),
    sequential: hasFlag(argv, 'sequential'),
    updateBaseline: hasFlag(argv, 'update-baseline'),
    failOnChanged: hasFlag(argv, 'fail-on-changed'),
    failOnError: hasFlag(argv, 'fail-on-error'),
    observe: hasFlag(argv, 'observe'),
    verify: hasFlag(argv, 'verify') ? true : hasFlag(argv, 'no-verify') ? false : undefined,
  });
  if (result.aborted) return 130;
  return result.shouldFail ? 1 : 0;
}

async function validate(argv: readonly string[]): Promise<number> {
  const { subject, entries, server, root, manifest } = await resolveCaptureCliSuite(argv);
  const result = await runCaptureValidation({
    subject,
    entries,
    server,
    root,
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
    fingerprintSkip:
      manifest?.validation?.fingerprintSkip ?? (manifest === null && subject === 'examples' ? ['playingsound'] : []),
    paritySkip: manifest?.validation?.paritySkip ?? (manifest === null ? FLIGHT_PARITY_SKIP : {}),
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
    });
    console.log(`captured → ${resolve(outDir, 'screenshot.png')}`);
    console.log(`observe   ${JSON.stringify(diagnostics)}`);
    process.exit(0);
  }
  if (command === 'capture') process.exit(await capture(argv));
  if (command === 'validate') process.exit(await validate(argv));
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

const FLIGHT_PARITY_SKIP: Readonly<Record<string, 'all' | string[]>> = {
  playingvideo: 'all',
  'effect-hue-saturation': ['canvas'],
  'effect-lens-distortion': ['canvas'],
  'effect-lens-flare': ['canvas'],
  'effect-posterize': ['canvas'],
  'effect-vignette': ['canvas'],
  'effect-displacement': 'all',
  'effect-god-rays': 'all',
  'effect-screen-space-fog': 'all',
};

main().catch((err: unknown) => {
  if (isBrowserClosedError(err)) process.exit(130);
  console.error(err);
  process.exit(1);
});
