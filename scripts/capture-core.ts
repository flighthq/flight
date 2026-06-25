// Shared types, discovery, server lifecycle, and capture logic used by
// capture.ts (one-shot) and watch-capture.ts (persistent watch).

import type { BrowserContext } from '@playwright/test';
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { extname, join, relative, resolve } from 'path';
import pc from 'picocolors';

import { getBaselineField, setBaselineField } from './baseline-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;
export type Tool = 'examples' | 'functional' | 'reference' | 'site';

// The root npm script that starts each tool's dev server, used in the manual-start tip.
const DEV_SCRIPT: Record<Tool, string> = {
  examples: 'dev:examples',
  functional: 'dev:functional',
  reference: 'dev:reference',
  site: 'dev:landing',
};

// A column id may carry a `<library>:<renderer>` colon (the reference tool); map it to a URL/dir-safe
// segment. Colon-free ids (canvas, webgl, …) pass through unchanged.
export function routeSegment(renderer: string): string {
  return renderer.replace(':', '-');
}

// A backend the environment cannot provide or sustain: WebGPU with no adapter/device, or a software
// adapter that loses its device mid-run under sustained per-frame GPU load. These are the only
// null-fingerprint / page-error outcomes that may be skipped rather than failed — the gate verifies
// backends where they exist and stays green on machines without them. A real render bug still fails:
// a validation error (bad writeBuffer/copy) is logged before the device dies, and is matched first.
// Shared with compare-render.ts so the smoke gate and the parity/regression gate agree on what counts
// as "unavailable".
export const BACKEND_UNAVAILABLE =
  /WebGPU adapter|WebGPU device|requestAdapter|requestDevice|GPUAdapter|WebGPU is not supported|external Instance reference no longer exists|device (was )?lost|device is lost/i;

// Output formatting shared by the capture.ts / compare-render.ts CLIs so their progress and summary
// lines stay aligned.

export type DetailTone = 'pass' | 'fail' | 'skip' | 'muted';

const TONE_GLYPH: Record<DetailTone, string> = { pass: '✓', fail: '✗', skip: '⊘', muted: '·' };
const TONE_PAINT: Record<DetailTone, (s: string) => string> = {
  pass: pc.green,
  fail: pc.red,
  skip: pc.yellow,
  muted: pc.dim,
};

// An indented detail line under an entry's [N/M] header: a status glyph, the renderer/check label
// padded to a shared column width, then an optional message. Low-level layout — the caller has already
// colored `glyph` and `message`; `paint` colors the padded label (padding happens before color so the
// invisible ANSI codes do not throw off the column width). Most callers want formatStatusLine instead.
export function formatDetailLine(
  glyph: string,
  label: string,
  labelWidth: number,
  message: string,
  paint: (s: string) => string = (s) => s,
): string {
  // Pad only when a message follows; an unpadded label avoids a trailing space (and trimEnd cannot
  // strip it once color codes wrap the padding).
  const paintedLabel = paint(message ? label.padEnd(labelWidth) : label);
  return message ? `  ${glyph} ${paintedLabel}  ${message}` : `  ${glyph} ${paintedLabel}`;
}

// The common detail line: the glyph AND the renderer/check label carry the verdict color, so the eye
// lands on *what* passed or failed rather than on a tiny glyph in a field of white. A routine
// confirmation (pass / muted) dims its message so it recedes; a fail/skip keeps the tone color on the
// message because the reason is the point.
export function formatStatusLine(tone: DetailTone, label: string, labelWidth: number, message: string): string {
  const paint = TONE_PAINT[tone];
  const body = message ? (tone === 'pass' || tone === 'muted' ? pc.dim(message) : paint(message)) : '';
  return formatDetailLine(paint(TONE_GLYPH[tone]), label, labelWidth, body, paint);
}

// Color a "<value> <label>" summary count: dim at zero (a zero is never alarming, whatever its tone),
// else green (pass) / red (fail) / yellow (warn).
export function formatSummaryCount(value: number, label: string, tone: 'pass' | 'fail' | 'warn'): string {
  const text = `${value} ${label}`;
  if (value === 0) return pc.dim(text);
  if (tone === 'fail') return pc.red(text);
  if (tone === 'warn') return pc.yellow(text);
  return pc.green(text);
}

