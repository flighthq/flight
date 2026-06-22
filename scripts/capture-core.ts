// Shared types, discovery, server lifecycle, and capture logic used by
// capture.ts (one-shot) and watch-capture.ts (persistent watch).

import type { BrowserContext } from '@playwright/test';
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

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
function routeSegment(renderer: string): string {
  return renderer.replace(':', '-');
}

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
  } = opts;
  let anyFailed = false;
  let anyChanged = false;

  for (const renderer of renderers) {
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
      const changeNote = changed === true ? '  ⚠  changed (hash differs from baseline)' : '';
      console.log(`  ✓  ${entry.name}/${renderer}${changeNote}`);

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
          const detail = (errorLog as { data?: { msg?: string } }).data?.msg ?? 'error logged';
          // A backend the environment cannot provide (notably Wgpu in headless Chromium, which has
          // no adapter/device) is skipped, not failed — the gate verifies backends where they exist
          // and stays green on machines without them. A real render error (after the device is
          // acquired) does not match this and still fails.
          if (/WebGPU adapter|WebGPU device|requestAdapter|requestDevice|GPUAdapter/i.test(detail)) {
            console.log(`  ⊘  ${entry.name}/${renderer}: skipped — backend unavailable (${detail})`);
          } else {
            console.error(`  ✗  ${entry.name}/${renderer}: ${detail}`);
            anyFailed = true;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logs.push({ __flight: true, t: -1, level: 'capture-error', data: { msg: message } });
      writeFileSync(finalLogs, logs.map((l) => JSON.stringify(l)).join('\n'));

      const status: CaptureStatus = {
        state: 'error',
        capturedAt: Date.now(),
        error: message,
        hash: null,
        baselineHash: null,
        changed: null,
      };
      writeFileSync(statusPath, JSON.stringify(status, null, 2));

      console.error(`  ✗  ${entry.name}/${renderer}: ${message}`);
      anyFailed = true;
    } finally {
      await page.close();
    }
  }

  if (anyFailed) return 'error';
  if (anyChanged) return 'changed';
  return 'ok';
}
