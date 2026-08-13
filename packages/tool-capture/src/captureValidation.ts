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
} from '@flighthq/capture/contract';
import type { BrowserContext, Page } from '@playwright/test';
import pc from 'picocolors';

import { getBaselineField, setBaselineField } from './baselineStore.js';
import {
  diffCaptureBaselineCoverage,
  formatCaptureBaselineCoverageIdentity,
  isCaptureBaselineCoverageFailure,
  readCaptureBaselineCoverageManifest,
  writeCaptureBaselineCoverageManifest,
} from './captureBaselineCoverageManifest.js';
import { isUniformCaptureFingerprint } from './captureBaselineSanity.js';
import { launchBrowser } from './captureBrowser.js';
import type { CaptureBrowserSession } from './captureBrowser.js';
import { provideCaptureDomRenderPixels } from './captureDomReadback.js';
import type { Entry } from './captureEntries.js';
import { BACKEND_UNAVAILABLE, getCaptureEntryRoute, rendererMatchesFilter } from './captureEntries.js';
import type { DetailTone } from './captureFormat.js';
import { formatDetailLine, formatStatusLine, formatSummaryCount, formatSummaryLine } from './captureFormat.js';
import { installAbortHandler, isBrowserClosedError } from './captureInterrupt.js';
import type { CaptureParityGroup } from './captureManifest.js';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';
import { writeCaptureReport } from './captureReport.js';
import { formatCaptureConsoleMessage, listenForCaptureResourceFailures } from './captureResourceFailure.js';
import type { Server } from './captureServer.js';
import { getCaptureSceneSourceHash } from './captureSourceHash.js';
import type { CaptureFingerprintMap, CaptureFingerprintProvenanceMap } from './captureSuite.js';
import { getCaptureTimeoutMs } from './captureTimeout.js';

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
  /** Accept the observed coverage as the new capture baseline coverage manifest instead of gating on it. */
  updateCoverage?: boolean;
  gateRegression?: boolean;
  gateParity?: boolean;
  stabilityEpsilon?: number;
  regressionTolerance?: number;
  parityTolerance?: number;
  sequential?: boolean;
  workerCount?: number;
  fingerprintSkip?: Readonly<string[]>;
  paritySkip?: Readonly<Record<string, 'all' | Readonly<string[]>>>;
  /**
   * Suppress the human-facing progress and summary output. The returned `CaptureValidationResult`
   * carries every fact those lines report, so a programmatic caller loses nothing by silencing them.
   *
   * This exists because a caller that is *asserting how a failure is classified* still renders a real
   * failure summary — a `✗ FAILED … 1 regression failed` block printed by a test that passes. In a CI
   * log those lines are indistinguishable from an actual failure, which is worse than merely untidy:
   * it trains a reader to scroll past the exact string they should stop at. Printing is a side effect
   * the caller should ask for rather than one it has to work around, which is why this is an explicit
   * option and not a check of the ambient environment.
   */
  quiet?: boolean;
  /** Explicit visual comparison groups. Unlike legacy parity, these may include DOM and arbitrary targets. */
  parityGroups?: Readonly<Record<string, Readonly<CaptureParityGroup>>>;
  /** Assertion-passed fingerprints from a preceding capture pass. Avoids reloading those pages. */
  fingerprints?: Readonly<CaptureFingerprintMap>;
  fingerprintProvenance?: Readonly<CaptureFingerprintProvenanceMap>;
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
  parityUncovered: number;
  regressionFailures: number;
  regressionUncovered: number;
  regressionPasses: number;
  shouldFail: boolean;
  skipped: number;
  updated: number;
  durationMs: number;
  reportPath: string | null;
  checks: CaptureValidationCheck[];
}

// What the parity-coverage verdict reads, as plain counts: how many comparisons actually ran, how many
// entries wanted one and got none, and the two conditions under which neither number means anything.
export interface CaptureParityCoverage {
  gateParity: boolean;
  interrupted: boolean;
  parityComparisons: number;
  parityUncovered: number;
  rendererFilterCount: number;
}