// A run's final summary: a ✓/✗ verdict followed by count segments. `failed` drives the verdict, so a
// run that exits non-zero always leads with ✗ even if its failing count sits later in the line.
export function formatSummaryLine(failed: boolean, counts: readonly string[]): string {
  const verdict = failed ? pc.red('✗ FAILED') : pc.green('✓ ok');
  return `${verdict}   ${counts.join('   ')}`;
}

// Graceful interrupt. Playwright installs its own SIGINT/SIGTERM handlers that close the browser, after
// which any in-flight page operation rejects with "Target page, context or browser has been closed". A
// long render run is routinely Ctrl+C'd, so rather than let that reject crash with a raw stack trace —
// and rather than let the loop keep going and report the torn-down page as a spurious failure — callers
// poll this flag: break the entry/renderer loop once it is set, then print a partial summary and exit.
// Returns a getter so the flag stays private. Idempotent across calls.
let runAborted = false;
export function installAbortHandler(): () => boolean {
  if (!abortHandlerInstalled) {
    abortHandlerInstalled = true;
    const onSignal = (): void => {
      runAborted = true;
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  }
  return () => runAborted;
}

// True for the "browser/context/page was closed" rejection Playwright raises once it has torn the
// browser down on signal — expected during a graceful interrupt, not a real test failure.
export function isBrowserClosedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Target (page|closed)|has been closed|Browser has been closed|Target crashed/i.test(message);
}

let abortHandlerInstalled = false;

export interface Entry {
  name: string;
  renderers: string[];
}

export interface CaptureStatus {
  state: 'ready' | 'error';
  capturedAt: number;
  error: string | null;
  hash: string | null;
  /** The committed baseline sha256, or null when no baseline exists yet. */
  baselineHash: string | null;
  /** null = no baseline exists yet; false = hash matches baseline; true = hash differs from baseline */
  changed: boolean | null;
}

export interface Server {
  url: string;
  kill(): void;
}

export interface CaptureEntryOptions {
  context: BrowserContext;
  entry: Entry;
  renderers: string[];
  baseUrl: string;
  tool: Tool;
  outBase: string;
  /** Repo root — committed baselines live at tests/<tool>/baselines/<name>.json. */
  root: string;
  /** When true, writes the current screenshot hash as the new baseline instead of comparing. */
  updateBaseline?: boolean;
  extraWait?: number;
  /**
   * When set (≥1), run the page's animation loop exactly this many frames, halt it on that frame,
   * and screenshot it — a deterministic "capture the Nth frame" mode. Omit for the default behavior
   * (render two frames and shoot, letting self-freezing pages like the landing hold their frame).
   * Must match the value passed to launchBrowser, which installs the frame-halt in the page.
   */
  captureFrames?: number;
  /**
   * When true, an entry whose page logged an error or page error (a thrown exception, a failed
   * request, or a render-verification failure from the functional harness) counts as a failure. This
   * is the render smoke/not-blank gate: "CI green" then means every entry loaded and drew without
   * error on every backend.
   */
  failOnError?: boolean;
  /**
   * Polled before each renderer: when it returns true the run is being interrupted (Ctrl+C), so the
   * renderer loop stops and a torn-down page is not reported as a failure. See installAbortHandler.
   */
  isAborted?: () => boolean;
  /**
   * When set, replaces the renderer name in status lines. Used by captureParallel so each line
   * identifies its entry: `entry.name/renderer` rather than just `renderer`.
   */
  displayLabel?: string;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

// Columns of a reference test, mirroring tools/reference/vite.config's discovery: each library subdir
// contributes `<lib>:<r>` from app.<r>.ts (explicit), render.<r>.ts (custom), or a bare app.ts (default
// backends); reference libraries lead, `flight` last.
function referenceColumns(testDir: string): string[] {
  const libs = readdirSync(testDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const ordered = [...libs.filter((l) => l !== 'flight').sort(), ...(libs.includes('flight') ? ['flight'] : [])];
  const columns: string[] = [];
  for (const lib of ordered) {
    const srcDir = join(testDir, lib, 'src');
    if (!existsSync(srcDir)) continue;
    const files = readdirSync(srcDir);
    const appR = files
      .map((f) => /^app\.([a-z0-9]+)\.ts$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1]);
    if (appR.length > 0) {
      columns.push(...appR.sort().map((r) => `${lib}:${r}`));
      continue;
    }
    const customR = (RENDERERS as readonly string[]).filter((r) => existsSync(join(srcDir, `render.${r}.ts`)));
    if (customR.length > 0) {
      columns.push(...customR.map((r) => `${lib}:${r}`));
      continue;
    }
    if (existsSync(join(srcDir, 'app.ts'))) {
      const pkgPath = join(testDir, lib, 'package.json');
      const pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>) : {};
      const renderers = (pkg.renderers as string[] | undefined) ?? [...RENDERERS];
      columns.push(...renderers.map((r) => `${lib}:${r}`));
    }
  }
  return columns;
}

