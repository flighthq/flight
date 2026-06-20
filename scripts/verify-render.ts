// Differential + regression render verification (Tiers 3 and 5), complementing the in-page not-blank
// gate (capture --fail-on-error, Tiers 1/2/4). It drives the functional dev server, reads each
// backend's coarse render fingerprint (stashed on window.__ftVerification by the harness verifier),
// and compares them with the SDK's tolerant fingerprint metric:
//
//   - Tier 3 (differential): the raster backends of one test (canvas/webgl/webgpu) must agree within a
//     tolerance — they render the same scene, so a backend that diverges has a bug. No committed image.
//   - Tier 5 (regression): each backend's fingerprint must match a committed text baseline within a
//     tolerance — catches gross visual regressions. The baseline is ~1 KB of hex, not a PNG, and the
//     coarse averaging absorbs the sub-pixel antialiasing noise that made exact pixel hashes flaky.
//
// Only deterministic tests are gated. When (re)baselining, each backend's fingerprint is captured
// twice and a baseline is written only if the two agree (self-stable); a test that animates over real
// time (fill) is not byte-reproducible across loads, so it gets no baseline and is skipped from both
// tiers — it is still covered by the not-blank / error gate. Regression and differential run only for
// backends that have a committed baseline, i.e. ones already proven stable.
//
// Usage:
//   tsx ./scripts/verify-render.ts [--filter=name] [--renderer=canvas,webgl] [--frames=1]
//                                  [--report]                 print all distances, gate nothing
//                                  [--update-fingerprints]    rewrite baselines for self-stable tests
//                                  [--differential-tolerance=N] [--regression-tolerance=N]
//
// Fingerprint baselines live at tools/baselines/functional/{name}/{renderer}/fingerprint.txt (tracked).

import { compareSurfaceFingerprints, parseSurfaceFingerprint } from '@flighthq/surface';
import type { BrowserContext } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import { discoverEntries, launchBrowser, resolveServer } from './capture-core.js';

const argv = process.argv.slice(2);

function arg(key: string, fallback: string): string {
  const hit = argv.find((a) => a.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3) : fallback;
}

const filter = arg('filter', '');
const rendererFilter = arg('renderer', '').split(',').filter(Boolean);
const captureFrames = Math.max(1, parseInt(arg('frames', '1'), 10) || 1);
const report = argv.includes('--report');
const updateFingerprints = argv.includes('--update-fingerprints');
// Tier selection. Differential (Tier 3) compares two backends in the same run, so it is environment
// independent and safe to gate in any CI. Regression (Tier 5) compares against a committed baseline
// captured in one environment, so across a different GPU/driver it can drift — gate it only where the
// baseline was captured, and pass --no-regression elsewhere (the cross-environment CI gate).
const gateRegression = !argv.includes('--no-regression');
const gateDifferential = !argv.includes('--no-differential');
// Calibrated from a full run: same-backend run-to-run distance is ≤ ~1.2 for stable tests and ~30+ for
// an animated one; cross-backend agreement is ≤ ~6.5 even for the antialiasing-heavy filters. So a test
// is "self-stable" well under 4, regression noise is well under 5, and real divergence is well over 15.
const stabilityEpsilon = parseFloat(arg('stability-epsilon', '4'));
const regressionTolerance = parseFloat(arg('regression-tolerance', '5'));
const differentialTolerance = parseFloat(arg('differential-tolerance', '15'));

const root = process.cwd();
const baselineBase = resolve(root, 'tools', 'baselines', 'functional');

interface Verification {
  render: string;
  coverage: number | null;
  fingerprint: string | null;
}

function fingerprintBaselinePath(name: string, renderer: string): string {
  return join(baselineBase, name, renderer, 'fingerprint.txt');
}

function distance(a: string, b: string): number | null {
  const fa = parseSurfaceFingerprint(a);
  const fb = parseSurfaceFingerprint(b);
  if (fa === null || fb === null || fa.gridSize !== fb.gridSize) return null;
  return compareSurfaceFingerprints(fa, fb);
}

