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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { BrowserContext, Page } from '@playwright/test';
import pc from 'picocolors';

import { getBaselineField, setBaselineField } from './baselineStore.js';
import { launchBrowser } from './captureBrowser.js';
import type { Entry } from './captureEntries.js';
import { BACKEND_UNAVAILABLE, rendererMatchesFilter, routeSegment } from './captureEntries.js';
import type { DetailTone } from './captureFormat.js';
import { formatDetailLine, formatStatusLine } from './captureFormat.js';
import { isBrowserClosedError } from './captureInterrupt.js';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';
import { writeCaptureReport } from './captureReport.js';
import type { FunctionalVerification } from './functionalVerify.js';

export interface CaptureStatus {
  protocolVersion: typeof CAPTURE_PROTOCOL_VERSION;
  state: 'ready' | 'error';
  capturedAt: number;
  error: string | null;
  hash: string | null;
  /** The committed baseline sha256, or null when no baseline exists yet. */
  baselineHash: string | null;
  /** null = no baseline exists yet; false = hash matches baseline; true = hash differs from baseline */
  changed: boolean | null;
  /**
   * Present only for an observe-mode capture: what the eyes actually saw. Observe never gates or
   * touches baselines — it always emits a screenshot plus this block so a reviewing agent can tell
   * "geometry drew but wrong" (blank:false, coverage>0) from "nothing drew" (blank:true, coverage 0)
   * from "the page crashed" (pageErrorCount>0), instead of dead-ending on "cannot capture".
   */
  observe?: CaptureObserveDiagnostics;
}

/** What an observe-mode capture saw: the trustworthiness metadata beside the emitted screenshot. */
export interface CaptureObserveDiagnostics {
  /** True when the image contains rendered content or actionable failure evidence. */
  usable: boolean;
  /** Number of page attempts used to obtain this evidence. */
  attempts: number;
  /** The adaptive render warmup exhausted its safety bound. */
  timedOut: boolean;
  /** Non-canvas UI (for example an error overlay or loading message) is visible in the page image. */
  pageEvidence: boolean;
  /** Reasons recorded by attempts before the final evidence image. */
  attemptErrors: string[];
  /** No verified/non-blank frame was produced — the emitted screenshot is a fallback, likely blank/black. */
  blank: boolean;
  /** Render backend: canvas | dom | webgl | webgpu. */
  backend: string;
  /** The functional verify-target kind the page registered, or null when it registered none. */
  verifyTargetKind: string | null;
  /** True when the in-page verifier published a non-blank frame (window.__ftRenderImage). */
  verifyPublished: boolean;
  /** Verifier-reported non-background coverage in 0..1, or null when the page exposed none. */
  coverage: number | null;
  /** Uncaught page exceptions the page threw (a non-zero count means broken code, not a backend limit). */
  pageErrorCount: number;
  /** Console/network error logs (a failed asset, a console.error), excluding page exceptions. */
  errorCount: number;
  /**
   * Extra animation frames the observe warmup rendered past the requested count to coax a first draw out
   * of an app-loop-driven page (see launchBrowser). 0 = drew immediately. A large value that still ended
   * blank means the warmup gave up at its ceiling — the scene never drew, not that it merely started late.
   */
  warmupFrames: number;
}

export interface CaptureEntryOptions {
  context: BrowserContext;
  entry: Entry;
  renderers: string[];
  baseUrl: string;
  tool: string;
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
   * Eyes mode. When true the capture never fails closed: a blank/failed verifier readback that would
   * otherwise throw ("cannot capture") instead emits a best-available screenshot and records a
   * `CaptureObserveDiagnostics` block in status.json. Observe does not gate and does not compare or
   * write baselines — it is for an agent (or human) to SEE a scene, not to pass/fail it. Overrides
   * failOnError/updateBaseline behavior for the run.
   */
  observe?: boolean;
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
  /** Receives fingerprints that completed every page-side assertion. Used to fuse capture + validation. */
  onVerifiedFingerprint?: (entry: string, renderer: string, fingerprint: string) => void;
  /** Fresh-page retries for transient navigation/protocol failures. Default: 1. */
  maxRetries?: number;
}

