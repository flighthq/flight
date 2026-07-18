// The core capture pass: load one (entry, renderer) page, synchronize to a presented frame, screenshot
// the render output, drain structured logs, and write the screenshot.png / logs.jsonl / status.json
// trio — comparing the screenshot hash against a committed baseline. captureEntry runs a whole entry's
// renderer set sequentially; captureParallel fans an entries × renderers matrix across N pages.
//
// The Node-side present-frame sync lives here: the two-rAF wait (or the --frames halt's
// __captureFramesReached poll) before screenshotting, coordinated with the page-side
// waitForPresentedFrame + gl.finish() in the functional verifier via the window contract that
// launchBrowser's init script establishes (__ftRealRequestAnimationFrame, __ftRenderImage).

import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { BrowserContext, Page } from '@playwright/test';
import pc from 'picocolors';

import { getBaselineField, setBaselineField } from './baselineStore.js';
import type { Entry, Tool } from './captureEntries.js';
import { BACKEND_UNAVAILABLE, rendererMatchesFilter, routeSegment } from './captureEntries.js';
import type { DetailTone } from './captureFormat.js';
import { formatDetailLine, formatStatusLine } from './captureFormat.js';
import { isBrowserClosedError } from './captureInterrupt.js';

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
  /**
   * Forces (true) or disables (false) the in-page render-verification wait + surface readback. Defaults
   * to `tool === 'functional'`. An external subject (reference) sets it true once its pages register a
   * functional target, so its WebGL captures read the fingerprinted surface instead of a black canvas.
   */
  verify?: boolean;
}

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
  verify?: boolean;
  /** Number of Playwright pages to run concurrently. Default: 6. */
  workerCount?: number;
}

export interface ParallelCaptureResult {
  captured: number;
  changed: number;
  failed: number;
}

/** The artifact file paths for one (tool, entry, renderer) capture, under the output base directory. */
export interface CaptureOutputPaths {
  outDir: string;
  tmpScreenshot: string;
  finalScreenshot: string;
  tmpLogs: string;
  finalLogs: string;
  statusPath: string;
}

interface RenderVerification {
  coverage: number | null;
  fingerprint: string | null;
  render: string;
}

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
  // The in-page render verifier drives the surface readback (__ftRenderImage) that avoids Docker's
  // compositor-only black WebGL screenshots. It is implicit for the functional tool; an external subject
  // (reference) opts in via `verify` once its pages register a functional target.
  const verify = opts.verify ?? tool === 'functional';
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
    const urlPath = entry.route
      ? entry.route(renderer)
      : tool === 'examples'
        ? `examples/${entry.name}/${routeSegment(renderer)}/`
        : tool === 'functional'
          ? `tests/${entry.name}/${routeSegment(renderer)}/`
          : ''; // landing: the single page is served at the server root

    const url = `${baseUrl}/${urlPath}`;
    const { outDir, tmpScreenshot, finalScreenshot, tmpLogs, finalLogs, statusPath } = getCaptureOutputPaths(
      outBase,
      tool,
      entry.name,
      renderer,
    );
    mkdirSync(outDir, { recursive: true });

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
        if (type === 'warning' && isCaptureReadPixelsWarning(text)) return;
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

      const waitsForVerification = verify;
      if (waitsForVerification) await waitForRenderVerification(page);

      // Screenshot the render output only — not the full viewport — so all renderers produce the same
      // frame size and the gallery blink comparator has something meaningful to compare.
      //
      // - functional raster renders: the verifier exposes the same surface it fingerprinted as a PNG
      //   data URL (window.__ftRenderImage), avoiding compositor-only black screenshots in Docker.
      // - webgpu examples: SwiftShader can't present to the swapchain, so the canvas is blank in a
      //   Playwright screenshot. Functional captures require the verifier image; examples fall back.
      // - dom: no canvas; the renderer appends a sized <div> directly to <body>.
      // - canvas / webgl: a <canvas> is appended directly to <body>.
      // - fallback: full page screenshot when neither canvas nor div is found (unknown layout).
      let screenshotBuffer: Buffer;
      const backend = rendererBackend(renderer);
      const dataUrl = waitsForVerification ? await getRenderImageDataUrl(page) : null;
      if (dataUrl && backend !== 'dom') {
        screenshotBuffer = Buffer.from(dataUrl.split(',')[1], 'base64');
      } else if (backend === 'webgpu') {
        if (waitsForVerification) {
          throw new Error('WebGPU verifier did not produce a render image');
        } else {
          screenshotBuffer = await page.screenshot();
        }
      } else if (backend === 'dom') {
        screenshotBuffer = await page
          .locator('body > div')
          .first()
          .screenshot()
          .catch(() => page.screenshot());
      } else {
        screenshotBuffer = await page
          .locator('canvas')
          .first()
          .screenshot()
          .catch(() => page.screenshot());
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

async function getRenderImageDataUrl(page: Page): Promise<string | null> {
  return page
    .evaluate(() => (window as unknown as { __ftRenderImage?: string }).__ftRenderImage ?? null)
    .catch(() => null);
}

function rendererBackend(renderer: string): string {
  const i = renderer.indexOf(':');
  return i === -1 ? renderer : renderer.slice(i + 1);
}

function isCaptureReadPixelsWarning(text: string): boolean {
  return text.includes('GPU stall due to ReadPixels');
}

async function waitForRenderVerification(page: Page): Promise<RenderVerification | null> {
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as {
          __ftRenderImage?: string;
          __ftVerification?: RenderVerification;
        };
        const verification = w.__ftVerification;
        if (document.getElementById('ft-error') !== null) return true;
        if (verification === undefined) return false;
        if (verification.render === 'dom') return true;
        return verification.fingerprint !== null && typeof w.__ftRenderImage === 'string' && w.__ftRenderImage !== '';
      },
      null,
      { polling: 100, timeout: 15_000 },
    )
    .catch(() => {});

  return page
    .evaluate(() => (window as unknown as { __ftVerification?: RenderVerification }).__ftVerification ?? null)
    .catch(() => null);
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
    const renderers = entry.renderers.filter((r) => rendererMatchesFilter(r, rendererFilter));
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
        verify: opts.verify,
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

// The artifact paths for one capture, derived purely from the output base, tool, entry name, and
// renderer. Shared by captureEntry (which writes them) and captureRenderTarget (which reports them),
// so the on-disk layout is defined in exactly one place: {outBase}/{tool}/{name}/{routeSegment}/…
export function getCaptureOutputPaths(outBase: string, tool: Tool, name: string, renderer: string): CaptureOutputPaths {
  const outDir = join(resolve(outBase), tool, name, routeSegment(renderer));
  return {
    outDir,
    tmpScreenshot: join(outDir, 'screenshot.tmp.png'),
    finalScreenshot: join(outDir, 'screenshot.png'),
    tmpLogs: join(outDir, 'logs.tmp.jsonl'),
    finalLogs: join(outDir, 'logs.jsonl'),
    statusPath: join(outDir, 'status.json'),
  };
}