// What the regression-coverage verdict reads. There is no renderer-filter exemption here, unlike parity:
// regression compares one renderer against its own committed baseline, so a single-renderer run is still a
// legitimate comparison rather than a case the tier cannot evaluate.
export interface CaptureRegressionCoverage {
  gateRegression: boolean;
  interrupted: boolean;
  regressionComparisons: number;
  regressionUncovered: number;
}

export interface CaptureValidationCheck {
  entry: string;
  renderers: string[];
  kind: 'load' | 'stability' | 'baseline' | 'regression' | 'parity';
  status: 'passed' | 'failed' | 'skipped' | 'reported';
  message: string;
  distance?: number;
  threshold?: number;
  /** Classification present only on a fingerprint mismatch that the regression leg already failed. */
  sourceHashStatus?: 'changed' | 'unchanged' | 'unavailable';
  recordedSourceHash?: string | null;
  currentSourceHash?: string | null;
}

interface ResolvedCaptureValidationOptions {
  subject: string;
  quiet: boolean;
  root: string;
  rendererFilter: readonly string[];
  captureFrames: number;
  report: boolean;
  updateFingerprints: boolean;
  updateCoverage: boolean;
  gateRegression: boolean;
  gateParity: boolean;
  stabilityEpsilon: number;
  regressionTolerance: number;
  parityTolerance: number;
  fingerprintSkip: ReadonlySet<string>;
  paritySkip: Readonly<Record<string, 'all' | Readonly<string[]>>>;
  parityGroups: Readonly<Record<string, Readonly<CaptureParityGroup>>>;
  fingerprints: Readonly<CaptureFingerprintMap>;
  fingerprintProvenance: Readonly<CaptureFingerprintProvenanceMap>;
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

// Why an entry produced no parity pair. Each case has a different remedy, and a bare "0 comparisons"
// sends a reader to the wrong one: an ineligible backend needs a parity group or a committed baseline,
// while a single eligible backend has nothing to disagree with and needs a second one in scope.
export function explainCaptureParityUncovered(
  eligibleCount: number,
  hasGroups: boolean,
  unavailableReferences: readonly string[] = [],
): string {
  if (eligibleCount === 0) {
    return hasGroups
      ? 'no renderer in any parity group is eligible'
      : 'no renderer is parity-eligible — declare a parity group, or commit a fingerprint baseline';
  }
  // Checked before the counts because it is a DIFFERENT remedy: with a reference missing, adding an
  // eligible backend or shortening the skip list changes nothing until the reference itself is back.
  // Collapsing it into the skip message would send the reader to the wrong list, and the reference can
  // be absent for a reason that has nothing to do with skips (never parity-eligible).
  if (unavailableReferences.length > 0) {
    return `parity group reference not present (${unavailableReferences.join(', ')}) — a reference group compares against that backend only, so it yields NO pairs rather than falling back to all-pairs`;
  }
  if (eligibleCount === 1) return 'only one parity-eligible renderer — nothing to compare it against';
  return 'every eligible pair is excluded by a parity skip';
}

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
  let resourceError = '';
  let page: Page | null = null;
  try {
    // newPage is inside the try: once an interrupt has closed the browser it throws, and that must read
    // as an abort sentinel, not crash the run with a raw Playwright stack.
    page = await context.newPage();
    page.on('pageerror', (e) => (pageError ||= e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') pageError ||= formatCaptureConsoleMessage(m);
    });
    listenForCaptureResourceFailures(page, (message) => (resourceError ||= message));
    const route = getCaptureEntryRoute(entry, renderer, subject);
    await page.goto(`${baseUrl}/${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: getCaptureTimeoutMs(),
    });
    // Wait for a TERMINAL state, not merely for __ftVerification to exist. runRenderVerification sets
    // that object up front with fingerprint:null, then fills the fingerprint only AFTER an async step —
    // for WebGPU, an `await mapAsync()` GPU readback. Resolving on the object's mere existence would read
    // null mid-readback and misreport every webgpu test as "verifier did not run" (canvas/WebGL win the
    // race because their readback is synchronous). So wait until the fingerprint is populated OR an error
    // overlay appears, then read the result. Poll on a timer (the capture harness halts rAF).
    const waitStartedAt = performance.now();
    const reachedReadbackOrTerminal = await page
      .waitForFunction(
        () => {
          const w = window as unknown as {
            __ftProvideDomRenderPixels?: unknown;
            __ftVerification?: Verification;
          };
          const verification = w.__ftVerification;
          return (
            verification?.state === 'passed' ||
            verification?.state === 'failed' ||
            (verification?.render === 'dom' && typeof w.__ftProvideDomRenderPixels === 'function') ||
            document.getElementById('ft-error') !== null
          );
        },
        null,
        { timeout: getCaptureTimeoutMs(), polling: 100 },
      )
      .then(() => true)
      .catch(() => false);
    if (reachedReadbackOrTerminal && (await provideCaptureDomRenderPixels(page))) {
      await page
        .waitForFunction(
          () => {
            const verification = (window as unknown as { __ftVerification?: Verification }).__ftVerification;
            return (
              verification?.state === 'passed' ||
              verification?.state === 'failed' ||
              document.getElementById('ft-error') !== null
            );
          },
          null,
          { timeout: getCaptureTimeoutMs(), polling: 100 },
        )
        .catch(() => {});
    }
    const waitedMs = Math.round(performance.now() - waitStartedAt);
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
    const detail = verification?.error || resourceError || pageError || overlay;
    if (BACKEND_UNAVAILABLE.test(detail))
      return { fingerprint: null, reason: `backend unavailable (${detail})`, unavailable: true, aborted: false };
    return {
      fingerprint: null,
      reason: detail || explainCaptureVerificationStall(verification, waitedMs),
      unavailable: false,
      aborted: false,
    };
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

// Why a verification wait ended without a fingerprint, as a reason a reader can act on. The bare
// "verifier did not run" it replaces named a symptom shared by causes with opposite remedies, and left
// the one number that decides between them — how long it actually waited — unrecorded.
//
// This exists because a gate that silently fails to run is the same inert-gate class as a check that
// silently passes: the leg reports a failure nobody can diagnose, so it gets re-run rather than fixed.
// Measured for context: the heaviest example scene verifies in ~4.1-6.2s across 6 to 16 workers, even
// with a full monorepo check and test suite running alongside — about 42% of the budget at worst. So a
// stall at or near the full budget is NOT the scene being slow, and the reason says so rather than
// leaving the next reader to assume it and raise the timeout.
//
// The budget is read from the same seam the wait reads, not passed in, so the two can never disagree
// about what it was. Passing it would let a caller name a budget the wait did not use, which is the
// one thing this message must never do — it exists to be trusted about how long the wait actually had.
export function explainCaptureVerificationStall(
  verification: Readonly<{ fingerprint?: string | null; state?: string }> | null,
  waitedMs: number,
): string {
  const budget = `waited ${waitedMs}ms of ${getCaptureTimeoutMs()}ms`;
  if (verification === null || verification === undefined) {
    return `verifier never registered — no __ftVerification on the page (${budget}); the page's module likely failed to run`;
  }
  if (verification.state === undefined) {
    return `verifier object present but carries no state (${budget}); suspect a capture-protocol mismatch`;
  }
  if (verification.state === 'passed') {
    return `verifier passed but produced no fingerprint (${budget}); the readback completed empty`;
  }
  // Registered and still non-terminal: it started and never finished, which is a stall rather than a
  // scene that is merely expensive. The STAGE is the actionable half — 'awaitingFrame' means a presented
  // frame never arrived (page/scheduler), while 'readingBack' means a GPU readback or the DOM runner bridge
  // never resolved.
  const stage = (verification as { stage?: string }).stage;
  const where = stage === undefined ? '' : ` at stage "${stage}"`;
  return `verifier registered but stalled${where} in state "${verification.state}" (${budget}); it started and never reached a terminal state`;
}

/**
 * Ranks measured parity distances, widest disagreement first.
 *
 * Returns null when nothing was compared, so a run that measured nothing prints no ranking rather
 * than an empty one that would read as agreement.
 */
export function formatCaptureParityRanking(
  checks: readonly Readonly<{ distance?: number; entry: string; kind: string; renderers?: readonly string[] }>[],
  limit = 10,
): string | null {
  const measured = checks
    .filter((check) => check.kind === 'parity' && typeof check.distance === 'number')
    .map((check) => ({ distance: check.distance!, entry: check.entry, renderers: check.renderers ?? [] }))
    .sort((a, b) => b.distance - a.distance || a.entry.localeCompare(b.entry));
  if (measured.length === 0) return null;
  const shown = measured.slice(0, limit);
  const median = measured[measured.length >> 1]!.distance;
  const lines = shown.map((row) => `  ${row.distance.toFixed(2)}  ${row.entry}  ${row.renderers.join('·')}`);
  const omitted = measured.length - shown.length;
  return [
    `  widest parity distances (${measured.length} compared, median ${median.toFixed(2)}):`,
    ...lines,
    ...(omitted > 0 ? [`  … ${omitted} more not shown`] : []),
  ].join('\n');
}

export function isCaptureParityCoverageFailure(run: Readonly<CaptureParityCoverage>): boolean {
  if (!run.gateParity || run.interrupted) return false;
  if (run.rendererFilterCount === 1) return false;
  return run.parityComparisons === 0 && run.parityUncovered > 0;
}

// A tier either has what it needs and gates hard, or it says so loudly — there is no silent
// degrade-to-success. A gated parity run that compared NOTHING is UNCONFIGURED, not clean, and the
// green tick it used to print is worse than an absent leg, because an absent leg is visibly absent.
//
// Two runs genuinely cannot compare, and are exempt rather than excused: one narrowed to a single
// renderer (the operator disabled parity themselves, so reporting it back at them is noise), and an
// interrupted run, whose remaining entries never ran at all. A run with nothing uncovered — every
// entry skipped by policy before parity was reached — is not this failure either.
export function isCaptureRegressionCoverageFailure(run: Readonly<CaptureRegressionCoverage>): boolean {
  if (!run.gateRegression || run.interrupted) return false;
  return run.regressionComparisons === 0 && run.regressionUncovered > 0;
}

interface EntryResult {
  /** `entry/renderer` identities this run reached the baseline lookup for. */
  visited: string[];
  /** Of those, the ones that HAD a comparable committed baseline. */
  covered: string[];
  regressionFailures: number;
  regressionUncovered: number;
  parityFailures: number;
  parityUncovered: number;
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
    visited: [],
    covered: [],
    regressionFailures: 0,
    regressionUncovered: 0,
    parityFailures: 0,
    parityUncovered: 0,
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