export interface ParallelCaptureOptions {
  context: BrowserContext;
  entries: Entry[];
  rendererFilter: string[];
  baseUrl: string;
  tool: string;
  outBase: string;
  root: string;
  updateBaseline?: boolean;
  extraWait?: number;
  captureFrames?: number;
  failOnError?: boolean;
  observe?: boolean;
  isAborted?: () => boolean;
  verify?: boolean;
  onVerifiedFingerprint?: (entry: string, renderer: string, fingerprint: string) => void;
  maxRetries?: number;
  /** Number of Playwright pages to run concurrently. Default: 6. */
  workerCount?: number;
}

export interface ParallelCaptureResult {
  captured: number;
  changed: number;
  failed: number;
  targets: CaptureTargetReport[];
}

export interface CaptureTargetReport {
  entry: string;
  renderer: string;
  result: 'captured' | 'changed' | 'failed';
  durationMs: number;
  retries: number;
  usable: boolean;
  error: string | null;
  artifacts: {
    screenshot: string;
    logs: string;
    status: string;
  };
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

type RenderVerification = FunctionalVerification;

// Empty-frame threshold for the coverage-derived blank flag: a frame whose measured non-background
// coverage is at or below this reads as "nothing distinguishable rendered". Small but non-zero so a
// stray antialiased edge pixel does not count as content.
const OBSERVE_BLANK_COVERAGE = 0.001;
const OBSERVE_WARMUP_TIMEOUT_MS = 5_000;

// Summarizes an observe-mode capture into the status.json diagnostics block. Pure over its inputs and
// the drained page logs (page exceptions vs. console/network errors are counted from `logs`), so the
// interpretation an agent relies on — blank vs. drew-but-wrong vs. crashed — is unit-testable without a
// browser. `blank` is decided by the MEASURED pixel `coverage` whenever we have it: the actual frame is
// ground truth. The incoming `args.blank` (a verify target registered but never published) is only a
// weak fallback used when coverage is unmeasurable — the verifier can fail to publish a scene that
// clearly rendered (its own threshold/timing), so trusting it over the pixels false-flags full frames as
// blank. Verified against the reference corpus, where many scenes publish `false` yet cover >0.9.
export function buildCaptureObserveDiagnostics(args: {
  backend: string;
  blank: boolean;
  coverage: number | null;
  logs: readonly unknown[];
  verifyPublished: boolean;
  verifyTargetKind: string | null;
  warmupFrames: number;
  attempts?: number;
  timedOut?: boolean;
  pageEvidence?: boolean;
  attemptErrors?: readonly string[];
}): CaptureObserveDiagnostics {
  let pageErrorCount = 0;
  let errorCount = 0;
  for (const entry of args.logs) {
    const level = (entry as { level?: string }).level;
    if (level === 'pageerror') pageErrorCount += 1;
    else if (level === 'error') errorCount += 1;
  }
  const blank = args.coverage !== null ? args.coverage <= OBSERVE_BLANK_COVERAGE : args.blank;
  const usable = !blank || pageErrorCount > 0 || errorCount > 0 || args.pageEvidence === true;
  return {
    attemptErrors: [...(args.attemptErrors ?? [])],
    attempts: args.attempts ?? 1,
    backend: args.backend,
    blank,
    coverage: args.coverage,
    errorCount,
    pageErrorCount,
    pageEvidence: args.pageEvidence ?? false,
    verifyPublished: args.verifyPublished,
    verifyTargetKind: args.verifyTargetKind,
    warmupFrames: args.warmupFrames,
    timedOut: args.timedOut ?? false,
    usable,
  };
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
    observe = false,
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
  // column-align on the renderer label, matching the validation report. The renderer name carries the
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
      entry.routes?.[renderer] ??
      (entry.route
        ? entry.route(renderer)
        : tool === 'examples'
          ? `examples/${entry.name}/${routeSegment(renderer)}/`
          : tool === 'functional'
            ? `tests/${entry.name}/${routeSegment(renderer)}/`
            : ''); // landing: the single page is served at the server root

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
      if (isCaptureTransportNoise(req.url())) return;
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
      let earlyObserveIntercept: { coverage: number; dataUrl: string } | null = null;
      let observeTimedOut = false;
      if (!verify) {
        const selector = rendererBackend(renderer) === 'dom' ? 'body > div' : 'canvas';
        await page.waitForSelector(selector, { timeout: 8_000 }).catch(() => {});
      }
      if (!verify && captureFrames && captureFrames > 0) {
        // A one-shot/static scene may never schedule its own rAF. Kick the injected frame controller
        // twice so deterministic/observe mode can freeze an already-rendered page instead of timing out
        // waiting for an application loop that does not exist.
        await page.evaluate(() => {
          requestAnimationFrame(() => requestAnimationFrame(() => {}));
        });
        earlyObserveIntercept = observe ? await grabInterceptedGlFrame(page) : null;
        const alreadyObserved =
          (earlyObserveIntercept?.coverage ?? (observe ? await measureObservedCanvasCoverage(page) : null) ?? 0) >
          OBSERVE_BLANK_COVERAGE;
        // --frames=N mode: wait until the page has rendered N frames and the halt has frozen it
        // (see launchBrowser). waitForFunction polls until the page reaches N — no fixed short
        // timeout that could shoot a varying earlier frame — so frame N is captured deterministically.
        if (!alreadyObserved && observe) {
          const observed = await waitForObservedPixels(page, OBSERVE_WARMUP_TIMEOUT_MS);
          earlyObserveIntercept ??= observed.intercept;
          observeTimedOut = !observed.reached;
        } else if (!alreadyObserved) {
          await page.waitForFunction(
            () => (window as unknown as { __captureFramesReached?: boolean }).__captureFramesReached === true,
            null,
            {
              timeout: 15_000,
            },
          );
        }
      } else if (!verify) {
        // Default: two animation frames so the page's own rAF callback has run and drawn before the
        // screenshot. A frozen page (the landing backgrounds in capture mode) renders the same frame
        // each tick, so this is enough for a stable shot; the optional --wait covers slower loads.
        await page.evaluate(
          () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
        );
      }
      if (extraWait > 0) await page.waitForTimeout(extraWait);

      const waitsForVerification = verify;
      // The verification wait is the longest single step (up to 15s) and prints nothing while it
      // polls, so a run can look hung right after "Ready at". A muted heartbeat marks that the entry
      // is verifying, so the pause reads as progress rather than a stall.
      let verification: RenderVerification | null = null;
      if (waitsForVerification) {
        console.log(statusLine('muted', renderer, 'verifying render…'));
        verification = await waitForRenderVerification(page);
        if (verification?.state === 'failed') throw new Error(verification.error ?? 'render verification failed');
        if (verification?.state !== 'passed') throw new Error('render verifier did not reach a terminal state');
        if (verification.fingerprint !== null) {
          opts.onVerifiedFingerprint?.(entry.name, renderer, verification.fingerprint);
        }
      }
      const verificationTargetKind = waitsForVerification ? await getFunctionalTargetKind(page) : null;

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
      // True when no verified/non-blank frame was produced and the screenshot below is a fallback.
      // Only ever set in observe mode: gate mode throws instead (a blank frame must not pass silently).
      let blank = false;
      const backend = rendererBackend(renderer);
      const dataUrl = waitsForVerification ? await getRenderImageDataUrl(page) : null;
      // Zero-integration path: in observe mode, prefer reading the frame straight from the WebGL contexts
      // the harness intercepted at getContext time (see launchBrowser). No client verifier registration
      // and no verify-publish handshake to false-negate — the scene just renders, the harness grabs it.
      // Null for wgpu (swapchain unreadable post-hoc — needs the SDK capture adapter), dom, 2d, or a page
      // with no GL context, all of which fall through to the verifier/canvas paths below.
      const intercept =
        observe && backend === 'webgl' ? (earlyObserveIntercept ?? (await grabInterceptedGlFrame(page))) : null;
      if (intercept !== null) {
        screenshotBuffer = Buffer.from(intercept.dataUrl.split(',')[1], 'base64');
        blank = intercept.coverage <= OBSERVE_BLANK_COVERAGE;
      } else if (dataUrl && backend !== 'dom') {
        screenshotBuffer = Buffer.from(dataUrl.split(',')[1], 'base64');
      } else if (backend === 'webgpu' && waitsForVerification) {
        // No verifier image — SwiftShader can't present the swapchain, so a plain screenshot is black.
        // Gate mode treats this as fatal; observe mode still wants eyes, so it emits that black frame and
        // records blank:true rather than dead-ending on "cannot capture".
        if (!observe) throw new Error('WebGPU verifier did not produce a render image');
        blank = true;
        screenshotBuffer = await page.screenshot();
      } else if (backend === 'webgpu') {
        screenshotBuffer = await page.screenshot();
      } else if (backend === 'webgl' && waitsForVerification && verificationTargetKind === 'webgl') {
        // The page registered a WebGL verification target but published no verified frame, so its
        // readback was blank — a canvas screenshot here would be an all-black false pass (the exact
        // shape that hid a real render bug: green ✓ over a black frame, missed even by --fail-on-error
        // since a verify timeout logs nothing). GATE mode fails loudly. OBSERVE mode instead emits that
        // best-available (likely black) frame and records blank:true: the reviewing agent reads the
        // diagnostics rather than a green ✓, so there is no false pass and it always has eyes on the scene.
        // A page that registers no target is not making a verification claim and still falls through
        // to the canvas-screenshot fallback below.
        if (!observe) throw new Error('WebGL verifier did not produce a render image (blank or failed render)');
        blank = true;
        screenshotBuffer = await page
          .locator('canvas')
          .first()
          .screenshot()
          .catch(() => page.screenshot());
      } else if (backend === 'dom') {
        // Locator screenshots wait for DOM stability and can consume Playwright's full 30s action
        // timeout on platform-text pages whose layout observers keep reporting movement. The capture
        // viewport is the functional surface size, so a direct page screenshot is the same image
        // without the stability heuristic.
        screenshotBuffer = await page.screenshot();
      } else if (backend === 'webgl' && captureFrames > 0) {
        // launchBrowser forces preserveDrawingBuffer in deterministic frame mode, so read the canvas
        // itself instead of Chromium's compositor. Headless SwiftShader can display a WebGL canvas in
        // an interactive browser while returning an entirely blank locator screenshot; reference pages
        // that do not register a verifier otherwise produce a false-green white capture here.
        const canvasDataUrl = await getCanvasImageDataUrl(page);
        if (canvasDataUrl === null) throw new Error('WebGL canvas did not produce a capture image');
        screenshotBuffer = Buffer.from(canvasDataUrl.split(',')[1], 'base64');
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

      if (observe) {
        // Eyes mode: never gate, never touch baselines. Always emit the screenshot (done above) plus a
        // diagnostics block so a reviewing agent can interpret what it is looking at, then move on. The
        // finally below still closes the page.
        // Coverage source, best first: the harness's own intercepted-GL readback (measured pixels, the
        // same frame we emit), then the page verifier's coverage, then a canvas grab. All are measured
        // from real pixels — never the verify-publish handshake, which false-negates rendered scenes.
        const coverage = intercept?.coverage ?? verification?.coverage ?? (await measureObservedCanvasCoverage(page));
        const diagnostics = buildCaptureObserveDiagnostics({
          backend,
          blank,
          coverage,
          logs,
          verifyPublished: dataUrl !== null,
          verifyTargetKind: verificationTargetKind,
          warmupFrames: await getObserveWarmupFrames(page),
          pageEvidence: await hasVisiblePageEvidence(page),
          timedOut: observeTimedOut,
        });
        const observeStatus: CaptureStatus = {
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          state: 'ready',
          capturedAt: Date.now(),
          error: null,
          hash,
          baselineHash: null,
          changed: null,
          observe: diagnostics,
        };
        writeFileSync(statusPath, JSON.stringify(observeStatus, null, 2));
        console.log(statusLine('pass', renderer, formatObserveDetail(diagnostics)));
        continue;
      }

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
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        state: 'ready',
        capturedAt: Date.now(),
        error: null,
        hash,
        baselineHash,
        changed,
      };
      writeFileSync(statusPath, JSON.stringify(status, null, 2));

      if (failOnError) {
        // Verification now has an explicit terminal state, so assertion errors are already visible here;
        // no fixed per-target delay is needed to hope an event happens to flush first.
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
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
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

// One-line human summary of an observe capture for the console — the agent-readable detail is the
// status.json block, this just makes a multi-scene run scannable.
function formatObserveDetail(d: Readonly<CaptureObserveDiagnostics>): string {
  const parts: string[] = [d.blank ? 'observed (blank — no verified frame)' : 'observed'];
  if (d.coverage !== null) parts.push(`coverage ${d.coverage.toFixed(3)}`);
  // Surface the warmup so a slow capture reads as "it drew, just late" rather than an unexplained pause.
  if (d.warmupFrames > 0) parts.push(`warmed up ${d.warmupFrames} extra frame${d.warmupFrames === 1 ? '' : 's'}`);
  if (d.pageErrorCount > 0) parts.push(`${d.pageErrorCount} page error${d.pageErrorCount === 1 ? '' : 's'}`);
  if (d.errorCount > 0) parts.push(`${d.errorCount} error${d.errorCount === 1 ? '' : 's'}`);
  return parts.join(', ');
}

// Extra animation frames the in-page observe warmup rendered past the requested count (see
// launchBrowser). 0 when the page drew immediately or set nothing.
async function getObserveWarmupFrames(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __ftWarmupFrames?: number }).__ftWarmupFrames ?? 0).catch(() => 0);
}

