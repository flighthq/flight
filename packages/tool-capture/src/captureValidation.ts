// Turn-key parity + regression render verification (Tiers 3 and 5), complementing the capture suite's
// smoke gate (Tiers 1/2/4). Pages publish their coarse render fingerprint on
// window.__ftVerification; this module owns browser execution, self-stability checks, baseline I/O,
// comparison, reporting, interruption, and the final verdict.
//
//   - Tier 3 (parity): the raster backends of one test (canvas/webgl/webgpu) must agree within a
//     tolerance — they render the same scene, so a backend that diverges has a bug. No committed image.
//   - Tier 5 (regression): each backend's fingerprint must match a committed text baseline within a
//     tolerance — catches gross visual regressions. The baseline is ~1 KB of hex, not a PNG, and the
//     coarse averaging absorbs the sub-pixel antialiasing noise that made exact pixel hashes flaky.
//
// Only deterministic tests are gated. When (re)baselining, each backend's fingerprint is captured
// twice and a baseline is written only if the two agree (self-stable); a test that animates over real
// time (fill) is not byte-reproducible across loads, so it gets no baseline and is skipped from both
// tiers — it is still covered by the smoke gate. Regression and parity run only for
// backends that have a committed baseline, i.e. ones already proven stable.
//
// The CLI exposes this as `tool-capture validate`; consumers with generated entries or a custom server
// can call runCaptureValidation directly. Baselines live at `<subject>/baselines/<name>.json`, keyed by
// renderer/column id.

import { resolve } from 'node:path';

import {
  CAPTURE_PARITY_TOLERANCE,
  CAPTURE_REGRESSION_TOLERANCE,
  compareCaptureFingerprints,
  evaluateCaptureParity,
  evaluateCaptureRegression,
} from '@flighthq/capture';
import type { BrowserContext, Page } from '@playwright/test';
import pc from 'picocolors';

import { getBaselineField, setBaselineField } from './baselineStore.js';
import { launchBrowser } from './captureBrowser.js';
import type { CaptureBrowserSession } from './captureBrowser.js';
import type { Entry } from './captureEntries.js';
import { BACKEND_UNAVAILABLE, rendererMatchesFilter, routeSegment } from './captureEntries.js';
import type { DetailTone } from './captureFormat.js';
import { formatDetailLine, formatStatusLine, formatSummaryCount, formatSummaryLine } from './captureFormat.js';
import { installAbortHandler, isBrowserClosedError } from './captureInterrupt.js';
import type { CaptureParityGroup } from './captureManifest.js';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';
import { writeCaptureReport } from './captureReport.js';
import type { Server } from './captureServer.js';
import type { CaptureFingerprintMap } from './captureSuite.js';

export interface CaptureValidationOptions {
  subject: string;
  entries: Readonly<Entry[]>;
  server: Server;
  root?: string;
  filter?: string;
  rendererFilter?: Readonly<string[]>;
  captureFrames?: number;
  report?: boolean;
  updateFingerprints?: boolean;
  gateRegression?: boolean;
  gateParity?: boolean;
  stabilityEpsilon?: number;
  regressionTolerance?: number;
  parityTolerance?: number;
  sequential?: boolean;
  workerCount?: number;
  fingerprintSkip?: Readonly<string[]>;
  paritySkip?: Readonly<Record<string, 'all' | Readonly<string[]>>>;
  /** Explicit visual comparison groups. Unlike legacy parity, these may include DOM and arbitrary targets. */
  parityGroups?: Readonly<Record<string, Readonly<CaptureParityGroup>>>;
  /** Assertion-passed fingerprints from a preceding capture pass. Avoids reloading those pages. */
  fingerprints?: Readonly<CaptureFingerprintMap>;
  /** Reuse an already initialized browser/context. The caller owns its lifetime. */
  browserSession?: CaptureBrowserSession;
  /** Aggregate machine report path. Defaults to `.artifacts/<subject>/validation-report.json`. */
  reportPath?: string | false;
}

export interface CaptureValidationResult {
  aborted: boolean;
  loadFailures: number;
  parityFailures: number;
  parityPasses: number;
  regressionFailures: number;
  regressionPasses: number;
  shouldFail: boolean;
  skipped: number;
  updated: number;
  durationMs: number;
  reportPath: string | null;
  checks: CaptureValidationCheck[];
}