  // An entry whose renderers are all filtered out otherwise emits NOTHING — no skip line, no parity line,
  // no failure — so a reader cannot tell "covered and silent" from "never ran". Say it out loud.
  if (renderers.length === 0) {
    result.output.push(
      `  ${pc.dim('·')} ${pc.dim(`no renderer in scope for this leg (entry declares: ${entry.renderers.join(', ') || 'none'})`)}`,
    );
    result.checks.push({
      entry: entry.name,
      renderers: [],
      kind: 'load',
      status: 'skipped',
      message: `no renderer in scope; entry declares ${entry.renderers.join(', ') || 'none'}`,
    });
    return result;
  }

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

  // Every identity below this point reached the baseline lookup, so an absent one really was excluded
  // by scope rather than silently dropped.
  result.visited.push(...renderers.map((renderer) => formatCaptureBaselineCoverageIdentity(entry.name, renderer)));

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
      // A uniform fingerprint is every cell identical — a blank or flat-filled frame. The stability check
      // above CANNOT catch it: a frame that renders blank every time has a self-distance of zero, the most
      // stable result possible, so it sails through and gets blessed as ground truth. That has already
      // happened once in this repo (a WebGPU capture on a software adapter that cannot present to the
      // swapchain), and a blank baseline is worse than no baseline, because every later run then compares
      // against the blank and passes.
      if (isUniformCaptureFingerprint(fingerprint)) {
        const note =
          'not baselined — uniform frame (every cell identical); a blank capture must not become ground truth';
        result.output.push(statusLine('skip', renderer, note));
        result.skipped++;
        result.checks.push({
          entry: entry.name,
          renderers: [renderer],
          kind: 'baseline',
          status: 'skipped',
          message: note,
        });
        continue;
      }
      // ★ STAMP ONLY WHAT THIS PASS PRODUCED. The provenance is looked up by the SAME (entry, renderer)
      // key the fingerprint came from, and is passed only when this pass actually captured that
      // fingerprint. A fingerprint supplied from elsewhere, or already on disk, gets NO provenance:
      // attaching today's conditions to a value produced by an earlier capture would manufacture an
      // agreement nobody observed, and a wrong provenance is worse than the absent one it replaces.
      const provenance = options.fingerprintProvenance[entry.name]?.[renderer];
      setBaselineField(options.root, options.subject, entry.name, renderer, 'fingerprint', fingerprint, provenance);
      const sourceHash = getCaptureSceneSourceHash(options.root, options.subject, entry, renderer);
      if (sourceHash !== null) {
        setBaselineField(options.root, options.subject, entry.name, renderer, 'sourceHash', sourceHash);
      }
      result.output.push(statusLine('pass', renderer, 'baseline written'));
      result.updated++;
      result.checks.push({
        entry: entry.name,
        renderers: [renderer],
        kind: 'baseline',
        status: 'passed',
        message: 'baseline written',
      });
      result.covered.push(formatCaptureBaselineCoverageIdentity(entry.name, renderer));
      eligible.set(renderer, fingerprint);
      continue;
    }