async function getRenderImageDataUrl(page: Page): Promise<string | null> {
  return page
    .evaluate(() => (window as unknown as { __ftRenderImage?: string }).__ftRenderImage ?? null)
    .catch(() => null);
}

async function getCanvasImageDataUrl(page: Page): Promise<string | null> {
  return page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png') ?? null).catch(() => null);
}

// The kind of functional target the page registered (webgl / webgpu / canvas / dom), or null if it
// registered none. A registered target is the page's claim that it verifies its own render; the
// screenshot selection uses it to tell "opted into verification but drew blank" (a failure) from
// "never opted in" (the canvas-screenshot fallback is expected).
async function getFunctionalTargetKind(page: Page): Promise<string | null> {
  return page
    .evaluate(() => (window as unknown as { __ftTarget?: { kind?: string } }).__ftTarget?.kind ?? null)
    .catch(() => null);
}

// Reads the first canvas's presented pixels back in-page and returns the fraction (0..1) that differs
// from the top-left (background) pixel — an observe-mode coverage estimate for when the page verifier
// exposed none. Relies on preserveDrawingBuffer (launchBrowser forces it for gl), so a WebGL canvas
// retains its frame for drawImage. Reads the canvas itself, so a scene that renders only into an
// offscreen target (presented via the verifier image) reads low here — that low coverage IS the signal
// that the canvas holds nothing. Returns null when there is no canvas or the readback throws.
async function measureObservedCanvasCoverage(page: Page): Promise<number | null> {
  return page
    .evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return null;
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const br = data[0]!;
      const bg = data[1]!;
      const bb = data[2]!;
      let differing = 0;
      const pixels = w * h;
      for (let i = 0; i < pixels; i++) {
        const o = i * 4;
        if (Math.abs(data[o]! - br) > 8 || Math.abs(data[o + 1]! - bg) > 8 || Math.abs(data[o + 2]! - bb) > 8) {
          differing += 1;
        }
      }
      return differing / pixels;
    })
    .catch(() => null);
}