export interface CaptureValidationCheck {
  entry: string;
  renderers: string[];
  kind: 'load' | 'stability' | 'baseline' | 'regression' | 'parity';
  status: 'passed' | 'failed' | 'skipped' | 'reported';
  message: string;
  distance?: number;
  threshold?: number;
}

interface ResolvedCaptureValidationOptions {
  subject: string;
  root: string;
  rendererFilter: readonly string[];
  captureFrames: number;
  report: boolean;
  updateFingerprints: boolean;
  gateRegression: boolean;
  gateParity: boolean;
  stabilityEpsilon: number;
  regressionTolerance: number;
  parityTolerance: number;
  fingerprintSkip: ReadonlySet<string>;
  paritySkip: Readonly<Record<string, 'all' | Readonly<string[]>>>;
  parityGroups: Readonly<Record<string, Readonly<CaptureParityGroup>>>;
  fingerprints: Readonly<CaptureFingerprintMap>;
}

interface Verification {
  protocolVersion?: number;
  render: string;
  coverage: number | null;
  fingerprint: string | null;
  state?: 'pending' | 'passed' | 'failed';
  error?: string | null;
}

type FingerprintLoad = Awaited<ReturnType<typeof loadFingerprint>>;
type FingerprintSamples = Map<string, { first: FingerprintLoad; second?: FingerprintLoad }>;

function fingerprintKey(entry: string, renderer: string): string {
  return `${entry}\0${renderer}`;
}

function validationRenderers(
  entry: Readonly<Entry>,
  rendererFilter: readonly string[],
  parityGroups: Readonly<Record<string, Readonly<CaptureParityGroup>>>,
): string[] {
  const explicitTargets = new Set(Object.values(parityGroups).flatMap((group) => group.targets));
  return entry.renderers.filter((renderer) => {
    const separator = renderer.indexOf(':');
    const backend = separator === -1 ? renderer : renderer.slice(separator + 1);
    return (backend !== 'dom' || explicitTargets.has(renderer)) && rendererMatchesFilter(renderer, rendererFilter);
  });
}

function distance(a: string, b: string): number | null {
  const difference = compareCaptureFingerprints(a, b);
  return Number.isFinite(difference) ? difference : null;
}

function addPair(
  pairs: Array<{ a: string; b: string; label: string; dist: number; tolerance: number }>,
  fingerprints: ReadonlyMap<string, string>,
  a: string,
  b: string,
  group: string,
  tolerance: number,
): void {
  const dist = distance(fingerprints.get(a)!, fingerprints.get(b)!);
  if (dist !== null) pairs.push({ a, b, label: `${group === '' ? '' : `${group}:`}${a}·${b}`, dist, tolerance });
}

