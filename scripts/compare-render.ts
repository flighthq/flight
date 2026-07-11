// Parity + regression render verification (Tiers 3 and 5), complementing the in-page smoke gate
// (capture --fail-on-error, Tiers 1/2/4). It drives the functional or examples dev server
// (--tool, default functional), reads each backend's coarse render fingerprint (stashed on
// window.__ftVerification by the harness/examples verifier), and compares them with the SDK's tolerant
// fingerprint metric:
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
// Run via the npm scripts: `test:{functional,examples}:parity` (cross-backend) and `:regression`
// (vs committed baseline), `:regression:baseline` to rewrite fingerprints. The sibling `:smoke`
// script is the separate builds-and-runs / not-blank gate (capture --fail-on-error); the
// `test:{functional,examples}` umbrella runs smoke then this script (both tiers).
//
// Usage:
//   tsx ./scripts/compare-render.ts [--tool=functional|examples] [--filter=name] [--renderer=canvas,webgl]
//                                   [--frames=N]                 frame to capture (examples: 30)
//                                   [--report]                   print all distances, gate nothing
//                                   [--update-fingerprints]      rewrite baselines for self-stable entries
//                                   [--no-regression] [--no-parity]
//                                   [--parity-tolerance=N] [--regression-tolerance=N]
//                                   [--dev]                      use Vite dev server (default: static)
//                                   [--build]                    force rebuild before serving
//                                   [--sequential]               disable parallel entry processing
//                                   [--parallel=N]               override worker count (default: 6)
//
// Baselines live at tests/{tool}/baselines/{name}.json (tracked), keyed by column id.

import { compareSurfaceFingerprints, parseSurfaceFingerprint } from '@flighthq/surface';
import type { DetailTone, Tool } from '@flighthq/tool-capture';
import {
  BACKEND_UNAVAILABLE,
  discoverEntries,
  formatDetailLine,
  formatStatusLine,
  formatSummaryCount,
  formatSummaryLine,
  getBaselineField,
  installAbortHandler,
  isBrowserClosedError,
  launchBrowser,
  rendererMatchesFilter,
  resolveServer,
  resolveStaticServer,
  routeSegment,
  setBaselineField,
} from '@flighthq/tool-capture';
import type { BrowserContext, Page } from '@playwright/test';
import pc from 'picocolors';

const argv = process.argv.slice(2);

function arg(key: string, fallback: string): string {
  const hit = argv.find((a) => a.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3) : fallback;
}

// 'functional' tests render their scene at frame 1; examples often animate, so they are
// captured at a later frame (pass --frames=30). Each backend's verifier stashes window.__ftVerification
// with the fingerprint, and routes are /tests/… vs /examples/…; everything else is identical.
const tool = arg('tool', 'functional') as Tool;
const routePrefix = tool === 'examples' ? 'examples' : 'tests';
const filter = arg('filter', '');
const rendererFilter = arg('renderer', '').split(',').filter(Boolean);
const captureFrames = Math.max(1, parseInt(arg('frames', '1'), 10) || 1);
const report = argv.includes('--report');
const updateFingerprints = argv.includes('--update-fingerprints');
// Tier selection. Parity (Tier 3) compares two backends in the same run, so it is environment
// independent and safe to gate in any CI. Regression (Tier 5) compares against a committed baseline
// captured in one environment, so across a different GPU/driver it can drift — gate it only where the
// baseline was captured, and pass --no-regression elsewhere (the cross-environment CI gate).
const gateRegression = !argv.includes('--no-regression');
const gateParity = !argv.includes('--no-parity');
// Calibrated from a full run: same-backend run-to-run distance is ≤ ~1.2 for stable tests and ~30+ for
// an animated one; cross-backend agreement is ≤ ~6.5 even for the antialiasing-heavy filters. So a test
// is "self-stable" well under 4, regression noise is well under 5, and real divergence is well over 15.
const stabilityEpsilon = parseFloat(arg('stability-epsilon', '4'));
const regressionTolerance = parseFloat(arg('regression-tolerance', '5'));
const parityTolerance = parseFloat(arg('parity-tolerance', '15'));
// --dev opts into the Vite dev server; static is the default (same as capture.ts).
const useDev = argv.includes('--dev');
// --build forces a rebuild even when dist already exists.
const forceBuild = argv.includes('--build');
// --sequential opts out of parallel entry processing; parallel is the default.
const useParallel = !argv.includes('--sequential');
// --parallel=N overrides the worker count.
const parallelArg = argv.find((a) => a === '--parallel' || a.startsWith('--parallel='));
const workerCount = parallelArg?.includes('=') ? Math.max(1, parseInt(parallelArg.split('=')[1], 10) || 6) : 6;

const root = process.cwd();

// Entries excluded from fingerprint verification entirely — they produce no meaningful rendered
// pixels (audio-only, etc.) and intentionally skip the in-page verifier (VERIFY_SKIP in
// examples/runners/web/vite.config.ts). They still get the Tier 1/2/4 error gate via --fail-on-error.
const FINGERPRINT_SKIP = new Set<string>(['playingsound']);