export function discoverEntries(tool: Tool, root: string): Entry[] {
  // The landing page is a single document rendered with Flight (one Gl canvas), with no
  // per-name or per-renderer routing, so it presents as one fixed entry.
  if (tool === 'site') return [{ name: 'landing', renderers: ['webgl'] }];

  // Reference comparison tests: each holds library subdirs (openfl/, flight/) and contributes
  // `<library>:<renderer>` columns, the same discovery the reference tool serves.
  if (tool === 'reference') {
    const refDir = join(root, 'tests', 'reference');
    if (!existsSync(refDir)) return [];
    return readdirSync(refDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '_harness')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name }) => ({ name, renderers: referenceColumns(join(refDir, name)) }))
      .filter((e) => e.renderers.length > 0);
  }

  const dir = tool === 'examples' ? join(root, 'examples') : join(root, 'tests', 'functional');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => {
      const testDir = join(dir, name);
      const customRenderers = (RENDERERS as readonly string[]).filter((r) =>
        existsSync(join(testDir, `src/render.${r}.ts`)),
      );
      if (customRenderers.length > 0) return { name, renderers: customRenderers };
      if (tool === 'functional' && existsSync(join(testDir, 'src', 'app.ts'))) {
        const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf8')) as Record<string, unknown>;
        // Matches the vite harness default (tools/functional/vite.config.ts): app.ts tests run on every
        // backend, webgpu included (the harness routes createFunctionalTarget → createWgpuTarget).
        return { name, renderers: (pkg.renderers as string[] | undefined) ?? ['canvas', 'dom', 'webgl', 'webgpu'] };
      }
      return { name, renderers: [] };
    })
    .filter((e) => e.renderers.length > 0);
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export function resolveServer(opts: { tool: Tool; root: string; externalUrl?: string }): Promise<Server> {
  const { tool, root, externalUrl } = opts;

  if (externalUrl) {
    const url = externalUrl.replace(/\/$/, '');
    return Promise.resolve({ url, kill: () => {} });
  }

  const toolDir = join(root, 'tools', tool);
  const viteJs = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const configPath = join(toolDir, 'vite.config.ts');

  // Run predev (asset download) before starting the server, mirroring what
  // npm run dev would do. npm_execpath is set by npm and points to the npm
  // CLI script; fall back to shell npm for direct tsx invocations.
  const toolPkg = JSON.parse(readFileSync(join(toolDir, 'package.json'), 'utf-8')) as {
    scripts?: Record<string, string>;
  };
  if (toolPkg.scripts?.predev) {
    const npmExecPath = process.env['npm_execpath'];
    const result = npmExecPath
      ? spawnSync(process.execPath, [npmExecPath, 'run', 'predev'], { cwd: toolDir, stdio: 'inherit' })
      : spawnSync('npm', ['run', 'predev'], { cwd: toolDir, stdio: 'inherit', shell: true });
    if (result.status !== 0) throw new Error(`predev failed for ${tool}`);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [viteJs, '--config', configPath], {
      cwd: toolDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let done = false;
    let output = '';

    const timeout = setTimeout(() => {
      if (!done) {
        proc.kill();
        reject(
          new Error(
            `Server did not start within 60s.\nCaptured output:\n${output}\n\n` +
              `Tip: start the server manually with "npm run ${DEV_SCRIPT[tool]}" ` +
              `and pass --url=http://localhost:5173`,
          ),
        );
      }
    }, 60_000);

    const scan = (chunk: Buffer): void => {
      output += chunk.toString();
      const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
      const match = clean.match(/localhost:(\d+)/);
      if (match && !done) {
        done = true;
        clearTimeout(timeout);
        resolve({ url: `http://localhost:${match[1]}`, kill: () => proc.kill('SIGTERM') });
      }
    };

    proc.stdout?.on('data', scan);
    proc.stderr?.on('data', scan);
    proc.on('error', reject);
  });
}