// Zero-integration frame grab: read back every WebGL context the harness recorded at getContext time
// (see launchBrowser's __ftGlContexts) — pick the one with the most content — and return it as a PNG data
// URL plus its measured non-background coverage. Relies on the forced preserveDrawingBuffer so the
// presented default framebuffer survives for this post-hoc readback. No client verifier registration is
// involved: the scene just renders and the harness reads its context directly. Returns null when no GL
// context was recorded (a wgpu / 2d / dom page, or one with no canvas), which the caller falls through on.
async function grabInterceptedGlFrame(page: Page): Promise<{ coverage: number; dataUrl: string } | null> {
  return page
    .evaluate(() => {
      const ctxs = (
        window as unknown as {
          __ftGlContexts?: Array<{ canvas: HTMLCanvasElement; gl: WebGLRenderingContext | WebGL2RenderingContext }>;
        }
      ).__ftGlContexts;
      if (ctxs === undefined || ctxs.length === 0) return null;
      let best: { coverage: number; dataUrl: string } | null = null;
      for (const entry of ctxs) {
        const canvas = entry.canvas;
        const gl = entry.gl;
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) continue;
        try {
          gl.finish();
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          const buf = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          const br = buf[0]!;
          const bg = buf[1]!;
          const bb = buf[2]!;
          let differing = 0;
          const pixels = w * h;
          for (let i = 0; i < pixels; i++) {
            const o = i * 4;
            if (Math.abs(buf[o]! - br) > 8 || Math.abs(buf[o + 1]! - bg) > 8 || Math.abs(buf[o + 2]! - bb) > 8) {
              differing += 1;
            }
          }
          const coverage = differing / pixels;
          if (best !== null && coverage <= best.coverage) continue;
          // gl.readPixels is bottom-up; flip rows into a top-down 2D canvas before encoding to PNG.
          const off = document.createElement('canvas');
          off.width = w;
          off.height = h;
          const c2d = off.getContext('2d');
          if (c2d === null) continue;
          const img = c2d.createImageData(w, h);
          const rowBytes = w * 4;
          for (let y = 0; y < h; y++) {
            const src = (h - 1 - y) * rowBytes;
            img.data.set(buf.subarray(src, src + rowBytes), y * rowBytes);
          }
          c2d.putImageData(img, 0, 0);
          best = { coverage, dataUrl: off.toDataURL('image/png') };
        } catch {
          // A lost or cross-origin-tainted context can't be read — skip it.
        }
      }
      return best;
    })
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
        if (verification.state === 'failed') return true;
        if (verification.state !== 'passed') return false;
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