// Entries excluded from the cross-backend parity check. A string value skips all pairs; an array
// of backend names excludes those backends from the pair matrix (remaining backends still compare).
// Examples: 'effect-foo' skips parity entirely; ['canvas'] excludes canvas so only webgl·webgpu is
// checked. Entries here render genuinely different content per backend (video timing), use an
// approximate backend (canvas 2D compositing vs GPU shader), or hit unavoidable GPU precision
// divergence — not a renderer bug. They are still regression-gated per backend.
const PARITY_SKIP = new Map<string, 'all' | string[]>([
  ['playingvideo', 'all'],
  // Canvas effect runners approximate GPU shaders with 2D compositing — structural divergence, not bugs.
  ['effect-hue-saturation', ['canvas']],
  ['effect-lens-distortion', ['canvas']],
  ['effect-lens-flare', ['canvas']],
  ['effect-posterize', ['canvas']],
  ['effect-vignette', ['canvas']],
  // GPU floating-point precision divergence compounds across multi-step ray marches / sampling.
  ['effect-displacement', 'all'],
  ['effect-god-rays', 'all'],
  ['effect-screen-space-fog', 'all'],
]);

interface Verification {
  render: string;
  coverage: number | null;
  fingerprint: string | null;
}

function distance(a: string, b: string): number | null {
  const fa = parseSurfaceFingerprint(a);
  const fb = parseSurfaceFingerprint(b);
  if (fa === null || fb === null || fa.gridSize !== fb.gridSize) return null;
  return compareSurfaceFingerprints(fa, fb);
}

