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
  /** Assertion-passed fingerprints from a preceding capture pass. Avoids reloading those pages. */
  fingerprints?: Readonly<CaptureFingerprintMap>;
  /** Reuse an already initialized browser/context. The caller owns its lifetime. */
  browserSession?: CaptureBrowserSession;
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
  fingerprints: Readonly<CaptureFingerprintMap>;
}

interface Verification {
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

function validationRenderers(entry: Readonly<Entry>, rendererFilter: readonly string[]): string[] {
  return entry.renderers.filter((renderer) => {
    const separator = renderer.indexOf(':');
    const backend = separator === -1 ? renderer : renderer.slice(separator + 1);
    return backend !== 'dom' && rendererMatchesFilter(renderer, rendererFilter);
  });
}

function distance(a: string, b: string): number | null {
  const difference = compareCaptureFingerprints(a, b);
  return Number.isFinite(difference) ? difference : null;
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
    if (verification?.state === 'passed' && verification.fingerprint)
      return { fingerprint: verification.fingerprint, reason: '', unavailable: false, aborted: false };
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

interface EntryResult {
  regressionFailures: number;
  parityFailures: number;
  regressionPasses: number;
  parityPasses: number;
  loadFailures: number;
  updated: number;
  skipped: number;
  output: string[];
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
  };

  result.output.push(`${pc.dim(`[${entryIndex + 1}/${totalEntries}]`)} ${pc.bold(entry.name)}`);

  const renderers = validationRenderers(entry, options.rendererFilter);

  const labelWidth = Math.max(6, ...renderers.map((r) => r.length));
  const statusLine = (tone: DetailTone, label: string, message: string): string =>
    formatStatusLine(tone, label, labelWidth, message);
  const detailLine = (glyph: string, label: string, message: string, paint: (s: string) => string): string =>
    formatDetailLine(glyph, label, labelWidth, message, paint);

  if (options.fingerprintSkip.has(entry.name)) {
    result.skipped += renderers.length;
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
      } else {
        result.output.push(statusLine('fail', renderer, first.reason));
        result.loadFailures++;
      }
      continue;
    }
    const fingerprint = first.fingerprint;

    if (options.updateFingerprints) {
      const second = samples.get(fingerprintKey(entry.name, renderer))?.second;
      if (second === undefined) break;
      if (second.aborted) break;
      const selfDistance = second.fingerprint ? distance(fingerprint, second.fingerprint) : null;
      if (selfDistance === null || selfDistance > options.stabilityEpsilon) {
        const note = `not baselined — nondeterministic (self-distance ${selfDistance?.toFixed(2) ?? 'n/a'})`;
        result.output.push(statusLine('skip', renderer, note));
        result.skipped++;
        continue;
      }
      setBaselineField(options.root, options.subject, entry.name, renderer, 'fingerprint', fingerprint);
      result.output.push(statusLine('pass', renderer, 'baseline written'));
      result.updated++;
      eligible.set(renderer, fingerprint);
      continue;
    }

    const committed = getBaselineField(options.root, options.subject, entry.name, renderer, 'fingerprint');
    if (committed === null) {
      result.output.push(statusLine('muted', renderer, 'no fingerprint baseline — skipped'));
      result.skipped++;
      continue;
    }
    const dist = distance(fingerprint, committed);
    eligible.set(renderer, fingerprint);
    if (dist === null) {
      result.output.push(statusLine('fail', renderer, 'unreadable fingerprint baseline'));
      result.regressionFailures++;
    } else if (options.report) {
      result.output.push(detailLine(pc.dim('='), renderer, pc.dim(`regression distance ${dist.toFixed(2)}`), pc.dim));
    } else if (options.gateRegression) {
      const check = evaluateCaptureRegression(fingerprint, committed, options.regressionTolerance);
      if (!check.pass) {
        result.output.push(
          statusLine('fail', renderer, `regression ${dist.toFixed(2)} > ${options.regressionTolerance}`),
        );
        result.regressionFailures++;
      } else {
        result.output.push(
          statusLine('pass', renderer, `regression ${dist.toFixed(2)} ≤ ${options.regressionTolerance}`),
        );
        result.regressionPasses++;
      }
    }
  }

  if (isAborted()) return result;

  // Tier 3 (parity): cross-backend agreement among the eligible (baselined / self-stable) raster
  // backends.
  const skip = options.paritySkip[entry.name];
  const present = skip === 'all' ? [] : [...eligible.keys()].filter((r) => !skip?.includes(r));
  const pairs: { a: string; b: string; label: string; dist: number }[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const [a, b] = [present[i], present[j]];
      const dist = distance(eligible.get(a)!, eligible.get(b)!);
      if (dist !== null) pairs.push({ a: a!, b: b!, label: `${a}·${b}`, dist });
    }
  }
  if (pairs.length > 0) {
    if (options.report) {
      const segments = pairs.map((p) => `${p.label} ${p.dist.toFixed(2)}`).join('  ');
      result.output.push(detailLine(pc.dim('~'), 'parity', pc.dim(segments), pc.dim));
    } else if (options.gateParity) {
      let anyFailed = false;
      const segments = pairs
        .map((p) => {
          const check = evaluateCaptureParity(eligible.get(p.a)!, eligible.get(p.b)!, options.parityTolerance);
          if (!check.pass) {
            anyFailed = true;
            result.parityFailures++;
            return pc.red(`${p.label} ${p.dist.toFixed(2)}>${options.parityTolerance}`);
          }
          result.parityPasses++;
          return pc.dim(`${p.label} ${p.dist.toFixed(2)}`);
        })
        .join('  ');
      const paint = anyFailed ? pc.red : pc.green;
      const line = detailLine(
        paint(anyFailed ? '✗' : '✓'),
        'parity',
        `${segments}  ${pc.dim(`(≤${options.parityTolerance})`)}`,
        paint,
      );
      result.output.push(line);
    }
  }

  return result;
}

export async function runCaptureValidation(
  input: Readonly<CaptureValidationOptions>,
): Promise<CaptureValidationResult> {
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

  try {
    // Balance pages, not entries: a four-renderer entry must not monopolize one worker while another
    // worker gets a one-renderer entry. The same flattened queue also makes capture-provided
    // fingerprints free — only missing samples become browser jobs.
    const samples: FingerprintSamples = new Map();
    const fingerprintJobs = entries.flatMap((entry) =>
      options.fingerprintSkip.has(entry.name)
        ? []
        : validationRenderers(entry, options.rendererFilter)
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
    return {
      aborted: interrupted,
      loadFailures,
      parityFailures,
      parityPasses,
      regressionFailures,
      regressionPasses,
      shouldFail,
      skipped,
      updated,
    };
  }
}