function isCaptureTransportNoise(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
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
  const targets: CaptureTargetReport[] = [];

  const activeWorkers = Math.min(workerCount, jobs.length);
  const workers = Array.from({ length: activeWorkers }, async () => {
    while (true) {
      if (isAborted()) break;
      const job = jobs.shift();
      if (!job) break;

      const startedAt = performance.now();
      const maxRetries = opts.maxRetries ?? 1;
      let retries = 0;
      let result: 'ok' | 'changed' | 'error';
      while (true) {
        result = await captureEntry({
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
          observe: opts.observe,
          verify: opts.verify,
          onVerifiedFingerprint: opts.onVerifiedFingerprint,
          isAborted: () => isAborted(),
        });
        const status = readCaptureStatus(opts.outBase, opts.tool, job.entry.name, job.renderer);
        const transientError = result === 'error' && isTransientCaptureError(status?.error ?? '');
        // Observe is an eyes contract, not merely a non-throwing capture. A successful navigation
        // that yielded no pixels deserves the same fresh-page recovery as a transient protocol
        // failure; this is particularly important in large batches where one slow-starting subject
        // would otherwise silently leave an agent with an unusable screenshot.
        const unusableObservation =
          opts.observe === true &&
          result === 'ok' &&
          status?.observe !== undefined &&
          (status.observe.blank || status.observe.timedOut);
        if ((!transientError && !unusableObservation) || retries >= maxRetries || isAborted()) break;
        retries++;
        console.log(
          formatStatusLine('muted', `${job.entry.name}/${job.renderer}`, 6, `retrying (${retries}/${maxRetries})…`),
        );
      }

      if (result === 'ok') captured++;
      else if (result === 'changed') changed++;
      else failed++;
      const paths = getCaptureOutputPaths(opts.outBase, opts.tool, job.entry.name, job.renderer);
      const status = readCaptureStatus(opts.outBase, opts.tool, job.entry.name, job.renderer);
      targets.push({
        entry: job.entry.name,
        renderer: job.renderer,
        result: result === 'ok' ? 'captured' : result === 'changed' ? 'changed' : 'failed',
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        retries,
        usable: status?.state === 'ready' && (status.observe?.usable ?? status.hash !== null),
        error: status?.error ?? null,
        artifacts: { screenshot: paths.finalScreenshot, logs: paths.finalLogs, status: paths.statusPath },
      });
    }
  });

  await Promise.all(workers);
  return { captured, changed, failed, targets };
}