// Loads a single test/renderer page and returns its render fingerprint, or null with a reason and a
// flag marking whether the cause is a genuinely-unavailable backend (skippable) versus a real error.
async function loadFingerprint(
  context: BrowserContext,
  baseUrl: string,
  name: string,
  renderer: string,
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
    await page.goto(`${baseUrl}/${routePrefix}/${name}/${routeSegment(renderer)}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.waitForSelector('canvas', { timeout: 8_000 }).catch(() => {});
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
          return (v != null && v.fingerprint !== null) || document.getElementById('ft-error') !== null;
        },
        null,
        { timeout: 15_000, polling: 100 },
      )
      .catch(() => {});
    const verification = await page
      .evaluate(() => (window as unknown as { __ftVerification?: Verification }).__ftVerification ?? null)
      .catch(() => null);
    if (verification?.fingerprint)
      return { fingerprint: verification.fingerprint, reason: '', unavailable: false, aborted: false };
    // The functional entry paints any error into #ft-error (covering window.error AND unhandledrejection);
    // read it as the most reliable real reason when neither a fingerprint nor a pageerror surfaced.
    const overlay = await page.$eval('#ft-error', (el) => el.textContent ?? '').catch(() => '');
    const detail = pageError || overlay;
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
  context: BrowserContext,
  baseUrl: string,
  entry: { name: string; renderers: string[] },
  entryIndex: number,
  totalEntries: number,
  isAborted: () => boolean,
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

  const renderers = entry.renderers.filter((r) => {
    const i = r.indexOf(':');
    const lib = i === -1 ? null : r.slice(0, i);
    const renderer = i === -1 ? r : r.slice(i + 1);
    if (renderer === 'dom') return false;
    if (lib !== null && lib !== 'flight') return false;
    return rendererMatchesFilter(r, rendererFilter);
  });

  const labelWidth = Math.max(6, ...renderers.map((r) => r.length));
  const statusLine = (tone: DetailTone, label: string, message: string): string =>
    formatStatusLine(tone, label, labelWidth, message);
  const detailLine = (glyph: string, label: string, message: string, paint: (s: string) => string): string =>
    formatDetailLine(glyph, label, labelWidth, message, paint);

  if (FINGERPRINT_SKIP.has(entry.name)) {
    result.skipped += renderers.length;
    return result;
  }

  const eligible = new Map<string, string>();

  for (const renderer of renderers) {
    if (isAborted()) break;
    const first = await loadFingerprint(context, baseUrl, entry.name, renderer);
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

    if (updateFingerprints) {
      const second = await loadFingerprint(context, baseUrl, entry.name, renderer);
      if (second.aborted) break;
      const selfDistance = second.fingerprint ? distance(fingerprint, second.fingerprint) : null;
      if (selfDistance === null || selfDistance > stabilityEpsilon) {
        const note = `not baselined — nondeterministic (self-distance ${selfDistance?.toFixed(2) ?? 'n/a'})`;
        result.output.push(statusLine('skip', renderer, note));
        result.skipped++;
        continue;
      }
      setBaselineField(root, tool, entry.name, renderer, 'fingerprint', fingerprint);
      result.output.push(statusLine('pass', renderer, 'baseline written'));
      result.updated++;
      eligible.set(renderer, fingerprint);
      continue;
    }

    const committed = getBaselineField(root, tool, entry.name, renderer, 'fingerprint');
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
    } else if (report) {
      result.output.push(detailLine(pc.dim('='), renderer, pc.dim(`regression distance ${dist.toFixed(2)}`), pc.dim));
    } else if (gateRegression) {
      if (dist > regressionTolerance) {
        result.output.push(statusLine('fail', renderer, `regression ${dist.toFixed(2)} > ${regressionTolerance}`));
        result.regressionFailures++;
      } else {
        result.output.push(statusLine('pass', renderer, `regression ${dist.toFixed(2)} ≤ ${regressionTolerance}`));
        result.regressionPasses++;
      }
    }
  }

  if (isAborted()) return result;

  // Tier 3 (parity): cross-backend agreement among the eligible (baselined / self-stable) raster
  // backends.
  const skip = PARITY_SKIP.get(entry.name);
  const present = skip === 'all' ? [] : [...eligible.keys()].filter((r) => !skip?.includes(r));
  const pairs: { label: string; dist: number }[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const [a, b] = [present[i], present[j]];
      const dist = distance(eligible.get(a)!, eligible.get(b)!);
      if (dist !== null) pairs.push({ label: `${a}·${b}`, dist });
    }
  }
  if (pairs.length > 0) {
    if (report) {
      const segments = pairs.map((p) => `${p.label} ${p.dist.toFixed(2)}`).join('  ');
      result.output.push(detailLine(pc.dim('~'), 'parity', pc.dim(segments), pc.dim));
    } else if (gateParity) {
      let anyFailed = false;
      const segments = pairs
        .map((p) => {
          if (p.dist > parityTolerance) {
            anyFailed = true;
            result.parityFailures++;
            return pc.red(`${p.label} ${p.dist.toFixed(2)}>${parityTolerance}`);
          }
          result.parityPasses++;
          return pc.dim(`${p.label} ${p.dist.toFixed(2)}`);
        })
        .join('  ');
      const paint = anyFailed ? pc.red : pc.green;
      const line = detailLine(
        paint(anyFailed ? '✗' : '✓'),
        'parity',
        `${segments}  ${pc.dim(`(≤${parityTolerance})`)}`,
        paint,
      );
      result.output.push(line);
    }
  }

  return result;
}

async function main(): Promise<void> {
  let entries = discoverEntries(tool, root);
  if (filter) entries = entries.filter((e) => e.name.includes(filter));
  if (entries.length === 0) {
    console.error(`No ${tool} entries found  filter="${filter}"`);
    process.exit(1);
  }

  if (useDev) {
    console.log(`Starting ${tool} dev server…`);
  } else if (forceBuild) {
    console.log(`Building and serving ${tool} dist…`);
  } else {
    console.log(`Serving ${tool} dist (use --build to rebuild, --dev for the Vite server)…`);
  }

  const server = useDev ? await resolveServer({ tool, root }) : await resolveStaticServer({ tool, root, forceBuild });
  console.log(`Ready at ${server.url}\n`);
  const { browser, context } = await launchBrowser({ captureFrames });

  const isAborted = installAbortHandler();

  let regressionFailures = 0;
  let parityFailures = 0;
  let regressionPasses = 0;
  let parityPasses = 0;
  let loadFailures = 0;
  let updated = 0;
  let skipped = 0;

  try {
    if (useParallel) {
      const jobs = entries.map((entry, i) => ({ entry, index: i }));
      const activeWorkers = Math.min(workerCount, jobs.length);
      const workers = Array.from({ length: activeWorkers }, async () => {
        while (true) {
          if (isAborted()) break;
          const job = jobs.shift();
          if (!job) break;
          const result = await processEntry(context, server.url, job.entry, job.index, entries.length, isAborted);
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
        const result = await processEntry(
          context,
          server.url,
          entries[entryIndex],
          entryIndex,
          entries.length,
          isAborted,
        );
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
    await browser.close().catch(() => {});
    server.kill();
  }

  const interrupted = isAborted();
  const note = interrupted ? pc.yellow('   — interrupted (partial run)') : '';

  if (updateFingerprints) {
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
      process.exit(1);
    }
    if (interrupted) process.exit(130);
    return;
  }
  if (report) {
    console.log(
      '\n' +
        formatSummaryLine(loadFailures > 0, [
          formatSummaryCount(skipped, 'skipped', 'warn'),
          formatSummaryCount(loadFailures, 'load failures', 'fail'),
        ]) +
        pc.dim('   (report only — nothing gated)') +
        note,
    );
    if (loadFailures > 0) process.exit(1);
    if (interrupted) process.exit(130);
    return;
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
  if (failed) process.exit(1);
  if (interrupted) process.exit(130);
}

main().catch((err: unknown) => {
  // A closed browser/page reject is the interrupt racing teardown — exit quietly, not with a raw stack.
  if (isBrowserClosedError(err)) process.exit(130);
  console.error(err);
  process.exit(1);
});