// Serve a pre-built tool dist from a lightweight Node.js HTTP server, bypassing the Vite dev
// server and its on-demand transform overhead. Requires `npm run build:{tool}` to have been run
// first; errors with a helpful message if the dist directory is missing.
export function resolveStaticServer(opts: { tool: Tool; root: string }): Promise<Server> {
  const { tool, root } = opts;
  const distDir = join(root, 'tools', tool, 'dist');

  if (!existsSync(distDir)) {
    return Promise.reject(
      new Error(
        `No build found at tools/${tool}/dist.\n` +
          `Run "npm run build:${tool}" first, or omit --static to use the dev server.`,
      ),
    );
  }

  const MIME: Record<string, string> = {
    '.css': 'text/css',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.jsonl': 'text/plain; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.utf8': 'text/plain; charset=utf-8',
    '.wav': 'audio/wav',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let urlPath = (req.url ?? '/').split('?')[0];
      if (urlPath.endsWith('/')) urlPath += 'index.html';

      const fsPath = join(distDir, urlPath);
      if (relative(distDir, fsPath).startsWith('..')) {
        res.writeHead(403);
        res.end();
        return;
      }

      if (!existsSync(fsPath)) {
        res.writeHead(404);
        res.end();
        return;
      }

      res.setHeader('Content-Type', MIME[extname(fsPath)] ?? 'application/octet-stream');
      res.end(readFileSync(fsPath));
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://localhost:${port}`, kill: () => server.close() });
    });
  });
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export async function launchBrowser(options: { captureFrames?: number } = {}) {
  // Headless Chromium exposes navigator.gpu but withholds a Wgpu adapter on a software-only,
  // "untrusted" config unless --enable-unsafe-webgpu is set; with it, Dawn falls back to the
  // SwiftShader Vulkan ICD bundled inside Playwright's Chromium (no host GPU / driver needed).
  // --use-webgpu-adapter=swiftshader pins that software adapter so output is identical on a dev
  // machine with a real GPU and in CI — required for stable cross-backend baselines.
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });

  // Always signal capture mode before any page script runs. A page whose render advances over time
  // holds a fixed, self-seeded frame in this mode (the landing backgrounds do), so its screenshot —
  // and thus its baseline hash — is byte-identical run to run. Pages that ignore the flag animate.
  //
  // Also seed Math.random with a fixed value so a scene built with random positions/colours renders
  // the same on every load and backend — what makes the render fingerprint stable run-to-run (Tier 5)
  // and lets the cross-backend differential (Tier 3) compare like with like. It does not pin the clock,
  // so time-based animation is not frozen here — the --frames halt handles that. (Pages with their own
  // seeded RNG, like the landing, are unaffected.) The generator is mulberry32 — the same algorithm as
  // the SDK's createRandomSource (@flighthq/math), inlined below; see the note there for why it cannot
  // be imported into this pre-module, bare-page init script.
  //
  // Optionally also install a frame-halt (the --frames=N mode): count the page's animation frames,
  // and on the Nth one stop invoking its callback so the scene halts on a fixed frame, then flag it
  // for the screenshot. N=1 is the robust common case (frame 1 always completes before the screenshot,
  // with no settle-timing race).
  const captureFrames = options.captureFrames ?? 0;
  await context.addInitScript((frames: number) => {
    const flags = window as unknown as { __flightCapture?: boolean; __captureFramesReached?: boolean };
    flags.__flightCapture = true;

    // Inline mulberry32 — the exact algorithm of the SDK's createRandomSource (@flighthq/math). It is
    // copied (not imported) on purpose: addInitScript is serialized and injected before any module
    // loads, and the SDK function's *built* source references bundler helpers (e.g. __name) that do
    // not exist in this bare page context, so injecting its source breaks. Keep this in sync with that
    // one function — it is the only duplicate, and it is trivial and frozen.
    let seed = 0x9e3779b9 >>> 0;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    if (frames < 1) return;
    flags.__captureFramesReached = false;

    // Force preserveDrawingBuffer so the halted Gl frame survives in the buffer for the screenshot
    // (the default clears it once composited, which would shoot blank once the loop stops).
    const realGetContext = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      type: string,
      attrs?: Record<string, unknown>,
    ) => RenderingContext | null;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      attrs?: Record<string, unknown>,
    ) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return realGetContext.call(this, type, { ...attrs, preserveDrawingBuffer: true });
      }
      return realGetContext.call(this, type, attrs);
    } as typeof HTMLCanvasElement.prototype.getContext;

    let count = 0;
    const realRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      realRequestAnimationFrame((time) => {
        if (count >= frames) return; // halt: scene stops advancing on frame N
        count++;
        if (count >= frames) flags.__captureFramesReached = true;
        callback(time);
      });
  }, captureFrames);

  return { browser, context };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export async function captureEntry(opts: CaptureEntryOptions): Promise<'ok' | 'changed' | 'error'> {
  const {
    context,
    entry,
    renderers,
    baseUrl,
    tool,
    outBase,
    root,
    updateBaseline = false,
    extraWait = 0,
    captureFrames = 0,
    failOnError = false,
    isAborted = () => false,
  } = opts;
  const { displayLabel } = opts;
  let anyFailed = false;
  let anyChanged = false;

  // Detail lines below the caller's [N/M] header drop the entry name (the header carries it) and
  // column-align on the renderer label, matching compare-render.ts. The renderer name carries the
  // verdict color; routine confirmations dim (see formatStatusLine).
  // displayLabel overrides the renderer name when set (used by captureParallel).
  const labelWidth = displayLabel ? Math.max(6, displayLabel.length) : Math.max(6, ...renderers.map((r) => r.length));
  const label = (renderer: string) => displayLabel ?? renderer;
  const statusLine = (tone: DetailTone, renderer: string, message: string): string =>
    formatStatusLine(tone, label(renderer), labelWidth, message);

  for (const renderer of renderers) {
    // Stop launching pages once an interrupt has begun; the partial result is reported by the caller.
    if (isAborted()) break;
    const urlPath =
      tool === 'examples'
        ? `examples/${entry.name}/${routeSegment(renderer)}/`
        : tool === 'functional' || tool === 'reference'
          ? `tests/${entry.name}/${routeSegment(renderer)}/`
          : ''; // landing: the single page is served at the server root

    const url = `${baseUrl}/${urlPath}`;
    const outDir = join(resolve(outBase), tool, entry.name, routeSegment(renderer));
    mkdirSync(outDir, { recursive: true });

    const tmpScreenshot = join(outDir, 'screenshot.tmp.png');
    const finalScreenshot = join(outDir, 'screenshot.png');
    const tmpLogs = join(outDir, 'logs.tmp.jsonl');
    const finalLogs = join(outDir, 'logs.jsonl');
    const statusPath = join(outDir, 'status.json');

    const logs: unknown[] = [];
    const page = await context.newPage();

    page.on('console', (msg) => {
      const text = msg.text();
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed !== null && typeof parsed === 'object' && '__flight' in parsed) {
          logs.push(parsed);
          return;
        }
      } catch {
        // not a flight log entry — fall through to raw-console handling below
      }
      // Surface raw browser console errors/warnings that are not flight logs (e.g. a library or the
      // SDK calling console.error directly). Without this, such messages are dropped and logs.jsonl
      // looks clean even though DevTools shows the error. Other console levels are intentionally
      // ignored to avoid HMR/info noise.
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        logs.push({
          __flight: true,
          t: -1,
          level: type === 'error' ? 'error' : 'warn',
          channel: 'console',
          data: { msg: text },
        });
      }
    });

    page.on('pageerror', (err) => {
      logs.push({ __flight: true, t: -1, level: 'pageerror', data: { msg: err.message } });
    });

    // A failed asset/network request never throws in-page, so it would otherwise be invisible here.
    page.on('requestfailed', (req) => {
      logs.push({
        __flight: true,
        t: -1,
        level: 'error',
        channel: 'network',
        data: { msg: `request failed: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})` },
      });
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForSelector('canvas', { timeout: 8_000 }).catch(() => {});
      if (captureFrames && captureFrames > 0) {
        // --frames=N mode: wait until the page has rendered N frames and the halt has frozen it
        // (see launchBrowser). waitForFunction polls until the page reaches N — no fixed short
        // timeout that could shoot a varying earlier frame — so frame N is captured deterministically.
        await page
          .waitForFunction(
            () => (window as unknown as { __captureFramesReached?: boolean }).__captureFramesReached === true,
            null,
            {
              timeout: 15_000,
            },
          )
          .catch(() => {});
      } else {
        // Default: two animation frames so the page's own rAF callback has run and drawn before the
        // screenshot. A frozen page (the landing backgrounds in capture mode) renders the same frame
        // each tick, so this is enough for a stable shot; the optional --wait covers slower loads.
        await page.evaluate(
          () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
        );
      }
      if (extraWait > 0) await page.waitForTimeout(extraWait);

      // Wgpu is not presentable on the headless/software adapter, so the browser screenshots a blank
      // canvas. The functional verifier reads the frame back from the GPU and exposes it as a PNG data
      // URL (window.__ftRenderImage); use that as the screenshot when present. All other renderers (and
      // the examples/landing tools, which do not run the verifier) screenshot the page normally.
      let screenshotBuffer = await page.screenshot();
      if (renderer === 'webgpu') {
        const dataUrl = await page
          .waitForFunction(() => (window as { __ftRenderImage?: string }).__ftRenderImage ?? null, null, {
            timeout: 15_000,
          })
          .then((handle) => handle.jsonValue() as Promise<string>)
          .catch(() => null);
        if (dataUrl) screenshotBuffer = Buffer.from(dataUrl.split(',')[1], 'base64');
      }
      const hash = createHash('sha256').update(screenshotBuffer).digest('hex');

      // Atomic write: tmp files renamed into place, status.json written last.
      writeFileSync(tmpScreenshot, screenshotBuffer);
      writeFileSync(tmpLogs, logs.map((l) => JSON.stringify(l)).join('\n'));
      renameSync(tmpScreenshot, finalScreenshot);
      renameSync(tmpLogs, finalLogs);

      // Baseline update or comparison. The baseline is a committed sha256 hash, not a screenshot:
      // capture mode renders a deterministic frame (see launchBrowser), so the hash alone detects
      // change and keeps the tracked baseline a small text file instead of a binary PNG. The fresh
      // screenshot is still written to the output dir above for human inspection on a mismatch.
      let baselineHash: string | null = null;
      let changed: boolean | null = null;

      if (updateBaseline) {
        setBaselineField(root, tool, entry.name, renderer, 'sha256', hash);
        baselineHash = hash;
        changed = false;
      } else {
        baselineHash = getBaselineField(root, tool, entry.name, renderer, 'sha256');
        if (baselineHash !== null) changed = hash !== baselineHash;
      }

      if (changed === true) anyChanged = true;
      // A successful capture whose hash drifted is still a pass (it rendered), but the drift is the one
      // thing worth seeing — green renderer, yellow note — so it does not use the dimmed pass message.
      if (changed === true) {
        console.log(
          formatDetailLine(
            pc.green('✓'),
            label(renderer),
            labelWidth,
            pc.yellow('changed (hash differs from baseline)'),
            pc.green,
          ),
        );
      } else {
        console.log(statusLine('pass', renderer, ''));
      }

      const status: CaptureStatus = {
        state: 'ready',
        capturedAt: Date.now(),
        error: null,
        hash,
        baselineHash,
        changed,
      };
      writeFileSync(statusPath, JSON.stringify(status, null, 2));

      if (failOnError) {
        // Let any in-flight error events (a verification throw surfaces as a page error / console
        // error) flush to the listeners, then fail the entry if the page reported any error.
        await page.waitForTimeout(120);
        const errorLog = logs.find((l) => {
          const level = (l as { level?: string }).level;
          return level === 'pageerror' || level === 'error';
        });
        if (errorLog) {
          const detailMsg = (errorLog as { data?: { msg?: string } }).data?.msg ?? 'error logged';
          // A backend the environment cannot provide or sustain (Wgpu with no adapter/device, or a
          // swiftshader device lost mid-run) is skipped, not failed — see BACKEND_UNAVAILABLE.
          if (BACKEND_UNAVAILABLE.test(detailMsg)) {
            console.log(statusLine('skip', renderer, `skipped — backend unavailable (${detailMsg})`));
          } else {
            console.error(statusLine('fail', renderer, detailMsg));
            anyFailed = true;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // An interrupt tears the browser down mid-capture; the resulting "page closed" reject is the
      // shutdown, not a render failure, so swallow it and let the caller report the partial run. The
      // finally below still closes the page.
      if (isAborted() || isBrowserClosedError(err)) break;
      logs.push({ __flight: true, t: -1, level: 'capture-error', data: { msg: message } });
      writeFileSync(finalLogs, logs.map((l) => JSON.stringify(l)).join('\n'));

      const errorStatus: CaptureStatus = {
        state: 'error',
        capturedAt: Date.now(),
        error: message,
        hash: null,
        baselineHash: null,
        changed: null,
      };
      writeFileSync(statusPath, JSON.stringify(errorStatus, null, 2));

      console.error(statusLine('fail', renderer, message));
      anyFailed = true;
    } finally {
      await page.close().catch(() => {});
    }
  }

  if (anyFailed) return 'error';
  if (anyChanged) return 'changed';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Parallel capture
// ---------------------------------------------------------------------------

export interface ParallelCaptureOptions {
  context: BrowserContext;
  entries: Entry[];
  rendererFilter: string[];
  baseUrl: string;
  tool: Tool;
  outBase: string;
  root: string;
  updateBaseline?: boolean;
  extraWait?: number;
  captureFrames?: number;
  failOnError?: boolean;
  isAborted?: () => boolean;
  /** Number of Playwright pages to run concurrently. Default: 6. */
  workerCount?: number;
}

export interface ParallelCaptureResult {
  captured: number;
  changed: number;
  failed: number;
}

// Flattens entries × renderers into a shared job queue and processes them with workerCount
// concurrent Playwright pages on the same browser context. Each worker pulls one (entry, renderer)
// pair at a time, runs the full captureEntry pipeline on it, and returns it to the queue for the
// next job. Single-threaded JS makes the queue safe without locks: shift() is synchronous and
// cannot interleave with another worker's shift().
export async function captureParallel(opts: ParallelCaptureOptions): Promise<ParallelCaptureResult> {
  const { context, entries, rendererFilter, workerCount = 6, isAborted = () => false } = opts;

  const jobs: Array<{ entry: Entry; renderer: string }> = [];
  for (const entry of entries) {
    const renderers =
      rendererFilter.length > 0 ? entry.renderers.filter((r) => rendererFilter.includes(r)) : entry.renderers;
    for (const renderer of renderers) {
      jobs.push({ entry, renderer });
    }
  }

  let captured = 0;
  let changed = 0;
  let failed = 0;

  const activeWorkers = Math.min(workerCount, jobs.length);
  const workers = Array.from({ length: activeWorkers }, async () => {
    while (true) {
      if (isAborted()) break;
      const job = jobs.shift();
      if (!job) break;

      const result = await captureEntry({
        context,
        entry: job.entry,
        renderers: [job.renderer],
        displayLabel: `${job.entry.name}/${job.renderer}`,
        baseUrl: opts.baseUrl,
        tool: opts.tool,
        outBase: opts.outBase,
        root: opts.root,
        updateBaseline: opts.updateBaseline,
        extraWait: opts.extraWait,
        captureFrames: opts.captureFrames,
        failOnError: opts.failOnError,
        isAborted: () => isAborted(),
      });

      if (result === 'ok') captured++;
      else if (result === 'changed') changed++;
      else failed++;
    }
  });

  await Promise.all(workers);
  return { captured, changed, failed };
}