function readCaptureStatus(outBase: string, tool: string, entry: string, renderer: string): CaptureStatus | null {
  try {
    return JSON.parse(
      readFileSync(getCaptureOutputPaths(outBase, tool, entry, renderer).statusPath, 'utf8'),
    ) as CaptureStatus;
  } catch {
    return null;
  }
}

// Observe one arbitrary URL — the standalone "eyes" primitive behind the `tool-capture observe` bin.
// Drives its own browser (deterministic frame-halt + warmup + the getContext intercept), navigates to
// `url`, grabs the present frame straight from the intercepted GL context (falling back to a canvas
// screenshot), and writes the screenshot + logs + an observe diagnostics status. Zero page integration:
// any page that renders to a canvas works, Flight or not — no verifier registration, no per-frame ping.
export async function captureUrl(
  url: string,
  options: Readonly<CaptureUrlOptions>,
): Promise<CaptureObserveDiagnostics> {
  const attempts = Math.max(1, (options.maxRetries ?? 2) + 1);
  let last: CaptureObserveDiagnostics | null = null;
  const attemptErrors: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await captureUrlAttempt(url, options, attempt);
    attemptErrors.push(...last.attemptErrors);
    if (!last.blank && !last.timedOut) break;
    if (last.attemptErrors.length === 0) {
      attemptErrors.push(
        last.timedOut ? `attempt ${attempt}: render warmup timed out` : `attempt ${attempt}: blank render`,
      );
    }
  }
  last = { ...last!, attemptErrors };
  updateObserveStatus(options.outDir, last);
  writeCaptureReport(join(options.outDir, 'report.json'), 'observe', { url, diagnostics: last! });
  return last!;
}