// Loads a single test/renderer page and returns its render fingerprint, or null with a reason
// (a page error, an absent backend, or a verifier that did not run in time).
async function loadFingerprint(
  context: BrowserContext,
  baseUrl: string,
  name: string,
  renderer: string,
): Promise<{ fingerprint: string | null; reason: string }> {
  const page = await context.newPage();
  let pageError = '';
  page.on('pageerror', (e) => (pageError ||= e.message));
  try {
    await page.goto(`${baseUrl}/tests/${name}/${renderer}/`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForSelector('canvas', { timeout: 8_000 }).catch(() => {});
    const verification = await page
      .waitForFunction(() => (window as unknown as { __ftVerification?: Verification }).__ftVerification, null, {
        timeout: 15_000,
      })
      .then((handle) => handle.jsonValue() as Promise<Verification>)
      .catch(() => null);
    if (verification?.fingerprint) return { fingerprint: verification.fingerprint, reason: '' };
    if (/WebGPU adapter|WebGPU device|requestAdapter/i.test(pageError))
      return { fingerprint: null, reason: 'backend unavailable' };
    return { fingerprint: null, reason: pageError || 'verifier did not run' };
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  let entries = discoverEntries('functional', root);
  if (filter) entries = entries.filter((e) => e.name.includes(filter));
  if (entries.length === 0) {
    console.error(`No functional tests found  filter="${filter}"`);
    process.exit(1);
  }

  console.log('Starting functional server…');
  const server = await resolveServer({ tool: 'functional', root });
  console.log(`Ready at ${server.url}\n`);
  const { browser, context } = await launchBrowser({ captureFrames });

  let regressionFailures = 0;
  let differentialFailures = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (const entry of entries) {
      // Only raster backends produce a fingerprint; DOM has none, WebGPU is absent in headless.
      const renderers = entry.renderers.filter(
        (r) =>
          !r.startsWith('reference:') && r !== 'dom' && (rendererFilter.length === 0 || rendererFilter.includes(r)),
      );
      // Fingerprints of backends eligible for gating (self-stable / baselined).
      const eligible = new Map<string, string>();

      for (const renderer of renderers) {
        const first = await loadFingerprint(context, server.url, entry.name, renderer);
        if (first.fingerprint === null) {
          console.log(`  ⊘  ${entry.name}/${renderer}: skipped — ${first.reason}`);
          skipped++;
          continue;
        }
        const fingerprint = first.fingerprint;
        const blPath = fingerprintBaselinePath(entry.name, renderer);

        if (updateFingerprints) {
          // Self-stability: a second independent load must reproduce the frame, or the test animates
          // over real time and cannot be baselined.
          const second = await loadFingerprint(context, server.url, entry.name, renderer);
          const selfDistance = second.fingerprint ? distance(fingerprint, second.fingerprint) : null;
          if (selfDistance === null || selfDistance > stabilityEpsilon) {
            console.log(
              `  ⊘  ${entry.name}/${renderer}: not baselined — nondeterministic (self-distance ${selfDistance?.toFixed(2) ?? 'n/a'})`,
            );
            skipped++;
            continue;
          }
          mkdirSync(join(baselineBase, entry.name, renderer), { recursive: true });
          writeFileSync(blPath, `${fingerprint}\n`);
          updated++;
          eligible.set(renderer, fingerprint);
          continue;
        }

        // Gate / report: only backends with a committed (proven-stable) baseline participate.
        if (!existsSync(blPath)) {
          console.log(`  ·  ${entry.name}/${renderer}: no fingerprint baseline — skipped`);
          skipped++;
          continue;
        }
        const dist = distance(fingerprint, readFileSync(blPath, 'utf8').trim());
        eligible.set(renderer, fingerprint);
        if (dist === null) {
          console.error(`  ✗  ${entry.name}/${renderer}: unreadable fingerprint baseline`);
          regressionFailures++;
        } else if (report) {
          console.log(`  =  ${entry.name}/${renderer}: regression distance ${dist.toFixed(2)}`);
        } else if (gateRegression && dist > regressionTolerance) {
          console.error(`  ✗  ${entry.name}/${renderer}: regression ${dist.toFixed(2)} > ${regressionTolerance}`);
          regressionFailures++;
        }
      }

      // Tier 3: cross-backend agreement among the eligible (baselined / self-stable) raster backends.
      const present = [...eligible.keys()];
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const [a, b] = [present[i], present[j]];
          const dist = distance(eligible.get(a)!, eligible.get(b)!);
          if (dist === null) continue;
          if (report) {
            console.log(`  ~  ${entry.name}: ${a} vs ${b} differential ${dist.toFixed(2)}`);
          } else if (gateDifferential && dist > differentialTolerance) {
            console.error(
              `  ✗  ${entry.name}: ${a} vs ${b} differential ${dist.toFixed(2)} > ${differentialTolerance}`,
            );
            differentialFailures++;
          }
        }
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  if (updateFingerprints) {
    console.log(`\nWrote ${updated} fingerprint baselines  (${skipped} skipped as nondeterministic/unavailable).`);
    return;
  }
  if (report) {
    console.log(`\nReport only — nothing gated  (${skipped} skipped).`);
    return;
  }
  console.log(
    `\nRegression failures: ${regressionFailures}  Differential failures: ${differentialFailures}  Skipped: ${skipped}`,
  );
  if (regressionFailures > 0 || differentialFailures > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