// Loads a single test/renderer page and returns its render fingerprint, or null with a reason and a
// flag marking whether the cause is a genuinely-unavailable backend (skippable) versus a real error.
async function loadFingerprint(
  context: BrowserContext,
  baseUrl: string,
  entry: Readonly<Entry>,
  renderer: string,
  subject: string,
): Promise<{ fingerprint: string | null; reason: string; unavailable: boolean; aborted: boolean }> {
  // The real failure reason can arrive three ways, and Playwright's pageerror only catches the first:
  // a synchronous uncaught exception (pageerror), an unhandled promise rejection (the verifier is an
  // awaited async call — rejections do NOT fire pageerror), or a module that fails to import. The
  // functional entry funnels the latter two into a console.error and an on-page #ft-error overlay, so
  // collect those too. Without this, a thrown verifier or a renamed/missing export reads as the
  // uninformative "verifier did not run" instead of the actual message.
  let pageError = '';
  let page: Page | null = null;
  try {
    // newPage is inside the try: once an interrupt has closed the browser it throws, and that must read
    // as an abort sentinel, not crash the run with a raw Playwright stack.
    page = await context.newPage();
    page.on('pageerror', (e) => (pageError ||= e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') pageError ||= m.text();
    });
    const route =
      entry.routes?.[renderer] ??
      entry.route?.(renderer) ??
      `${subject === 'examples' ? 'examples' : 'tests'}/${entry.name}/${routeSegment(renderer)}/`;
    await page.goto(`${baseUrl}/${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    // Wait for a TERMINAL state, not merely for __ftVerification to exist. runRenderVerification sets
    // that object up front with fingerprint:null, then fills the fingerprint only AFTER an async step —
    // for WebGPU, an `await mapAsync()` GPU readback. Resolving on the object's mere existence would read
    // null mid-readback and misreport every webgpu test as "verifier did not run" (canvas/WebGL win the
    // race because their readback is synchronous). So wait until the fingerprint is populated OR an error
    // overlay appears, then read the result. Poll on a timer (the capture harness halts rAF).
    await page
      .waitForFunction(
        () => {
          const v = (window as unknown as { __ftVerification?: Verification }).__ftVerification;
          return v?.state === 'passed' || v?.state === 'failed' || document.getElementById('ft-error') !== null;
        },
        null,
        { timeout: 15_000, polling: 100 },
      )
      .catch(() => {});
    const verification = await page
      .evaluate(() => (window as unknown as { __ftVerification?: Verification }).__ftVerification ?? null)
      .catch(() => null);
    if (verification?.protocolVersion !== undefined && verification.protocolVersion !== CAPTURE_PROTOCOL_VERSION) {
      return {
        fingerprint: null,
        reason: `capture protocol ${verification.protocolVersion} is incompatible with ${CAPTURE_PROTOCOL_VERSION}`,
        unavailable: false,
        aborted: false,
      };
    }
    if (verification?.state === 'passed' && verification.fingerprint)
      return { fingerprint: verification.fingerprint, reason: '', unavailable: false, aborted: false };
    if (verification?.state === 'passed') {
      const domFingerprint = await captureDomFingerprint(page);
      if (domFingerprint !== null) {
        return { fingerprint: domFingerprint, reason: '', unavailable: false, aborted: false };
      }
    }
    // The functional entry paints any error into #ft-error (covering window.error AND unhandledrejection);
    // read it as the most reliable real reason when neither a fingerprint nor a pageerror surfaced.
    const overlay = await page.$eval('#ft-error', (el) => el.textContent ?? '').catch(() => '');
    const detail = verification?.error || pageError || overlay;
    if (BACKEND_UNAVAILABLE.test(detail))
      return { fingerprint: null, reason: `backend unavailable (${detail})`, unavailable: true, aborted: false };
    return { fingerprint: null, reason: detail || 'verifier did not run', unavailable: false, aborted: false };
  } catch (err) {
    // A closed browser/page is the interrupt tearing things down — report it as an abort, not a failure.
    if (isBrowserClosedError(err))
      return { fingerprint: null, reason: 'interrupted', unavailable: false, aborted: true };
    return {
      fingerprint: null,
      reason: err instanceof Error ? err.message : String(err),
      unavailable: false,
      aborted: false,
    };
  } finally {
    await page?.close().catch(() => {});
  }
}

async function captureDomFingerprint(page: Page): Promise<string | null> {
  const handle = await page
    .evaluateHandle(() =>
      (window as unknown as { __ftTarget?: { kind?: string; state?: { element?: HTMLElement } } }).__ftTarget?.kind ===
      'dom'
        ? (window as unknown as { __ftTarget: { state: { element: HTMLElement } } }).__ftTarget.state.element
        : null,
    )
    .catch(() => null);
  const element = handle?.asElement();
  if (element === null || element === undefined) {
    await handle?.dispose();
    return null;
  }
  try {
    const screenshot = await element.screenshot({ animations: 'disabled' });
    const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;
    return await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (context === null || canvas.width === 0 || canvas.height === 0) return null;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const gridSize = 16;
      const hex = '0123456789abcdef';
      let fingerprint = `${gridSize}:`;
      for (let cy = 0; cy < gridSize; cy++) {
        const y0 = Math.floor((cy * canvas.height) / gridSize);
        const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * canvas.height) / gridSize));
        for (let cx = 0; cx < gridSize; cx++) {
          const x0 = Math.floor((cx * canvas.width) / gridSize);
          const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * canvas.width) / gridSize));
          const sums = [0, 0, 0];
          let count = 0;
          for (let y = y0; y < y1 && y < canvas.height; y++) {
            for (let x = x0; x < x1 && x < canvas.width; x++) {
              const offset = (y * canvas.width + x) * 4;
              sums[0] += pixels[offset]!;
              sums[1] += pixels[offset + 1]!;
              sums[2] += pixels[offset + 2]!;
              count++;
            }
          }
          for (const sum of sums) {
            const value = count === 0 ? 0 : Math.round(sum / count);
            fingerprint += hex[(value >> 4) & 0xf]! + hex[value & 0xf]!;
          }
        }
      }
      return fingerprint;
    }, dataUrl);
  } finally {
    await handle?.dispose();
  }
}

interface EntryResult {
  regressionFailures: number;
  parityFailures: number;
  regressionPasses: number;
  parityPasses: number;
  loadFailures: number;
  updated: number;
  skipped: number;
  output: string[];
  checks: CaptureValidationCheck[];
}

async function processEntry(
  entry: Readonly<Entry>,
  entryIndex: number,
  totalEntries: number,
  isAborted: () => boolean,
  options: Readonly<ResolvedCaptureValidationOptions>,
  samples: Readonly<FingerprintSamples>,
): Promise<EntryResult> {
  const result: EntryResult = {
    regressionFailures: 0,
    parityFailures: 0,
    regressionPasses: 0,
    parityPasses: 0,
    loadFailures: 0,
    updated: 0,
    skipped: 0,
    output: [],
    checks: [],
  };

  result.output.push(`${pc.dim(`[${entryIndex + 1}/${totalEntries}]`)} ${pc.bold(entry.name)}`);

  const renderers = validationRenderers(entry, options.rendererFilter, options.parityGroups);

  const labelWidth = Math.max(6, ...renderers.map((r) => r.length));
  const statusLine = (tone: DetailTone, label: string, message: string): string =>
    formatStatusLine(tone, label, labelWidth, message);
  const detailLine = (glyph: string, label: string, message: string, paint: (s: string) => string): string =>
    formatDetailLine(glyph, label, labelWidth, message, paint);

  if (options.fingerprintSkip.has(entry.name)) {
    result.skipped += renderers.length;
    result.checks.push({
      entry: entry.name,
      renderers,
      kind: 'baseline',
      status: 'skipped',
      message: 'fingerprint policy skip',
    });
    return result;
  }

  const eligible = new Map<string, string>();

  for (const renderer of renderers) {
    if (isAborted()) break;
    const supplied = options.fingerprints[entry.name]?.[renderer];
    const first = supplied
      ? { fingerprint: supplied, reason: '', unavailable: false, aborted: false }
      : samples.get(fingerprintKey(entry.name, renderer))?.first;
    if (first === undefined) break;
    if (first.aborted) break;
    if (first.fingerprint === null) {
      if (first.unavailable) {
        result.output.push(statusLine('skip', renderer, `skipped — ${first.reason}`));
        result.skipped++;
        result.checks.push({
          entry: entry.name,
          renderers: [renderer],
          kind: 'load',
          status: 'skipped',
          message: first.reason,
        });
      } else {
        result.output.push(statusLine('fail', renderer, first.reason));
        result.loadFailures++;
        result.checks.push({
          entry: entry.name,
          renderers: [renderer],
          kind: 'load',
          status: 'failed',
          message: first.reason,
        });
      }
      continue;
    }
    const fingerprint = first.fingerprint;

    // Explicit groups are same-run comparisons and do not require a committed regression baseline.
    // Legacy all-pairs parity retains its prior proven-stable/baselined eligibility policy.
    if (Object.keys(options.parityGroups).length > 0) eligible.set(renderer, fingerprint);

    if (options.updateFingerprints) {
      const second = samples.get(fingerprintKey(entry.name, renderer))?.second;
      if (second === undefined) break;
      if (second.aborted) break;
      const selfDistance = second.fingerprint ? distance(fingerprint, second.fingerprint) : null;
      if (selfDistance === null || selfDistance > options.stabilityEpsilon) {
        const note = `not baselined — nondeterministic (self-distance ${selfDistance?.toFixed(2) ?? 'n/a'})`;
        result.output.push(statusLine('skip', renderer, note));
        result.skipped++;
        result.checks.push({
          entry: entry.name,
          renderers: [renderer],
          kind: 'stability',
          status: 'skipped',
          message: note,
          ...(selfDistance === null ? {} : { distance: selfDistance, threshold: options.stabilityEpsilon }),
        });
        continue;
      }
      setBaselineField(options.root, options.subject, entry.name, renderer, 'fingerprint', fingerprint);
      result.output.push(statusLine('pass', renderer, 'baseline written'));
      result.updated++;
      result.checks.push({
        entry: entry.name,
        renderers: [renderer],
        kind: 'baseline',
        status: 'passed',
        message: 'baseline written',
      });
      eligible.set(renderer, fingerprint);
      continue;
    }

    const committed = getBaselineField(options.root, options.subject, entry.name, renderer, 'fingerprint');
    if (committed === null) {
      result.output.push(statusLine('muted', renderer, 'no fingerprint baseline — skipped'));
      result.skipped++;
      result.checks.push({
        entry: entry.name,
        renderers: [renderer],
        kind: 'baseline',
        status: 'skipped',
        message: 'no fingerprint baseline',
      });
      continue;
    }
    const dist = distance(fingerprint, committed);
    eligible.set(renderer, fingerprint);
    if (dist === null) {
      result.output.push(statusLine('fail', renderer, 'unreadable fingerprint baseline'));
      result.regressionFailures++;
      result.checks.push({
        entry: entry.name,
        renderers: [renderer],
        kind: 'regression',
        status: 'failed',
        message: 'unreadable fingerprint baseline',
      });
    } else if (options.report) {
      result.output.push(detailLine(pc.dim('='), renderer, pc.dim(`regression distance ${dist.toFixed(2)}`), pc.dim));
      result.checks.push({
        entry: entry.name,
        renderers: [renderer],
        kind: 'regression',
        status: 'reported',
        message: `regression distance ${dist.toFixed(2)}`,
        distance: dist,
        threshold: options.regressionTolerance,
      });
    } else if (options.gateRegression) {
      const check = evaluateCaptureRegression(fingerprint, committed, options.regressionTolerance);
      if (!check.pass) {
        result.output.push(
          statusLine('fail', renderer, `regression ${dist.toFixed(2)} > ${options.regressionTolerance}`),
        );
        result.regressionFailures++;
        result.checks.push({
          entry: entry.name,
          renderers: [renderer],
          kind: 'regression',
          status: 'failed',
          message: `regression ${dist.toFixed(2)} > ${options.regressionTolerance}`,
          distance: dist,
          threshold: options.regressionTolerance,
        });
      } else {
        result.output.push(
          statusLine('pass', renderer, `regression ${dist.toFixed(2)} ≤ ${options.regressionTolerance}`),
        );
        result.regressionPasses++;
        result.checks.push({
          entry: entry.name,
          renderers: [renderer],
          kind: 'regression',
          status: 'passed',
          message: `regression ${dist.toFixed(2)} ≤ ${options.regressionTolerance}`,
          distance: dist,
          threshold: options.regressionTolerance,
        });
      }
    }
  }

  if (isAborted()) return result;

  // Tier 3 (parity): cross-backend agreement among the eligible (baselined / self-stable) raster
  // backends.
  const skip = options.paritySkip[entry.name];
  const allowed = (renderer: string): boolean => skip !== 'all' && !skip?.includes(renderer);
  const pairs: { a: string; b: string; label: string; dist: number; tolerance: number }[] = [];
  const groups = Object.entries(options.parityGroups);
  if (groups.length === 0) {
    const present = [...eligible.keys()].filter(allowed);
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        addPair(pairs, eligible, present[i]!, present[j]!, '', options.parityTolerance);
      }
    }
  } else {
    for (const [groupName, group] of groups) {
      const present = group.targets.filter((renderer) => eligible.has(renderer) && allowed(renderer));
      if (group.reference !== undefined && present.includes(group.reference)) {
        for (const renderer of present) {
          if (renderer !== group.reference) {
            addPair(pairs, eligible, group.reference, renderer, groupName, group.tolerance ?? options.parityTolerance);
          }
        }
      } else {
        for (let i = 0; i < present.length; i++) {
          for (let j = i + 1; j < present.length; j++) {
            addPair(pairs, eligible, present[i]!, present[j]!, groupName, group.tolerance ?? options.parityTolerance);
          }
        }
      }
    }
  }
  if (pairs.length > 0) {
    if (options.report) {
      const segments = pairs.map((p) => `${p.label} ${p.dist.toFixed(2)}`).join('  ');
      result.output.push(detailLine(pc.dim('~'), 'parity', pc.dim(segments), pc.dim));
      for (const pair of pairs) {
        result.checks.push({
          entry: entry.name,
          renderers: [pair.a, pair.b],
          kind: 'parity',
          status: 'reported',
          message: `parity distance ${pair.dist.toFixed(2)}`,
          distance: pair.dist,
          threshold: pair.tolerance,
        });
      }
    } else if (options.gateParity) {
      let anyFailed = false;
      const segments = pairs
        .map((p) => {
          const check = evaluateCaptureParity(eligible.get(p.a)!, eligible.get(p.b)!, p.tolerance);
          if (!check.pass) {
            anyFailed = true;
            result.parityFailures++;
            result.checks.push({
              entry: entry.name,
              renderers: [p.a, p.b],
              kind: 'parity',
              status: 'failed',
              message: `parity ${p.dist.toFixed(2)} > ${p.tolerance}`,
              distance: p.dist,
              threshold: p.tolerance,
            });
            return pc.red(`${p.label} ${p.dist.toFixed(2)}>${p.tolerance}`);
          }
          result.parityPasses++;
          result.checks.push({
            entry: entry.name,
            renderers: [p.a, p.b],
            kind: 'parity',
            status: 'passed',
            message: `parity ${p.dist.toFixed(2)} ≤ ${p.tolerance}`,
            distance: p.dist,
            threshold: p.tolerance,
          });
          return pc.dim(`${p.label} ${p.dist.toFixed(2)}`);
        })
        .join('  ');
      const paint = anyFailed ? pc.red : pc.green;
      const line = detailLine(paint(anyFailed ? '✗' : '✓'), 'parity', segments, paint);
      result.output.push(line);
    }
  }

  return result;
}

export async function runCaptureValidation(
  input: Readonly<CaptureValidationOptions>,
): Promise<CaptureValidationResult> {
  const startedAt = performance.now();
  const entries = input.filter
    ? input.entries.filter((entry) => entry.name.includes(input.filter!))
    : [...input.entries];
  if (entries.length === 0) throw new Error(`No validation entries found subject=${input.subject}`);
  const options: ResolvedCaptureValidationOptions = {
    subject: input.subject,
    root: resolve(input.root ?? process.cwd()),
    rendererFilter: input.rendererFilter ?? [],
    captureFrames: Math.max(1, input.captureFrames ?? 1),
    report: input.report ?? false,
    updateFingerprints: input.updateFingerprints ?? false,
    gateRegression: input.gateRegression ?? true,
    gateParity: input.gateParity ?? true,
    stabilityEpsilon: input.stabilityEpsilon ?? 4,
    regressionTolerance: input.regressionTolerance ?? CAPTURE_REGRESSION_TOLERANCE,
    parityTolerance: input.parityTolerance ?? CAPTURE_PARITY_TOLERANCE,
    fingerprintSkip: new Set(input.fingerprintSkip ?? []),
    paritySkip: input.paritySkip ?? {},
    parityGroups: input.parityGroups ?? {},
    fingerprints: input.fingerprints ?? {},
  };
  const ownsBrowser = input.browserSession === undefined;
  const launched =
    input.browserSession ??
    (await launchBrowser({ captureFrames: options.captureFrames }).catch((error: unknown) => {
      input.server.kill();
      throw error;
    }));
  const { browser, context } = launched;
  const isAborted = installAbortHandler();

  let regressionFailures = 0;
  let parityFailures = 0;
  let regressionPasses = 0;
  let parityPasses = 0;
  let loadFailures = 0;
  let updated = 0;
  let skipped = 0;
  const checks: CaptureValidationCheck[] = [];

  try {
    // Balance pages, not entries: a four-renderer entry must not monopolize one worker while another
    // worker gets a one-renderer entry. The same flattened queue also makes capture-provided
    // fingerprints free — only missing samples become browser jobs.
    const samples: FingerprintSamples = new Map();
    const fingerprintJobs = entries.flatMap((entry) =>
      options.fingerprintSkip.has(entry.name)
        ? []
        : validationRenderers(entry, options.rendererFilter, options.parityGroups)
            .filter(
              (renderer) => options.updateFingerprints || options.fingerprints[entry.name]?.[renderer] === undefined,
            )
            .map((renderer) => ({ entry, renderer })),
    );
    const fingerprintWorkerCount = input.sequential
      ? 1
      : Math.min(Math.max(1, input.workerCount ?? 6), fingerprintJobs.length);
    await Promise.all(
      Array.from({ length: fingerprintWorkerCount }, async () => {
        while (!isAborted()) {
          const job = fingerprintJobs.shift();
          if (job === undefined) return;
          const supplied = options.fingerprints[job.entry.name]?.[job.renderer];
          const first = await loadFingerprint(context, input.server.url, job.entry, job.renderer, options.subject);
          let second: FingerprintLoad | undefined;
          if (options.updateFingerprints && supplied === undefined && first.fingerprint !== null && !first.aborted) {
            second = await loadFingerprint(context, input.server.url, job.entry, job.renderer, options.subject);
          } else if (options.updateFingerprints && supplied !== undefined) {
            second = first;
          }
          samples.set(fingerprintKey(job.entry.name, job.renderer), { first, second });
        }
      }),
    );

    if (!input.sequential) {
      const jobs = entries.map((entry, i) => ({ entry, index: i }));
      const activeWorkers = Math.min(Math.max(1, input.workerCount ?? 6), jobs.length);
      const workers = Array.from({ length: activeWorkers }, async () => {
        while (true) {
          if (isAborted()) break;
          const job = jobs.shift();
          if (!job) break;
          const result = await processEntry(job.entry, job.index, entries.length, isAborted, options, samples);
          regressionFailures += result.regressionFailures;
          parityFailures += result.parityFailures;
          regressionPasses += result.regressionPasses;
          parityPasses += result.parityPasses;
          loadFailures += result.loadFailures;
          updated += result.updated;
          skipped += result.skipped;
          checks.push(...result.checks);
          for (const line of result.output) console.log(line);
        }
      });
      await Promise.all(workers);
    } else {
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        if (isAborted()) break;
        const result = await processEntry(entries[entryIndex], entryIndex, entries.length, isAborted, options, samples);
        regressionFailures += result.regressionFailures;
        parityFailures += result.parityFailures;
        regressionPasses += result.regressionPasses;
        parityPasses += result.parityPasses;
        loadFailures += result.loadFailures;
        updated += result.updated;
        skipped += result.skipped;
        checks.push(...result.checks);
        for (const line of result.output) console.log(line);
      }
    }
  } finally {
    if (ownsBrowser) await browser.close().catch(() => {});
    input.server.kill();
  }

  const interrupted = isAborted();
  const note = interrupted ? pc.yellow('   — interrupted (partial run)') : '';

  if (options.updateFingerprints) {
    console.log(
      '\n' +
        formatSummaryLine(loadFailures > 0, [
          formatSummaryCount(updated, 'baselines written', 'pass'),
          formatSummaryCount(skipped, 'skipped', 'warn'),
          formatSummaryCount(loadFailures, 'load failures', 'fail'),
        ]) +
        note,
    );
    if (loadFailures > 0) {
      console.error(pc.red(`${loadFailures} test(s) failed to load/verify — not a clean baseline run.`));
      return createResult(true);
    }
    return createResult(loadFailures > 0);
  }
  if (options.report) {
    console.log(
      '\n' +
        formatSummaryLine(loadFailures > 0, [
          formatSummaryCount(skipped, 'skipped', 'warn'),
          formatSummaryCount(loadFailures, 'load failures', 'fail'),
        ]) +
        pc.dim('   (report only — nothing gated)') +
        note,
    );
    return createResult(loadFailures > 0);
  }
  const failed = regressionFailures > 0 || parityFailures > 0 || loadFailures > 0;
  console.log(
    '\n' +
      formatSummaryLine(failed, [
        formatSummaryCount(regressionPasses, 'regression passed', 'pass'),
        formatSummaryCount(regressionFailures, 'regression failed', 'fail'),
        formatSummaryCount(parityPasses, 'parity passed', 'pass'),
        formatSummaryCount(parityFailures, 'parity failed', 'fail'),
        formatSummaryCount(skipped, 'skipped', 'warn'),
        formatSummaryCount(loadFailures, 'load failures', 'fail'),
      ]) +
      note,
  );
  return createResult(failed);

  function createResult(shouldFail: boolean): CaptureValidationResult {
    const reportPath =
      input.reportPath === false
        ? null
        : resolve(
            input.reportPath ?? options.root,
            ...(input.reportPath === undefined ? ['.artifacts', input.subject, 'validation-report.json'] : []),
          );
    const result: CaptureValidationResult = {
      aborted: interrupted,
      loadFailures,
      parityFailures,
      parityPasses,
      regressionFailures,
      regressionPasses,
      shouldFail,
      skipped,
      updated,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      reportPath,
      checks,
    };
    if (reportPath !== null) writeCaptureReport(reportPath, 'validation', result);
    return result;
  }
}