// The artifact paths for one capture, derived purely from the output base, tool, entry name, and
// renderer. Shared by captureEntry (which writes them) and captureRenderTarget (which reports them),
// so the on-disk layout is defined in exactly one place: {outBase}/{tool}/{name}/{routeSegment}/…
export function getCaptureOutputPaths(
  outBase: string,
  tool: string,
  name: string,
  renderer: string,
): CaptureOutputPaths {
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

async function captureUrlAttempt(
  url: string,
  options: Readonly<CaptureUrlOptions>,
  attempt: number,
): Promise<CaptureObserveDiagnostics> {
  const { outDir, wait = 0, captureFrames = 1 } = options;
  mkdirSync(outDir, { recursive: true });
  const logs: unknown[] = [];
  const { browser, context } = await launchBrowser({ captureFrames, verify: false, observe: true });
  const page = await context.newPage();
  page.on('pageerror', (err) => {
    logs.push({ __flight: true, t: -1, level: 'pageerror', data: { msg: err.message } });
  });
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      logs.push({
        __flight: true,
        t: -1,
        level: type === 'error' ? 'error' : 'warn',
        channel: 'console',
        data: { msg: msg.text() },
      });
    }
  });
  page.on('requestfailed', (req) => {
    if (isCaptureTransportNoise(req.url())) return;
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
    await page.evaluate(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {}));
    });
    let earlyIntercept = await grabInterceptedGlFrame(page);
    const earlyCoverage = earlyIntercept?.coverage ?? (await measureObservedCanvasCoverage(page));
    let reachedFrame = earlyCoverage !== null && earlyCoverage > OBSERVE_BLANK_COVERAGE;
    if (!reachedFrame) {
      const observed = await waitForObservedPixels(page, OBSERVE_WARMUP_TIMEOUT_MS);
      earlyIntercept ??= observed.intercept;
      reachedFrame = observed.reached;
    }
    if (!reachedFrame) {
      logs.push({
        __flight: true,
        t: -1,
        level: 'warn',
        channel: 'capture',
        data: { msg: 'render warmup reached its 15s safety bound; emitting the best available page image' },
      });
    }
    if (wait > 0) await page.waitForTimeout(wait);

    const intercept = earlyIntercept ?? (await grabInterceptedGlFrame(page));
    const coverage = intercept?.coverage ?? (await measureObservedCanvasCoverage(page));
    const canvasIsBlank = coverage !== null && coverage <= OBSERVE_BLANK_COVERAGE;
    // If the render surface is blank, capture the whole page instead: an error overlay or loading UI is
    // useful eyesight, while cropping to the blank canvas hides the only evidence an agent can act on.
    const screenshotBuffer =
      intercept !== null && !canvasIsBlank
        ? Buffer.from(intercept.dataUrl.split(',')[1]!, 'base64')
        : canvasIsBlank
          ? await page.screenshot()
          : await page
              .locator('canvas')
              .first()
              .screenshot()
              .catch(() => page.screenshot());
    const diagnostics = buildCaptureObserveDiagnostics({
      backend: intercept !== null ? 'webgl' : (await page.locator('canvas').count()) > 0 ? 'canvas' : 'dom',
      blank: canvasIsBlank,
      coverage,
      logs,
      verifyPublished: false,
      verifyTargetKind: null,
      warmupFrames: await getObserveWarmupFrames(page),
      attempts: attempt,
      timedOut: !reachedFrame,
      pageEvidence: await hasVisiblePageEvidence(page),
    });
    writeFileSync(join(outDir, 'screenshot.png'), screenshotBuffer);
    writeFileSync(join(outDir, 'logs.jsonl'), logs.map((l) => JSON.stringify(l)).join('\n'));
    const status: CaptureStatus = {
      protocolVersion: CAPTURE_PROTOCOL_VERSION,
      state: 'ready',
      capturedAt: Date.now(),
      error: null,
      hash: createHash('sha256').update(screenshotBuffer).digest('hex'),
      baselineHash: null,
      changed: null,
      observe: diagnostics,
    };
    writeFileSync(join(outDir, 'status.json'), JSON.stringify(status, null, 2));
    return diagnostics;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.push({ __flight: true, t: -1, level: 'error', channel: 'capture', data: { msg: message } });
    const screenshotBuffer = await page.screenshot().catch(() => null);
    const diagnostics = buildCaptureObserveDiagnostics({
      backend: 'page',
      blank: true,
      coverage: null,
      logs,
      verifyPublished: false,
      verifyTargetKind: null,
      warmupFrames: await getObserveWarmupFrames(page),
      attempts: attempt,
      timedOut: /timeout/i.test(message),
      pageEvidence: await hasVisiblePageEvidence(page),
      attemptErrors: [message],
    });
    if (screenshotBuffer !== null) writeFileSync(join(outDir, 'screenshot.png'), screenshotBuffer);
    writeFileSync(join(outDir, 'logs.jsonl'), logs.map((entry) => JSON.stringify(entry)).join('\n'));
    const status: CaptureStatus = {
      protocolVersion: CAPTURE_PROTOCOL_VERSION,
      state: 'error',
      capturedAt: Date.now(),
      error: message,
      hash: screenshotBuffer === null ? null : createHash('sha256').update(screenshotBuffer).digest('hex'),
      baselineHash: null,
      changed: null,
      observe: diagnostics,
    };
    writeFileSync(join(outDir, 'status.json'), JSON.stringify(status, null, 2));
    return diagnostics;
  } finally {
    await browser.close().catch(() => {});
  }
}