    const committed = getBaselineField(options.root, options.subject, entry.name, renderer, 'fingerprint');
    if (committed === null) {
      result.regressionUncovered++;
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
    // Coverage is recorded HERE, where it is a fact, not inferred later from the shape of the checks:
    // a smoke leg gates neither regression nor report and so emits no regression check at all, and
    // deriving coverage by subtracting skips would call every one of those targets lost.
    result.covered.push(formatCaptureBaselineCoverageIdentity(entry.name, renderer));
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
        const recordedSourceHash = getBaselineField(options.root, options.subject, entry.name, renderer, 'sourceHash');
        const currentSourceHash = getCaptureSceneSourceHash(options.root, options.subject, entry, renderer);
        const freshness = classifyCaptureBaselineFreshness(recordedSourceHash, currentSourceHash);
        const message = `regression ${dist.toFixed(2)} > ${options.regressionTolerance} — ${freshness.message}`;
        result.output.push(statusLine('fail', renderer, message));
        result.regressionFailures++;
        result.checks.push({
          entry: entry.name,
          renderers: [renderer],
          kind: 'regression',
          status: 'failed',
          message,
          distance: dist,
          threshold: options.regressionTolerance,
          sourceHashStatus: freshness.status,
          recordedSourceHash,
          currentSourceHash,
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
  // Groups whose declared reference is not present, as "<group> → <reference>". Carried to the uncovered
  // explanation so the reason names the missing reference instead of collapsing into the skip message.
  const unavailableReferences: string[] = [];
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
      // A group that DECLARES a reference is claiming agreement WITH THAT BACKEND. If the reference is
      // not present — removed by a skip, or never parity-eligible — that claim cannot be checked, and
      // comparing the remaining targets to each other substitutes a DIFFERENT, weaker claim under the
      // same group name. Yield no pairs instead, so the scene reports itself uncovered by name.
      if (group.reference !== undefined) {
        // Only a SKIP-removed reference kills the group. A skip is a deliberate statement that this
        // backend is not to be trusted for this scene, so comparing the survivors to each other
        // substitutes a different, weaker claim under the same group name — yield nothing and let the
        // scene report itself uncovered.
        //
        // A reference that was never there is NOT the same thing and must keep the all-pairs branch:
        // the built-in group declares `reference: 'canvas'` once for every scene, and 83 scenes have no
        // canvas column at all. Treating those as reference-removed silently deletes 85 real
        // cross-backend comparisons — measured, not estimated: 253 → 168 on the functional suite.
        if (eligible.has(group.reference) && !allowed(group.reference)) {
          unavailableReferences.push(`${groupName} → ${group.reference}`);
          continue;
        }
        if (!present.includes(group.reference)) {
          // The comparison is FINE here and the CLAIM was false: nobody asked for the reference to go,
          // it simply is not a column for this scene, and all-pairs among the columns that DO exist is
          // real coverage worth keeping. What was wrong is reporting it under a group that asserts a
          // reference it never used, so the label says so rather than the pairs disappearing.
          const label = `${groupName} (all-pairs, no ${group.reference} column)`;
          for (let i = 0; i < present.length; i++) {
            for (let j = i + 1; j < present.length; j++) {
              addPair(pairs, eligible, present[i]!, present[j]!, label, group.tolerance ?? options.parityTolerance);
            }
          }
          continue;
        }
        for (const renderer of present) {
          if (renderer !== group.reference) {
            addPair(pairs, eligible, group.reference, renderer, groupName, group.tolerance ?? options.parityTolerance);
          }
        }
        continue;
      }
      // No reference declared at all: all-pairs is what this group means, not a fallback for a lost one.
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          addPair(pairs, eligible, present[i]!, present[j]!, groupName, group.tolerance ?? options.parityTolerance);
        }
      }
    }
  }
  // A gated parity run that compared NOTHING is the failure mode this whole tier was silently missing:
  // with no eligible renderers there are no pairs, so every branch below is skipped and the entry reports
  // success having checked nothing. Record it as uncovered so the run-level verdict can say so out loud.
  // Report and baseline-write modes are excluded because neither claims to gate anything.
  if (pairs.length === 0 && options.gateParity && !options.report && !options.updateFingerprints) {
    result.parityUncovered++;
    result.checks.push({
      entry: entry.name,
      renderers: [...eligible.keys()],
      kind: 'parity',
      status: 'skipped',
      message: explainCaptureParityUncovered(eligible.size, groups.length > 0, unavailableReferences),
    });
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
          message: `parity ${pair.label} distance ${pair.dist.toFixed(2)}`,
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
              message: `parity ${p.label} ${p.dist.toFixed(2)} > ${p.tolerance}`,
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
            message: `parity ${p.label} ${p.dist.toFixed(2)} ≤ ${p.tolerance}`,
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

// Loads a single test/renderer page and returns its render fingerprint, or null with a reason and a
// flag marking whether the cause is a genuinely-unavailable backend (skippable) versus a real error.
export { isUniformCaptureFingerprint } from './captureBaselineSanity.js';

function classifyCaptureBaselineFreshness(
  recordedSourceHash: string | null,
  currentSourceHash: string | null,
): { message: string; status: 'changed' | 'unchanged' | 'unavailable' } {
  if (recordedSourceHash === null) {
    return {
      message: 'scene-source freshness unavailable (baseline has no recorded source hash)',
      status: 'unavailable',
    };
  }
  if (currentSourceHash === null) {
    return {
      message: 'scene-source freshness unavailable (current scene source could not be read)',
      status: 'unavailable',
    };
  }
  if (recordedSourceHash !== currentSourceHash) {
    return {
      message: 'scene source changed since baseline — recapture owed by the scene owner',
      status: 'changed',
    };
  }
  return {
    message: 'scene source unchanged since baseline — environment drift; never rebaseline',
    status: 'unchanged',
  };
}

export async function runCaptureValidation(
  input: Readonly<CaptureValidationOptions>,
): Promise<CaptureValidationResult> {
  const startedAt = performance.now();
  const entries = input.filter
    ? input.entries.filter((entry) => entry.name.includes(input.filter!))
    : [...input.entries];
  if (entries.length === 0) throw new Error(`No validation entries found subject=${input.subject}`);
  // A filtered run cannot tell "this pinned target vanished" from "I excluded it", so it must not claim
  // an absence. It can still report a LOSS, because that is about a target it actually ran.
  const entryFiltered = input.filter !== undefined && input.filter !== '';
  const options: ResolvedCaptureValidationOptions = {
    subject: input.subject,
    root: resolve(input.root ?? process.cwd()),
    rendererFilter: input.rendererFilter ?? [],
    captureFrames: Math.max(1, input.captureFrames ?? 1),
    report: input.report ?? false,
    quiet: input.quiet ?? false,
    updateFingerprints: input.updateFingerprints ?? false,
    updateCoverage: input.updateCoverage ?? false,
    gateRegression: input.gateRegression ?? true,
    gateParity: input.gateParity ?? true,
    stabilityEpsilon: input.stabilityEpsilon ?? 4,
    regressionTolerance: input.regressionTolerance ?? CAPTURE_REGRESSION_TOLERANCE,
    parityTolerance: input.parityTolerance ?? CAPTURE_PARITY_TOLERANCE,
    fingerprintSkip: new Set(input.fingerprintSkip ?? []),
    paritySkip: input.paritySkip ?? {},
    parityGroups: input.parityGroups ?? {},
    fingerprints: input.fingerprints ?? {},
    fingerprintProvenance: input.fingerprintProvenance ?? {},
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
  let parityUncovered = 0;
  let regressionUncovered = 0;
  let regressionPasses = 0;
  let parityPasses = 0;
  let loadFailures = 0;
  let updated = 0;
  let skipped = 0;
  const checks: CaptureValidationCheck[] = [];
  const coveredIdentities: string[] = [];
  const visitedIdentities: string[] = [];

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
          parityUncovered += result.parityUncovered;
          regressionUncovered += result.regressionUncovered;
          regressionPasses += result.regressionPasses;
          parityPasses += result.parityPasses;
          loadFailures += result.loadFailures;
          updated += result.updated;
          skipped += result.skipped;
          checks.push(...result.checks);
          coveredIdentities.push(...result.covered);
          visitedIdentities.push(...result.visited);
          coveredIdentities.push(...result.covered);
          visitedIdentities.push(...result.visited);
          if (!options.quiet) for (const line of result.output) console.log(line);
        }
      });
      await Promise.all(workers);
    } else {
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        if (isAborted()) break;
        const result = await processEntry(entries[entryIndex], entryIndex, entries.length, isAborted, options, samples);
        regressionFailures += result.regressionFailures;
        parityFailures += result.parityFailures;
        parityUncovered += result.parityUncovered;
        regressionUncovered += result.regressionUncovered;
        regressionPasses += result.regressionPasses;
        parityPasses += result.parityPasses;
        loadFailures += result.loadFailures;
        updated += result.updated;
        skipped += result.skipped;
        checks.push(...result.checks);
        if (!options.quiet) for (const line of result.output) console.log(line);
      }
    }
  } finally {
    if (ownsBrowser) await browser.close().catch(() => {});
    input.server.kill();
  }

  const interrupted = isAborted();
  const note = interrupted ? pc.yellow('   — interrupted (partial run)') : '';

  if (options.updateCoverage) {
    // A partial or load-failed run does not know what it did not reach. Accepting one would silently
    // retire every target it never got to — the exact erosion the manifest exists to catch.
    if (interrupted || loadFailures > 0) {
      console.error(
        pc.red(
          `\nRefusing to update the capture baseline coverage manifest from an incomplete run (${interrupted ? 'interrupted' : `${loadFailures} load failure(s)`}).`,
        ),
      );
      return createResult(true);
    }
    const identities = [...new Set(coveredIdentities)];
    writeCaptureBaselineCoverageManifest(
      options.root,
      options.subject,
      identities,
      options.rendererFilter.length > 0 ? [...options.rendererFilter] : null,
    );
    if (!options.quiet)
      console.log(
        `\ncapture baseline coverage manifest updated — ${identities.length} identit${identities.length === 1 ? 'y' : 'ies'} pinned for ${options.subject}`,
      );
    return createResult(false);
  }

  if (options.updateFingerprints) {
    if (!options.quiet)
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
    if (!options.quiet)
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
  // Same doctrine, other tier: a gated regression leg that compared NOTHING is unconfigured, not clean.
  // Without this the tier reads as a green pass with zero coverage the moment nothing else is red.
  const regressionCoverageFailed = isCaptureRegressionCoverageFailure({
    gateRegression: options.gateRegression,
    interrupted,
    regressionComparisons: regressionPasses + regressionFailures,
    regressionUncovered,
  });
  const parityCoverageFailed = isCaptureParityCoverageFailure({
    gateParity: options.gateParity,
    interrupted,
    parityComparisons: parityPasses + parityFailures,
    parityUncovered,
    rendererFilterCount: options.rendererFilter.length,
  });
  // The zero-floor above asks only whether ANY comparison ran. This asks WHICH ones did: a pinned
  // identity that ran and no longer has a baseline is named individually, instead of being absorbed into
  // an "uncovered" count that still satisfies the floor as long as one other target compared.
  const coverageDiff = options.gateRegression
    ? diffCaptureBaselineCoverage(
        readCaptureBaselineCoverageManifest(options.root),
        options.subject,
        [...new Set(coveredIdentities)],
        [...new Set(visitedIdentities)],
        {
          entryFiltered,
          activeRenderers: options.rendererFilter.length > 0 ? [...options.rendererFilter] : null,
        },
      )
    : { gained: [], lost: [], absent: [] };
  const coverageFailed = isCaptureBaselineCoverageFailure(coverageDiff);
  const failed =
    coverageFailed ||
    regressionFailures > 0 ||
    parityFailures > 0 ||
    loadFailures > 0 ||
    parityCoverageFailed ||
    regressionCoverageFailed;
  if (!options.quiet)
    console.log(
      '\n' +
        formatSummaryLine(failed, [
          formatSummaryCount(regressionPasses, 'regression passed', 'pass'),
          formatSummaryCount(regressionFailures, 'regression failed', 'fail'),
          formatSummaryCount(parityPasses, 'parity passed', 'pass'),
          formatSummaryCount(parityFailures, 'parity failed', 'fail'),
          formatSummaryCount(parityUncovered, 'parity uncovered', parityCoverageFailed ? 'fail' : 'warn'),
          formatSummaryCount(regressionUncovered, 'regression uncovered', regressionCoverageFailed ? 'fail' : 'warn'),
          formatSummaryCount(skipped, 'skipped', 'warn'),
          formatSummaryCount(loadFailures, 'load failures', 'fail'),
        ]) +
        note,
    );
  // A parity PASS spans zero to the tolerance, so the verdict alone cannot distinguish a scene that
  // matched exactly from one that came within a hair of failing. Rank the measured distances so the
  // reader sees what the comparison actually found rather than only that nothing crossed the line.
  const ranking = formatCaptureParityRanking(checks);
  if (ranking !== null && !options.quiet) console.log(ranking);

  for (const identity of coverageDiff.lost) {
    console.error(pc.red(`  - ${identity}  (pinned, ran, no comparable baseline)`));
  }
  for (const identity of coverageDiff.absent) {
    console.error(pc.red(`  - ${identity}  (pinned, never reached by this run)`));
  }
  for (const identity of coverageDiff.gained) {
    console.error(pc.red(`  + ${identity}  (newly covered, not yet pinned)`));
  }
  if (coverageFailed) {
    console.error(
      pc.red(
        `\nCapture baseline coverage does not match scripts/capture-baseline-coverage-manifest.json — the manifest is an exact set, so a gain counts too. Repair a missing baseline, or accept the change deliberately with --update-coverage (no --filter).`,
      ),
    );
  }

  // Name the entries behind an "N uncovered" count: a bare number tells a reader something is missing but
  // not what to go look at, and the entries differ in why.
  for (const [label, uncovered, failedTier] of [
    ['parity', parityUncovered, parityCoverageFailed],
    ['regression', regressionUncovered, regressionCoverageFailed],
  ] as const) {
    if (uncovered === 0) continue;
    const names = [
      ...new Set(
        checks
          .filter((check) => check.kind === (label === 'parity' ? 'parity' : 'baseline') && check.status === 'skipped')
          .map((check) => check.entry),
      ),
    ];
    if (names.length > 0) {
      const line = `  ${label} uncovered: ${names.join(', ')}`;
      if (!options.quiet) console.log(failedTier ? pc.red(line) : pc.yellow(line));
    }
  }

  if (regressionCoverageFailed) {
    console.error(
      pc.red(
        `\nRegression compared NOTHING across ${regressionUncovered} entr${regressionUncovered === 1 ? 'y' : 'ies'} — this tier is unconfigured, not clean. Re-capture with --update-fingerprints on a leg where the tier is valid, or remove the stale baselines so the gap is honest.`,
      ),
    );
  }
  if (parityCoverageFailed) {
    console.error(
      pc.red(
        `\nParity compared NOTHING across all ${parityUncovered} entr${parityUncovered === 1 ? 'y' : 'ies'} — this leg is unconfigured, not clean.`,
      ),
    );
    for (const reason of new Set(
      checks.filter((check) => check.kind === 'parity' && check.status === 'skipped').map((check) => check.message),
    )) {
      console.error(pc.red(`  · ${reason}`));
    }
  }
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
      parityUncovered,
      regressionFailures,
      regressionUncovered,
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
