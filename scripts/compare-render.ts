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
//
// Baselines live at tests/{tool}/baselines/{name}.json (tracked), keyed by column id.

import { compareSurfaceFingerprints, parseSurfaceFingerprint } from '@flighthq/surface';
import type { BrowserContext, Page } from '@playwright/test';
import pc from 'picocolors';

import { getBaselineField, setBaselineField } from './baseline-store.js';
import type { DetailTone, Tool } from './capture-core.js';
import {
  BACKEND_UNAVAILABLE,
  discoverEntries,
  formatDetailLine,
  formatStatusLine,
  formatSummaryCount,
  formatSummaryLine,
  installAbortHandler,
  isBrowserClosedError,
  launchBrowser,
  resolveServer,
  routeSegment,
} from './capture-core.js';

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

async function main(): Promise<void> {
  let entries = discoverEntries(tool, root);
  if (filter) entries = entries.filter((e) => e.name.includes(filter));
  if (entries.length === 0) {
    console.error(`No ${tool} entries found  filter="${filter}"`);
    process.exit(1);
  }

  console.log(`Starting ${tool} server…`);
  const server = await resolveServer({ tool, root });
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
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
      if (isAborted()) break;
      const entry = entries[entryIndex];
      // A progress header: a dimmed [N/M] counter then the entry name in bold, so the name reads as the
      // section break and the run shows steady progress per entry rather than going silent (looking hung).
      console.log(`${pc.dim(`[${entryIndex + 1}/${entries.length}]`)} ${pc.bold(entry.name)}`);
      // Only Flight raster columns are fingerprint-gated. DOM has no fingerprint; reference-library
      // columns (openfl, …) render a different engine, so they are captured (sha256) but not parity/
      // regression-gated against Flight. For a reference test this leaves flight:canvas/flight:webgl,
      // which are the same engine and so legitimately compared by parity.
      const renderers = entry.renderers.filter((r) => {
        const i = r.indexOf(':');
        const lib = i === -1 ? null : r.slice(0, i);
        const renderer = i === -1 ? r : r.slice(i + 1);
        if (renderer === 'dom') return false;
        if (lib !== null && lib !== 'flight') return false;
        return rendererFilter.length === 0 || rendererFilter.includes(r);
      });
      // Fingerprints of backends eligible for gating (self-stable / baselined).
      const eligible = new Map<string, string>();
      // Detail lines below the [N/M] header drop the entry name (the header carries it) and column-align
      // on the renderer/check label, so a run reads as an indented block per entry. 'parity' shares the
      // column with the renderer ids. statusLine colors the glyph + renderer name by verdict and dims a
      // routine message; detailLine is the low-level form for the neutral report/parity lines.
      const labelWidth = Math.max(6, ...renderers.map((r) => r.length));
      const statusLine = (tone: DetailTone, label: string, message: string): string =>
        formatStatusLine(tone, label, labelWidth, message);
      const detailLine = (glyph: string, label: string, message: string, paint: (s: string) => string): string =>
        formatDetailLine(glyph, label, labelWidth, message, paint);

      if (FINGERPRINT_SKIP.has(entry.name)) {
        skipped += renderers.length;
        continue;
      }

      for (const renderer of renderers) {
        if (isAborted()) break;
        const first = await loadFingerprint(context, server.url, entry.name, renderer);
        if (first.aborted) break;
        if (first.fingerprint === null) {
          if (first.unavailable) {
            console.log(statusLine('skip', renderer, `skipped — ${first.reason}`));
            skipped++;
          } else {
            // A real failure — the module failed to load, the render threw, or the verifier never ran.
            // Fail loudly; skipping here is what let broken tests pass as green.
            console.error(statusLine('fail', renderer, first.reason));
            loadFailures++;
          }
          continue;
        }
        const fingerprint = first.fingerprint;

        if (updateFingerprints) {
          // Self-stability: a second independent load must reproduce the frame, or the test animates
          // over real time and cannot be baselined.
          const second = await loadFingerprint(context, server.url, entry.name, renderer);
          if (second.aborted) break;
          const selfDistance = second.fingerprint ? distance(fingerprint, second.fingerprint) : null;
          if (selfDistance === null || selfDistance > stabilityEpsilon) {
            const note = `not baselined — nondeterministic (self-distance ${selfDistance?.toFixed(2) ?? 'n/a'})`;
            console.log(statusLine('skip', renderer, note));
            skipped++;
            continue;
          }
          setBaselineField(root, tool, entry.name, renderer, 'fingerprint', fingerprint);
          console.log(statusLine('pass', renderer, 'baseline written'));
          updated++;
          eligible.set(renderer, fingerprint);
          continue;
        }

        // Gate / report: only backends with a committed (proven-stable) baseline participate.
        const committed = getBaselineField(root, tool, entry.name, renderer, 'fingerprint');
        if (committed === null) {
          console.log(statusLine('muted', renderer, 'no fingerprint baseline — skipped'));
          skipped++;
          continue;
        }
        const dist = distance(fingerprint, committed);
        eligible.set(renderer, fingerprint);
        if (dist === null) {
          console.error(statusLine('fail', renderer, 'unreadable fingerprint baseline'));
          regressionFailures++;
        } else if (report) {
          console.log(detailLine(pc.dim('='), renderer, pc.dim(`regression distance ${dist.toFixed(2)}`), pc.dim));
        } else if (gateRegression) {
          if (dist > regressionTolerance) {
            console.error(statusLine('fail', renderer, `regression ${dist.toFixed(2)} > ${regressionTolerance}`));
            regressionFailures++;
          } else {
            console.log(statusLine('pass', renderer, `regression ${dist.toFixed(2)} ≤ ${regressionTolerance}`));
            regressionPasses++;
          }
        }
      }

      // An interrupt mid-entry leaves `eligible` partial; skip this entry's parity and stop.
      if (isAborted()) break;

      // Tier 3 (parity): cross-backend agreement among the eligible (baselined / self-stable) raster
      // backends, consolidated onto one line per entry with full pair names. Skipped for entries whose
      // backends legitimately render different content — a <video> decodes to a different frame per
      // backend/load, so the divergence is decode timing, not a bug. (Regression still gates them: each
      // backend is reproducible against its own baseline.)
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
          console.log(detailLine(pc.dim('~'), 'parity', pc.dim(segments), pc.dim));
        } else if (gateParity) {
          // Passing pairs dim so they recede; a failing pair stays red and stands out, and the line's
          // glyph + 'parity' label take the verdict color.
          let anyFailed = false;
          const segments = pairs
            .map((p) => {
              if (p.dist > parityTolerance) {
                anyFailed = true;
                parityFailures++;
                return pc.red(`${p.label} ${p.dist.toFixed(2)}>${parityTolerance}`);
              }
              parityPasses++;
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
          if (anyFailed) console.error(line);
          else console.log(line);
        }
      }
    }
  } finally {
    // The browser may already be closed by Playwright's own signal handler during an interrupt.
    await browser.close().catch(() => {});
    server.kill();
  }

  // An interrupted run reports its partial counts, then exits non-zero (130) so it is never mistaken for
  // a complete clean run — the counts reflect only the entries reached before Ctrl+C.
  const interrupted = isAborted();
  const note = interrupted ? pc.yellow('   — interrupted (partial run)') : '';

  // A load failure (a module that failed to load, a render that threw, a verifier that never ran) is a
  // hard breakage in every mode — it means a test was not actually exercised. It fails the process even
  // when baselining or reporting, so a broken test can never be mistaken for a clean/green run.
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