function updateObserveStatus(outDir: string, diagnostics: CaptureObserveDiagnostics): void {
  const path = join(outDir, 'status.json');
  try {
    const status = JSON.parse(readFileSync(path, 'utf8')) as CaptureStatus;
    status.observe = diagnostics;
    writeFileSync(path, JSON.stringify(status, null, 2));
  } catch {
    // An unrecoverable browser-launch failure may leave no status file; the caller still receives diagnostics.
  }
}

async function hasVisiblePageEvidence(page: Page): Promise<boolean> {
  return page
    .evaluate(() =>
      [...document.body.children].some(
        (element) =>
          element.tagName !== 'CANVAS' &&
          ((element.textContent ?? '').trim() !== '' || (element as HTMLElement).offsetWidth > 0),
      ),
    )
    .catch(() => false);
}

async function waitForObservedPixels(
  page: Page,
  timeoutMs: number,
): Promise<{
  reached: boolean;
  intercept: { coverage: number; dataUrl: string } | null;
}> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const intercept = await grabInterceptedGlFrame(page);
    const coverage = intercept?.coverage ?? (await measureObservedCanvasCoverage(page));
    if (coverage !== null && coverage > OBSERVE_BLANK_COVERAGE) return { reached: true, intercept };
    const halted = await page
      .evaluate(() => (window as unknown as { __captureFramesReached?: boolean }).__captureFramesReached === true)
      .catch(() => false);
    if (halted) return { reached: true, intercept };
    await page.waitForTimeout(100);
  }
  return { reached: false, intercept: null };
}

export interface CaptureUrlOptions {
  /** Directory to write screenshot.png / logs.jsonl / status.json into (flat, one page). */
  outDir: string;
  /** Extra settle time after the frame halt, in ms. */
  wait?: number;
  /** Frame-halt minimum (see launchBrowser); 1 is the robust default. */
  captureFrames?: number;
  /** Additional fresh-browser attempts after a blank, timeout, or navigation failure. Default: 2. */
  maxRetries?: number;
}

export function isTransientCaptureError(message: string): boolean {
  return /timeout|net::ERR_|page crashed|execution context was destroyed|target page|navigation failed|protocol error|render verifier did not reach/i.test(
    message,
  );
}
