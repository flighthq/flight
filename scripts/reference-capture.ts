// Captures the flight-reference cases through THIS monorepo's tool-capture machinery, instead of
// flight-reference's own capture script — so the hardened capture path (present-frame sync, the
// __ftRenderImage surface readback that avoids Docker's black WebGL screenshots, baseline compare)
// lives here and improves for every subject at once. It starts flight-reference's Vite dev server
// (pointed at this repo via FLIGHT_REPO + FLIGHT_SDK_SOURCE so the samples render against local
// source), enumerates its framework/corpus/case routes, and drives captureEntry with `verify: true`.
//
// verify: true makes each WebGL capture wait for the in-page render verifier and read the fingerprinted
// surface back as a PNG (window.__ftRenderImage) rather than screenshotting the canvas — the reference
// apps opt in by registering a functional target from their shared 3D context (see the scene3d writeup).
// Until a case registers one, its verification wait simply times out and it falls back to the canvas
// screenshot (fine for 2D, black for 3D in Docker) — so the readback lights up per case as they adopt it.
//
// Invoked by reference-tool.ts's `capture` mode with FLIGHT_REFERENCE_CHECKOUT set to the checkout dir.
// Usage (forwarded): [--filter <substr>] [--frames N] [--wait ms] [--update-baseline] [--fail-on-error]

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureParallel,
  type Entry,
  installAbortHandler,
  isBrowserClosedError,
  launchBrowser,
  routeSegment,
} from '@flighthq/tool-capture';
import pc from 'picocolors';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkoutDir = process.env.FLIGHT_REFERENCE_CHECKOUT ?? join(repoRoot, '.cache', 'flight-reference');

const argv = process.argv.slice(2);
function arg(key: string, fallback: string): string {
  const i = argv.indexOf(`--${key}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const filter = arg('filter', '');
const captureFrames = Math.max(0, parseInt(arg('frames', '1'), 10) || 0);
const extraWait = Math.max(0, parseInt(arg('wait', '0'), 10) || 0);
const updateBaseline = argv.includes('--update-baseline');
const failOnError = argv.includes('--fail-on-error');
const outBase = resolve(repoRoot, '.artifacts');

// One capture Entry per flight-reference case: name = framework/corpus/case, and a `route` producing the
// harness's `${framework}-tests/${corpus}/${case}/flight/${renderer}/` URL. Only cases with a Flight
// implementation (flight/src/app.ts) are captured; every framework (openfl/starling/awayjs) is included.
function discoverReferenceEntries(): Entry[] {
  const frameworksDir = join(checkoutDir, 'content', 'frameworks');
  const entries: Entry[] = [];
  if (!existsSync(frameworksDir)) return entries;
  for (const framework of readdirSync(frameworksDir, { withFileTypes: true })) {
    if (!framework.isDirectory()) continue;
    const frameworkDir = join(frameworksDir, framework.name);
    for (const corpus of readdirSync(frameworkDir, { withFileTypes: true })) {
      if (!corpus.isDirectory()) continue;
      const corpusDir = join(frameworkDir, corpus.name);
      for (const c of readdirSync(corpusDir, { withFileTypes: true })) {
        if (!c.isDirectory() || c.name === '_shared') continue;
        if (!existsSync(join(corpusDir, c.name, 'flight', 'src', 'app.ts'))) continue;
        const name = `${framework.name}/${corpus.name}/${c.name}`;
        const routePrefix = `${framework.name}-tests`;
        entries.push({
          name,
          renderers: ['webgl'],
          route: (renderer) => `${routePrefix}/${corpus.name}/${c.name}/flight/${routeSegment(renderer)}/`,
        });
      }
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function startDevServer(): Promise<{ url: string; kill: () => void }> {
  return new Promise((resolveUrl, reject) => {
    const child = spawn('npx', ['vite', '--host', '0.0.0.0'], {
      cwd: checkoutDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FLIGHT_REPO: repoRoot, FLIGHT_SDK_SOURCE: '1' },
    });
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('flight-reference Vite dev server did not start within 60s'));
      }
    }, 60_000);
    const ansi = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
    const onData = (data: Buffer) => {
      const match = /Local:\s+(https?:\/\/\S+)/.exec(data.toString().replace(ansi, ''));
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolveUrl({ url: match[1]!.replace(/\/$/, ''), kill: () => child.kill('SIGTERM') });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

async function main(): Promise<void> {
  let entries = discoverReferenceEntries();
  if (filter) entries = entries.filter((e) => e.name.includes(filter));
  if (entries.length === 0) {
    console.error(`No reference cases found  filter="${filter}"`);
    process.exit(1);
  }

  console.log('Starting flight-reference Vite dev server…');
  const server = await startDevServer();
  console.log(`Ready at ${server.url}\n`);

  const { browser, context } = await launchBrowser({ captureFrames, verify: true });
  const isAborted = installAbortHandler();

  let result;
  try {
    result = await captureParallel({
      context,
      entries,
      rendererFilter: [],
      baseUrl: server.url,
      tool: 'reference',
      outBase,
      root: checkoutDir,
      updateBaseline,
      extraWait,
      captureFrames,
      failOnError,
      verify: true,
      isAborted,
      workerCount: 4,
    });
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  const failed = result.failed > 0;
  console.log(
    '\n' +
      (failed ? pc.red('✗ FAILED') : pc.green('✓ ok')) +
      `   ${result.captured} captured   ${result.changed} changed   ${result.failed} failed`,
  );
  console.log(`Output:   ${outBase}/reference/`);
  if (failed) process.exit(1);
  if (isAborted()) process.exit(130);
}

main().catch((err: unknown) => {
  if (isBrowserClosedError(err)) process.exit(130);
  console.error(err);
  process.exit(1);
});
