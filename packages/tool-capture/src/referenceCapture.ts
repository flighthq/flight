// The reference-subject capture driver: start flight-reference's Vite dev server (pointed at a Flight
// checkout via FLIGHT_REPO), enumerate its framework/corpus/case routes, and drive
// the shared captureEntry path with verify:true. This lives in tool-capture — beside the in-page
// verifier (functionalVerify) and the capture core (captureEntry) — so BOTH ends of the reference
// capture are contained in one package; scripts/reference-capture.ts is a thin CLI over runReferenceCapture.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { launchBrowser } from './captureBrowser.js';
import type { Entry } from './captureEntries.js';
import { routeSegment } from './captureEntries.js';
import { captureParallel } from './captureEntry.js';
import { formatSummaryCount, formatSummaryLine } from './captureFormat.js';
import { installAbortHandler } from './captureInterrupt.js';

export interface ReferenceCaptureOptions {
  /** The flight-reference checkout root (contains content/frameworks/…). */
  checkoutDir: string;
  /** The Flight monorepo root, passed to the dev server as FLIGHT_REPO so @flighthq/* resolve to source. */
  repoRoot: string;
  /** Only capture cases whose `framework/corpus/case` id contains this substring. */
  filter?: string;
  captureFrames?: number;
  extraWait?: number;
  updateBaseline?: boolean;
  failOnError?: boolean;
  /** Eyes mode: never fail closed on a blank render — emit a screenshot + diagnostics per case. */
  observe?: boolean;
  /** Output base; artifacts land at {outBase}/reference/{framework/corpus/case}/{renderer}/. */
  outBase: string;
  workerCount?: number;
}

export interface ReferenceCaptureResult {
  captured: number;
  changed: number;
  failed: number;
  aborted: boolean;
}

// One capture Entry per flight-reference case: name = framework/corpus/case, and a `route` producing the
// harness's `${framework}-tests/${corpus}/${case}/flight/${renderer}/` URL. Only cases with a Flight
// implementation (flight/src/app.ts) are captured; every framework (openfl/starling/awayjs) is included.
export function discoverReferenceEntries(checkoutDir: string): Entry[] {
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
        const routePrefix = `${framework.name}-tests`;
        entries.push({
          name: `${framework.name}/${corpus.name}/${c.name}`,
          renderers: ['webgl'],
          route: (renderer) => `${routePrefix}/${corpus.name}/${c.name}/flight/${routeSegment(renderer)}/`,
        });
      }
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// The full reference-capture session: enumerate, start the dev server, drive captureEntry (verify:true) in
// parallel, then tear the server + browser down. Prints the same summary line as the monorepo capture.
export async function runReferenceCapture(options: Readonly<ReferenceCaptureOptions>): Promise<ReferenceCaptureResult> {
  let entries = discoverReferenceEntries(options.checkoutDir);
  if (options.filter) entries = entries.filter((e) => e.name.includes(options.filter!));
  if (entries.length === 0) throw new Error(`No reference cases found  filter="${options.filter ?? ''}"`);

  console.log('Starting flight-reference Vite dev server…');
  const server = await startReferenceDevServer(options.checkoutDir, options.repoRoot);
  console.log(`Ready at ${server.url}\n`);

  const { browser, context } = await launchBrowser({
    captureFrames: options.captureFrames ?? 1,
    verify: true,
    observe: options.observe,
  });
  const isAborted = installAbortHandler();

  let captured = 0;
  let changed = 0;
  let failed = 0;
  try {
    const result = await captureParallel({
      context,
      entries,
      rendererFilter: [],
      baseUrl: server.url,
      tool: 'reference',
      outBase: resolve(options.outBase),
      root: options.checkoutDir,
      updateBaseline: options.updateBaseline,
      extraWait: options.extraWait,
      captureFrames: options.captureFrames,
      failOnError: options.failOnError,
      observe: options.observe,
      verify: true,
      isAborted,
      workerCount: options.workerCount ?? 4,
    });
    captured = result.captured;
    changed = result.changed;
    failed = result.failed;
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  console.log(
    '\n' +
      formatSummaryLine(failed > 0, [
        formatSummaryCount(captured, 'captured', 'pass'),
        formatSummaryCount(changed, 'changed', 'warn'),
        formatSummaryCount(failed, 'failed', 'fail'),
      ]),
  );
  console.log(`Output:   ${resolve(options.outBase)}/reference/`);
  return { captured, changed, failed, aborted: isAborted() };
}

// Spawns flight-reference's Vite dev server in the checkout, resolving once it logs its Local URL.
// FLIGHT_REPO points its @flighthq/* aliases at the Flight source. FLIGHT_SDK_WATCH keeps the SDK barrel
// on the same raw-source module graph as direct package imports. Pre-bundling only @flighthq/sdk creates
// a second copy of stateful renderer registries: a reference app can register a material through the SDK
// copy, then draw through a direct @flighthq/scene-gl import whose registry remains empty. That split made
// the OpenFL Stage3D Flight versions render correctly in host dev mode but capture as blank canvases.
export function startReferenceDevServer(
  checkoutDir: string,
  repoRoot: string,
): Promise<{ url: string; kill: () => void }> {
  return new Promise((resolveUrl, reject) => {
    const child = spawn('npx', ['vite', '--host', '0.0.0.0'], {
      cwd: checkoutDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FLIGHT_REPO: repoRoot, FLIGHT_SDK_WATCH: '1' },
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
