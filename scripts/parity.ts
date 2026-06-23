/**
 * Test parity harness: TS (reference) vs Rust (port).
 *
 * Both codebases name tests after the exported function they cover — TS uses
 * `describe('functionName')` blocks, Rust uses `mod tests` with `fn function_name_*`.
 * This tool keys on that convention to measure FUNCTION-LEVEL coverage parity:
 * for every function the TS suite tests, does the mapped Rust crate have at least
 * one test covering it?
 *
 * Phase 1 (this script): non-visual unit-test coverage parity + optional run of
 * both suites. Phase 2 (functional/visual parity) is a separate harness that
 * renders shared scenes via flighthq-capture and diffs against TS baselines.
 *
 *   tsx ./scripts/parity.ts            # coverage report (markdown)
 *   tsx ./scripts/parity.ts --json     # machine-readable JSON
 *   tsx ./scripts/parity.ts --gaps     # only list missing-coverage functions
 *   tsx ./scripts/parity.ts --run      # also run `cargo test --workspace` and report pass/fail
 *   tsx ./scripts/parity.ts --functional  # also run the GPU functional parity gate (flighthq-functional)
 *   tsx ./scripts/parity.ts --crate geometry   # restrict to one package/crate
 *
 * The headline number is NATIVE-CORE unit parity, not raw function coverage.
 * Raw coverage undercounts true parity because two whole categories of gapped
 * functions are not validated by headless Rust unit tests by design:
 *
 *   - GPU-backend functions (render-gl/wgpu, filters-gl/wgpu, effects-gl/wgpu)
 *     are validated FUNCTIONALLY by the flighthq-functional render+fingerprint
 *     gate, not by unit tests. Their unit "gap" is expected.
 *   - Web-relocated functions (createWeb*Backend, *Backend, DOM attach/detach
 *     wiring) live in flighthq-host-web and are browser-validated, outside the
 *     headless scope entirely.
 *
 * So the headline excludes both categories from the denominator and reports the
 * real-core logic parity. The two excluded categories are reported separately:
 * GPU via the functional scene table, web as a browser-validated function count.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PKG_DIR = join(ROOT, 'packages');
const CRATE_DIR = join(ROOT, 'crates');

// TS package -> Rust crate. Now identity for every mapped package: the render
// reorg (landed 2026-06-22) adopted the `-gl`/`-wgpu` suffixes in TS natively,
// so the former `-webgl`->`-gl` / `-webgpu`->`-wgpu` divergence is gone, and the
// `world`->`scene` rename landed on both sides. The only non-identity cases are
// the TS_ONLY / RUST_ONLY sets below. Kept as an (empty) escape hatch for any
// future deliberate rename. See conformance.md "Renames".
const RENAMES: Record<string, string> = {};

// TS packages intentionally NOT ported to Rust: their substrate (the Canvas2D
// context + its measureText, CSS filter strings, the DOM tree, the Electron
// main process) does not exist in the box, so a crate would be an emulator. See
// conformance.md "Excluded — no substrate in the box". This is the complete
// excluded set; everything else maps 1:1. (The shaper SEAM `textshaper` IS
// ported — only its Canvas measureText backend `textshaper-canvas` is excluded,
// the native shaper backend being HarfBuzz/rustybuzz.)
const TS_ONLY = new Set([
  'displayobject-canvas',
  'displayobject-dom',
  'filters-canvas',
  'filters-css',
  'effects-canvas',
  'textshaper-canvas',
  'host-electron',
]);

// Rust crates with no TS counterpart: the native host layer, the headless
// capture gate, the conformance scene registry, and the in-box software
// display-object backend. See conformance.md "Rust-only (no TS counterpart)".
const RUST_ONLY = new Set(['capture', 'displayobject-skia', 'functional', 'host-winit', 'host-sdl', 'host-web']);

// GPU-backend crates: their functions are validated FUNCTIONALLY (render +
// fingerprint diff in flighthq-functional), not by headless unit tests. Keyed
// by Rust crate name, matching the `crate` field on a report. Post-reorg this
// is the two backend cores (render-gl/wgpu), the CPU-vs-GPU filter/effect
// backends (filters-/effects-gl/wgpu), and the per-subject leaf renderers the
// reorg split out (displayobject-/scene-gl/wgpu) — all produce shader output
// not meaningfully unit-testable by function name. See conformance.md
// "Validated functionally, not by unit name-match".
const GPU_CRATES = new Set([
  'render-gl',
  'render-wgpu',
  'filters-gl',
  'filters-wgpu',
  'effects-gl',
  'effects-wgpu',
  'displayobject-gl',
  'displayobject-wgpu',
  'scene-gl',
  'scene-wgpu',
]);

type GapCategory = 'gpu-backend' | 'web-relocated' | 'real-core';

// Platform-integration suite + app/process layer packages (the package-map
// "Platform Integration Suite" section). Their operations are host/OS-backed —
// the concrete behavior lives in a web backend (flighthq-host-web) or a native
// host, never in native-core logic. The core crate holds only the seam
// (get*/set*Backend, which ARE covered); the verbs (readClipboardText,
// showMessageDialog, …) are browser-validated, not headless-testable.
const WEB_PACKAGES = new Set([
  'app',
  'application',
  'protocol',
  'updater',
  'ipc',
  'platform',
  'clipboard',
  'dialog',
  'filesystem',
  'notification',
  'shell',
  'menu',
  'tray',
  'shortcut',
  'screen',
  'storage',
  'device',
  'share',
  'haptics',
  'geolocation',
  'webcam',
  'statusbar',
  'network',
  'power',
  'lifecycle',
  'keyboard',
  'sensors',
  'media',
]);

// DOM-bound functions that live in shared (non-host) packages but whose only
// implementation is a browser API (canvas/ImageBitmap/HTMLImageElement, Web
// Audio, blob/base64 decode, DOM event translation, DOM input wiring). These
// are web-relocated for the same reason as the host suite.
function isDomBoundFunction(fn: string): boolean {
  if (/From(DOM|Canvas|ImageBitmap|ImageElement|Blob|Base64|Name)/.test(fn)) return true;
  if (/^getAudioContext$/.test(fn)) return true;
  if (/(ImageResourceSource|ImageResourceSameOrigin)/.test(fn)) return true;
  if (/^createSurfaceFromCanvas$/.test(fn)) return true;
  if (/^connectInputToTextInput$/.test(fn)) return true;
  return false;
}

// Classify a single gapped TS function. GPU is decided by crate (validated by
// the functional render+fingerprint gate). Web-relocated reuses the prior
// unit-parity heuristic — web backend factories, *Backend seams, DOM
// attach/detach wiring — broadened to the platform/host-suite packages and the
// DOM-bound functions in shared packages. Everything else is genuine
// native-core logic whose missing Rust test is a real parity gap.
function classifyGap(fn: string, crate: string, pkg: string): GapCategory {
  if (GPU_CRATES.has(crate)) return 'gpu-backend';
  if (fn.startsWith('createWeb') || fn.endsWith('Backend')) return 'web-relocated';
  if (/^(attach|detach)[A-Z]/.test(fn)) return 'web-relocated';
  if (WEB_PACKAGES.has(pkg)) return 'web-relocated';
  if (isDomBoundFunction(fn)) return 'web-relocated';
  return 'real-core';
}

interface FunctionalParity {
  ran: boolean;
  reason?: string;
  confirmed: number; // scenes whose parity cell is PASS (diff <= tolerance)
  total: number; // scenes that map a TS baseline (PASS + FAIL + deferred)
  tolerance: number;
  scenes: { name: string; status: 'PASS' | 'FAIL' | 'deferred'; diff: number }[];
}

// Shell the GPU functional parity gate and parse its scene table. Returns
// `ran: false` with a reason when no GPU adapter is present (the runner prints a
// single notice line and exits 0) — never throws on the headless-CI path.
function runFunctionalParity(): FunctionalParity {
  let raw = '';
  try {
    raw = execSync('cargo run -p flighthq-functional -- --parity 2>/dev/null', {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return { ran: false, reason: 'functional runner errored', confirmed: 0, total: 0, tolerance: 0, scenes: [] };
  }

  if (/no adapter/i.test(raw)) {
    return { ran: false, reason: 'no GPU adapter', confirmed: 0, total: 0, tolerance: 0, scenes: [] };
  }

  const scenes: FunctionalParity['scenes'] = [];
  let tolerance = 0;
  for (const line of raw.split('\n')) {
    // A scene row's parity cell is the trailing field. We only count rows that
    // map a TS baseline: PASS/FAIL carry a diff; "deferred" maps a baseline but
    // has no wgpu fingerprint yet; "n/a" rows (pure-shape scenes) are skipped.
    const name = line.trimStart().split(/\s+/)[0];
    if (!name) continue;
    const pass = line.match(/\bPASS\s+([\d.]+)\s+\(<=\s*([\d.]+)\)\s*$/);
    const fail = line.match(/\bFAIL\s+([\d.]+)\s+\(<=\s*([\d.]+)\)\s*$/);
    if (pass) {
      scenes.push({ name, status: 'PASS', diff: Number(pass[1]) });
      tolerance = Number(pass[2]);
    } else if (fail) {
      scenes.push({ name, status: 'FAIL', diff: Number(fail[1]) });
      tolerance = Number(fail[2]);
    } else if (/\bdeferred\b/.test(line)) {
      scenes.push({ name, status: 'deferred', diff: -1 });
    }
  }

  const confirmed = scenes.filter((s) => s.status === 'PASS').length;
  return { ran: true, confirmed, total: scenes.length, tolerance, scenes };
}

function camelToSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.ts')) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

// Authoritative TS exported-function names per package, from the api extractor.
// Anchoring on real exports (not describe-block text) avoids false negatives
// where a package groups describes by theme (e.g. easing families) rather than
// by function — and aligns with the "one test per exported function" contract.
function loadTsExports(): Map<string, Set<string>> {
  const raw = execSync('npx tsx ./scripts/api.ts --json', {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const data = JSON.parse(raw.slice(raw.indexOf('{'))) as {
    packages: { name: string; functions: { name: string }[] }[];
  };
  const map = new Map<string, Set<string>>();
  for (const p of data.packages) {
    const pkg = p.name.replace(/^@flighthq\//, '');
    map.set(pkg, new Set(p.functions.map((f) => f.name)));
  }
  return map;
}

function tsCaseCount(pkg: string): number {
  let cases = 0;
  for (const f of listTsFiles(join(PKG_DIR, pkg, 'src'))) {
    cases += [...readFileSync(f, 'utf8').matchAll(/(^|\s)(it|test)\(\s*['"`]/g)].length;
  }
  return cases;
}

// Rust test function names for a crate (leaf names, e.g. `clone_matrix3_copies`).
function rustTestNames(crate: string): string[] {
  let raw = '';
  try {
    raw = execSync(`cargo test -p flighthq-${crate} -- --list`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^(.*?):\s*test\s*$/);
    if (!m) continue;
    const path = m[1].trim();
    names.push(path.split('::').pop() ?? path);
  }
  return names;
}

// A TS function is "covered" in Rust if its snake_case name appears as a token
// in any Rust test name — i.e. bounded by start/end or underscores. This matches
// the `function_name_does_x`, `test_function_name`, and exact-name conventions.
function isCovered(tsFn: string, rustTests: string[]): boolean {
  const snake = camelToSnake(tsFn);
  const re = new RegExp(`(^|_)${snake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(_|$)`);
  return rustTests.some((t) => re.test(t));
}

interface PairReport {
  pkg: string;
  crate: string;
  tsFns: number;
  tsCases: number;
  rustTests: number;
  covered: number;
  missing: string[];
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const gapsOnly = args.includes('--gaps');
  const doRun = args.includes('--run');
  const doFunctional = args.includes('--functional');
  const only = args.includes('--crate') ? args[args.indexOf('--crate') + 1] : null;

  const tsPkgs = readdirSync(PKG_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((p) => !TS_ONLY.has(p))
    .filter((p) => !only || p === only || RENAMES[p] === only);

  const crateExists = (c: string) => existsSync(join(CRATE_DIR, `flighthq-${c}`));
  const tsExports = loadTsExports();

  const reports: PairReport[] = [];
  const missingCrates: string[] = [];

  for (const pkg of tsPkgs.sort()) {
    const crate = RENAMES[pkg] ?? pkg;
    if (!crateExists(crate)) {
      missingCrates.push(`${pkg} -> flighthq-${crate} (crate missing)`);
      continue;
    }
    const fns = [...(tsExports.get(pkg) ?? new Set<string>())];
    const rust = rustTestNames(crate);
    const missing = fns.filter((fn) => !isCovered(fn, rust)).sort();
    reports.push({
      pkg,
      crate,
      tsFns: fns.length,
      tsCases: tsCaseCount(pkg),
      rustTests: rust.length,
      covered: fns.length - missing.length,
      missing,
    });
  }

  const totals = reports.reduce(
    (a, r) => ({
      tsFns: a.tsFns + r.tsFns,
      covered: a.covered + r.covered,
      tsCases: a.tsCases + r.tsCases,
      rustTests: a.rustTests + r.rustTests,
    }),
    { tsFns: 0, covered: 0, tsCases: 0, rustTests: 0 },
  );
  const pct = totals.tsFns ? ((totals.covered / totals.tsFns) * 100).toFixed(1) : '100.0';

  // Classify every gapped function into the three categories. The native-core
  // headline excludes the GPU and web categories from BOTH numerator and
  // denominator, leaving only logic that headless Rust unit tests are meant to
  // cover. GPU/web functions are validated elsewhere (functional gate / browser).
  const categories: Record<GapCategory, string[]> = { 'gpu-backend': [], 'web-relocated': [], 'real-core': [] };
  let gpuTotalFns = 0;
  let webTotalFns = 0;
  for (const r of reports) {
    if (GPU_CRATES.has(r.crate)) gpuTotalFns += r.tsFns;
    for (const fn of r.missing) {
      const cat = classifyGap(fn, r.crate, r.pkg);
      categories[cat].push(`${r.pkg}.${fn}`);
      if (cat === 'web-relocated') webTotalFns += 1;
    }
  }

  // Real-core denominator: every TS function MINUS the GPU-crate functions (all
  // of them, covered or not — they belong to the functional gate) MINUS the
  // web-relocated gapped functions (browser-validated). The real-core gap is the
  // count classified real-core; everything else in the denominator is covered.
  const coreDenom = totals.tsFns - gpuTotalFns - webTotalFns;
  const coreGap = categories['real-core'].length;
  const coreCovered = coreDenom - coreGap;
  const corePct = coreDenom ? ((coreCovered / coreDenom) * 100).toFixed(1) : '100.0';

  const breakdown = {
    gpuBackend: categories['gpu-backend'].length,
    webRelocated: categories['web-relocated'].length,
    realCore: categories['real-core'].length,
  };

  const functional = doFunctional ? runFunctionalParity() : null;

  const rustOnly = [...RUST_ONLY].filter(crateExists).map((c) => `flighthq-${c}`);

  if (jsonOut) {
    writeFileSync(
      join(ROOT, 'parity-report.json'),
      JSON.stringify(
        {
          totals: { ...totals, pct },
          nativeCore: { covered: coreCovered, total: coreDenom, pct: corePct },
          categories: {
            ...breakdown,
            gpuTotalFns,
            functions: categories,
          },
          functional: functional
            ? {
                ran: functional.ran,
                reason: functional.reason,
                confirmed: functional.confirmed,
                total: functional.total,
                tolerance: functional.tolerance,
                scenes: functional.scenes,
              }
            : null,
          reports,
          missingCrates,
          rustOnly,
        },
        null,
        2,
      ),
    );
    console.log(`parity-report.json written (native-core ${corePct}%, raw ${pct}% function coverage)`);
  } else {
    console.log(`# Test parity: TS (reference) -> Rust (port)\n`);
    console.log(
      `**Native-core unit parity: ${coreCovered}/${coreDenom} (${corePct}%)** ` +
        `— excludes GPU-backend (functional gate) and web-relocated (browser) functions.\n`,
    );
    console.log(
      `Raw function-level coverage: ${totals.covered}/${totals.tsFns} (${pct}%) · ` +
        `TS cases ${totals.tsCases} · Rust tests ${totals.rustTests}\n`,
    );
    console.log(`## Gap category breakdown\n`);
    console.log(
      `- **GPU-backend** (${breakdown.gpuBackend}): validated functionally by flighthq-functional, not unit tests`,
    );
    console.log(
      `- **web-relocated** (${breakdown.webRelocated}): createWeb*/\*Backend/DOM wiring in flighthq-host-web, browser-validated`,
    );
    console.log(`- **real-core** (${breakdown.realCore}): genuine native-core logic gaps\n`);
    if (!gapsOnly) {
      console.log(`| package | TS fns | covered | Rust tests | gap |`);
      console.log(`|---|---:|---:|---:|---:|`);
      for (const r of reports) {
        const gap = r.tsFns - r.covered;
        const flag = gap === 0 ? '' : ` ⚠️`;
        console.log(
          `| ${r.pkg}${r.crate !== r.pkg ? ` → ${r.crate}` : ''} | ${r.tsFns} | ${r.covered} | ${r.rustTests} | ${gap}${flag} |`,
        );
      }
      console.log('');
    }
    const withGaps = reports.filter((r) => r.missing.length);
    if (withGaps.length) {
      console.log(`## Coverage gaps (TS functions with no Rust test)\n`);
      for (const r of withGaps) {
        console.log(`- **${r.pkg}** (${r.missing.length}): ${r.missing.join(', ')}`);
      }
      console.log('');
    }
    if (missingCrates.length) console.log(`## Missing crates\n${missingCrates.map((m) => `- ${m}`).join('\n')}\n`);
    if (rustOnly.length) console.log(`## Rust-only crates (no TS source, expected)\n- ${rustOnly.join(', ')}\n`);
  }

  if (doRun) {
    console.log('## Running cargo test --workspace ...');
    try {
      const out = execSync('cargo test --workspace 2>&1', {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
      const failed = (out.match(/test result: FAILED/g) ?? []).length;
      const passLines = [...out.matchAll(/test result: ok\. (\d+) passed/g)].reduce((a, m) => a + Number(m[1]), 0);
      console.log(failed === 0 ? `Rust: PASS (${passLines} tests)` : `Rust: FAIL (${failed} failing binaries)`);
    } catch (e) {
      console.log(`Rust: FAIL (cargo test errored)\n${(e as Error).message.slice(0, 500)}`);
    }
  }

  if (functional && !jsonOut) {
    console.log(`\n## GPU functional parity (flighthq-functional --parity)\n`);
    if (!functional.ran) {
      console.log(`functional parity: skipped (${functional.reason})\n`);
    } else {
      const deferred = functional.scenes.filter((s) => s.status === 'deferred').length;
      const failed = functional.scenes.filter((s) => s.status === 'FAIL');
      console.log(
        `${functional.confirmed} of ${functional.total} TS scenes confirmed ` +
          `(webgpu fingerprint diff <= ${functional.tolerance})` +
          (deferred ? ` · ${deferred} deferred (no wgpu baseline)` : '') +
          '\n',
      );
      for (const s of functional.scenes) {
        const cell =
          s.status === 'deferred'
            ? 'deferred (no wgpu baseline)'
            : `${s.status} ${s.diff.toFixed(2)} (<= ${functional.tolerance})`;
        console.log(`- ${s.name}: ${cell}`);
      }
      if (failed.length) console.log(`\n⚠️ ${failed.length} scene(s) over tolerance — investigate as parity bugs.`);
      console.log('');
    }
  }

  if (!jsonOut) {
    console.log(`## Combined parity summary\n`);
    console.log(`- **Native-core unit parity:** ${coreCovered}/${coreDenom} (${corePct}%)`);
    if (functional) {
      if (functional.ran) {
        console.log(
          `- **GPU functional scenes confirmed:** ${functional.confirmed} of ${functional.total} ` +
            `(webgpu fingerprint diff <= ${functional.tolerance})`,
        );
      } else {
        console.log(`- **GPU functional scenes confirmed:** skipped (${functional.reason})`);
      }
    } else {
      console.log(`- **GPU functional scenes confirmed:** not run (pass --functional to include)`);
    }
    console.log(
      `- **Web-relocated functions:** ${breakdown.webRelocated} ` +
        `(browser-validated in flighthq-host-web, out of headless scope)`,
    );
    console.log('');
  }

  // Exit nonzero on a REAL-CORE gap (the honest gate) or a functional parity
  // FAIL. GPU-backend and web-relocated gaps are expected and never fail the
  // gate — they are validated by the functional gate and the browser instead.
  const functionalFailed = functional?.ran ? functional.scenes.some((s) => s.status === 'FAIL') : false;
  if (!jsonOut && (coreGap > 0 || functionalFailed)) process.exitCode = 1;
}

main();
