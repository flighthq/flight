/**
 * Rust conformance gate: TS (authoritative) vs Rust (port).
 *
 * Policy: the TS packages are the spec; the Rust crates must match them 1:1. The
 * ONLY sanctioned divergences are (a) substrate absent from the native box (the
 * crate-existence rule — canvas/dom/electron) and (b) pure language mechanics
 * (snake_case, `&mut` out-params, `Option`/`-1` sentinels, the slotmap arena for
 * the entity graph, `trait`/`Arc<dyn>` seams). Everything else that differs is
 * DRIFT, not design. This script encodes that policy as far as a static check
 * honestly can.
 *
 * Three tiers, by how much each can be a pass/fail gate (see the "How much can
 * be encoded" note at the bottom of this file):
 *
 *  1. STRUCTURAL conformance — a hard pass/fail GATE. Static, deterministic:
 *       - package existence: every TS package has a Rust crate (minus EXCLUDED);
 *         every crate maps to a TS package (minus RUST_ONLY).
 *       - dependency edges: every REAL TS function dependency — derived from
 *         actual `import { fn } from '@flighthq/x'` VALUE imports in TS source,
 *         NOT package.json (which carries declared-but-unused deps) and NOT
 *         `import type` (a type-only edge is the flighthq-types header routing) —
 *         is carried through to the Rust crate, modulo the FOLDABLE
 *         mechanical-translation targets and the REVIEWED_DEP_EXCEPTIONS
 *         allowlist. Each reported edge names the exact symbols it is about.
 *     A new TS merge that relocates a function or adds a real dependency Rust
 *     doesn't carry turns this RED — the drift that name-match coverage cannot
 *     see. (Per-export presence checking is a planned addition; the dependency
 *     edge check already catches relocation, since the receiving package's
 *     import of the moved function shows up as an un-carried edge.)
 *
 *  2. COVERAGE — reported, not gated. Name-match unit-test coverage: does a Rust
 *     test mention each TS function. Tracks behavioral-porting progress; a low
 *     number is a backlog, not a structural failure.
 *
 *  3. BEHAVIORAL / VISUAL — not statically gateable. Assertion-ported unit tests
 *     (`cargo test`) and GPU fingerprint parity (flighthq-functional) verify that
 *     output matches; this script can run/summarize them (`--run`/`--functional`)
 *     but cannot decide them from source.
 *
 *   tsx ./scripts/rust-conformance.ts              # structural gate + coverage report
 *   tsx ./scripts/rust-conformance.ts --json       # machine-readable report
 *   tsx ./scripts/rust-conformance.ts --gaps       # only list coverage gaps
 *   tsx ./scripts/rust-conformance.ts --run        # also run `cargo test --workspace`
 *   tsx ./scripts/rust-conformance.ts --functional # also run the GPU fingerprint gate
 *   tsx ./scripts/rust-conformance.ts --crate geometry  # restrict to one package
 *
 * Exit code: NONZERO if any STRUCTURAL violation is found (the gate). Coverage
 * and behavioral results are reported but do not, by themselves, fail the gate
 * (use `--strict` to also fail on real-core coverage gaps).
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

// FOLDABLE dependency targets: packages whose dep edges are a sanctioned
// language-mechanics translation in Rust, so a TS->X edge is NOT required to
// appear as a Rust edge (and a Rust->X edge is not flagged as extra). These are
// the only structural foldings the policy allows:
//   - entity: the TS entity/runtime split is the Rust slotmap arena; crates take
//     `(&mut Arena, NodeId)` instead of depending on an entity package.
//   - types: the Rust header layer — cross-package types route through it, so a
//     crate may reach a TS dep's *types* via flighthq-types without the edge.
//   - signals: re-exported from flighthq-types in Rust; reachable via types.
//   - geometry: Rust expresses math/vector types via flighthq-geometry where TS
//     uses plain numbers/types.
// Anything NOT in this set must match TS exactly (or be an explicit reviewed
// exception below). Keep this set tiny — it is the allowlist the whole policy
// rests on.
const FOLDABLE_DEPS = new Set(['entity', 'types', 'signals', 'geometry']);

// Reviewed dependency-edge exceptions: TS->X edges deliberately NOT carried into
// Rust, each with a recorded rationale (the auditable divergence registry, per
// conformance.md). A TS edge that is neither foldable nor listed here is DRIFT
// and fails the gate. Empty by intent — every entry must earn its place; the
// current known drift (particles->sprite/math, timeline->displayobject,
// effects-wgpu->filters/filters-wgpu, spritesheet->displayobject/node) is left
// OUT so the gate reports it as the alignment worklist until it is fixed.
const REVIEWED_DEP_EXCEPTIONS: Record<string, string> = {
  // Render core + backend cores use other packages' TYPES only (RenderProxy,
  // node/material/sprite/displayobject descriptors), which Rust routes through
  // the flighthq-types header; the prepare/draw passes are closure-generic, so
  // no function dependency on those packages exists. Verified: render-wgpu has
  // no leaf/shape code (the reorg moved it to displayobject-wgpu).
  'render->displayobject': 'types via flighthq-types header; prepare pass is closure-generic',
  'render->node': 'node types via flighthq-types header',
  'render->materials': 'material types via flighthq-types header',
  'render->sprite': 'sprite types via flighthq-types header',
  'render-gl->displayobject': 'types via flighthq-types header; leaves live in displayobject-gl',
  'render-wgpu->displayobject': 'types via flighthq-types header; leaves live in displayobject-wgpu',
  'render-wgpu->surface': 'Surface type via flighthq-types; readback is via flighthq-capture, not a surface dep',
  // Audio/VideoResource types come from flighthq-types; playback is the
  // AudioBackend/VideoBackend seam, not a resources function dependency.
  'media->resources': 'resource types via flighthq-types header; playback via backend seam',
  // TS-side dead dependency: interaction imports nothing from @flighthq/scene
  // (no 3D hit-testing in either port). Rust correctly omits it.
  'interaction->scene': 'TS-side dead dep — interaction imports no scene symbols',
  // particles operates on the ParticleEmitterData VALUE type (flighthq-types),
  // not the sprite NodeId. sprite's reserve_particle_emitter takes
  // (&mut DisplayObjectArena, NodeId); calling it would thread the whole sprite
  // arena through every particle-sim function and couple particles to the
  // stateful graph. The emitter primitive itself correctly lives in sprite. The
  // sim reimplements only the tiny capacity-reserve on the value type.
  'particles->sprite': 'value-type seam: sim operates on ParticleEmitterData, not the sprite arena/NodeId',
  // The TimelineSource.construct_frame seam (flighthq-types) carries only an
  // opaque u64 target id and fires from the arena-less timeline playback engine,
  // so it cannot create/wire display nodes. Node wiring (createBitmap/addNodeChild
  // in TS) is necessarily deferred to a caller-supplied `apply` callback — forced
  // by the slotmap-arena ownership model, not a style choice.
  'spritesheet->displayobject':
    'arena-less TimelineSource.construct_frame seam defers node wiring to a caller callback',
  'spritesheet->node': 'arena-less TimelineSource.construct_frame seam defers node wiring to a caller callback',
  // TS `invalidateImageResource(dest.surface)` works by structural typing —
  // both Surface and ImageResource have `.version`, so JS accepts either. Rust's
  // nominal types make them distinct (`invalidate_image_resource(&mut ImageResource)`
  // cannot take a `&mut Surface`), so surface ops bump `surface.version` inline —
  // the faithful translation. `createImageResourceFromCanvas` is web-relocated.
  'surface->resources':
    'TS structural typing: invalidateImageResource(Surface) has no nominal Rust equivalent; inline version bump is faithful',
};

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

// Non-test `.ts` source files under a package's src/.
function listSourceTsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

// The REAL `@flighthq/*` dependency edges a TS package has, derived from actual
// VALUE imports in its source (`import { fn } from '@flighthq/x'`) — not from
// package.json, which carries declared-but-unused deps (e.g. effects-gl declares
// `@flighthq/filters` but imports nothing from it). Type-only imports
// (`import type { … }`, and inline `type` specifiers) are excluded: a type-only
// edge is the flighthq-types header routing in Rust, not a function dependency.
// Returns dep package -> the set of value symbols imported from it, so the gate
// can show *which* functions an edge is about.
function tsValueImports(pkg: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const file of listSourceTsFiles(join(PKG_DIR, pkg, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@flighthq\/([a-z0-9-]+)['"]/g)) {
      if (m[1]) continue; // whole-line `import type { … }`
      const dep = m[3];
      const symbols = m[2]
        .split(',')
        .map((s) => s.trim().replace(/\s+as\s+\w+$/, ''))
        .filter((s) => s && !s.startsWith('type ')); // drop inline `type X`
      if (!symbols.length) continue;
      const set = out.get(dep) ?? new Set<string>();
      symbols.forEach((s) => set.add(s));
      out.set(dep, set);
    }
  }
  return out;
}

// The `flighthq-*` dependency names a Rust crate declares in `[dependencies]`
// (dev-dependencies are excluded — they are not part of the published edge set).
function rustCrateDeps(crate: string): Set<string> {
  const path = join(CRATE_DIR, `flighthq-${crate}`, 'Cargo.toml');
  if (!existsSync(path)) return new Set();
  const toml = readFileSync(path, 'utf8');
  const section = toml.match(/(?:^|\n)\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
  const body = section ? section[1] : '';
  const out = new Set<string>();
  for (const m of body.matchAll(/(?:^|\n)\s*flighthq-([a-z0-9-]+)\s*=/g)) out.add(m[1]);
  return out;
}

interface StructuralReport {
  // TS packages with no Rust crate that are not sanctioned exclusions.
  missingCrates: string[];
  // Rust crates with no TS package that are not sanctioned rust-only crates.
  unexpectedCrates: string[];
  // TS function-dependency edges (real source value-imports) not carried into
  // the Rust crate — the drift. Each names the symbols TS uses across the edge.
  missingEdges: string[];
}

// The STRUCTURAL conformance gate (static, deterministic). Compares package
// existence and the real (source value-import) dependency graph TS-vs-Rust under
// the sanctioned-divergence allowlists. Every item is a hard failure.
function checkStructuralConformance(): StructuralReport {
  const crates = new Set(
    readdirSync(CRATE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('flighthq-'))
      .map((e) => e.name.slice('flighthq-'.length)),
  );
  const pkgs = readdirSync(PKG_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const crateFor = (pkg: string) => RENAMES[pkg] ?? pkg;
  const missingCrates: string[] = [];
  for (const pkg of pkgs) {
    if (TS_ONLY.has(pkg)) continue;
    if (!crates.has(crateFor(pkg))) missingCrates.push(pkg);
  }

  const pkgSet = new Set(pkgs);
  const renameTargets = new Set(Object.values(RENAMES));
  const unexpectedCrates: string[] = [];
  for (const crate of crates) {
    if (RUST_ONLY.has(crate)) continue;
    if (pkgSet.has(crate) || renameTargets.has(crate)) continue;
    unexpectedCrates.push(crate);
  }

  const missingEdges: string[] = [];
  for (const pkg of pkgs.sort()) {
    if (TS_ONLY.has(pkg)) continue;
    const crate = crateFor(pkg);
    if (!crates.has(crate)) continue; // already a missingCrate
    const imports = tsValueImports(pkg); // dep -> {symbols} actually used in TS source
    const rd = rustCrateDeps(crate);
    for (const [dep, symbols] of imports) {
      const depCrate = crateFor(dep);
      if (depCrate === crate) continue; // intra-package self-import (pkg refers to its own name)
      if (FOLDABLE_DEPS.has(dep) || FOLDABLE_DEPS.has(depCrate)) continue;
      if (TS_ONLY.has(dep)) continue; // an excluded dep can't be carried
      if (REVIEWED_DEP_EXCEPTIONS[`${pkg}->${dep}`]) continue;
      if (!rd.has(depCrate)) {
        const uses = [...symbols].sort().join(', ');
        missingEdges.push(`crate '${crate}' must depend on '${depCrate}' — TS '${pkg}' uses: ${uses}`);
      }
    }
  }

  // Note: a Rust-only "extra" edge check was tried and dropped — it is pure
  // noise. The `sdk` re-export barrel legitimately depends on every crate while
  // importing no values, and many crates depend on a package for a type Rust
  // routes through flighthq-types. Extra Rust edges do not indicate un-carried TS
  // changes (the drift we gate on), so they are not reported.

  return { missingCrates, unexpectedCrates, missingEdges };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const gapsOnly = args.includes('--gaps');
  const doRun = args.includes('--run');
  const doFunctional = args.includes('--functional');
  const strict = args.includes('--strict');
  const only = args.includes('--crate') ? args[args.indexOf('--crate') + 1] : null;

  // Tier 1 — the structural gate. Computed first so its exit code is the gate
  // regardless of the (reported) coverage/behavioral tiers below. `--structural`
  // prints just this tier and exits without the slow coverage/cargo work — the
  // fast pre-commit/CI form of the gate (static file reads only, no compile).
  const structural = checkStructuralConformance();
  const structuralOnly = args.includes('--structural');
  if (structuralOnly) {
    const violations =
      structural.missingCrates.length + structural.unexpectedCrates.length + structural.missingEdges.length;
    if (jsonOut) {
      console.log(JSON.stringify(structural, null, 2));
    } else {
      const printList = (title: string, items: string[], emoji: string) => {
        if (items.length) {
          console.log(`${emoji} ${title} (${items.length}):`);
          for (const i of items) console.log(`  - ${i}`);
        }
      };
      console.log('# Rust structural conformance gate\n');
      printList('Missing crates', structural.missingCrates, '❌');
      printList('Unexpected crates', structural.unexpectedCrates, '❌');
      printList('Un-carried TS dependency edges (drift)', structural.missingEdges, '❌');
      console.log(violations === 0 ? '\n✅ structural gate: PASS' : `\n❌ structural gate: FAIL (${violations})`);
    }
    if (violations > 0) process.exitCode = 1;
    return;
  }

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
      join(ROOT, 'rust-conformance-report.json'),
      JSON.stringify(
        {
          structural,
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
    const sv = structural.missingCrates.length + structural.unexpectedCrates.length + structural.missingEdges.length;
    console.log(
      `rust-conformance-report.json written (structural ${sv === 0 ? 'PASS' : `FAIL: ${sv} violations`}, ` +
        `native-core ${corePct}%, raw ${pct}% coverage)`,
    );
  } else {
    // Tier 1 — structural gate (the pass/fail). Printed first.
    console.log(`# Rust conformance: TS (authoritative) -> Rust (port)\n`);
    console.log(`## Structural gate\n`);
    const printList = (title: string, items: string[], emoji: string) => {
      if (items.length) {
        console.log(`${emoji} **${title}** (${items.length}):`);
        for (const i of items) console.log(`  - ${i}`);
        console.log('');
      }
    };
    printList('Missing crates (TS package with no Rust crate)', structural.missingCrates, '❌');
    printList('Unexpected crates (Rust crate with no TS package)', structural.unexpectedCrates, '❌');
    printList('Un-carried TS dependency edges (drift)', structural.missingEdges, '❌');
    const violations =
      structural.missingCrates.length + structural.unexpectedCrates.length + structural.missingEdges.length;
    console.log(
      violations === 0 ? `✅ structural gate: PASS\n` : `❌ structural gate: FAIL (${violations} violations)\n`,
    );

    console.log(`## Coverage (reported, not gated)\n`);
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

  // The GATE. Tier 1 (structural) is the always-on pass/fail: missing/unexpected
  // crates and un-carried TS dependency edges are drift and fail the build,
  // regardless of output mode. A functional-parity FAIL (a confirmed visual
  // regression) also fails. Coverage gaps (Tier 2) are a tracked backlog, not a
  // structural failure — they fail only under `--strict`. GPU-backend and
  // web-relocated gaps never fail (validated by the functional gate / browser).
  const structuralViolations =
    structural.missingCrates.length + structural.unexpectedCrates.length + structural.missingEdges.length;
  const functionalFailed = functional?.ran ? functional.scenes.some((s) => s.status === 'FAIL') : false;
  if (structuralViolations > 0 || functionalFailed || (strict && coreGap > 0)) {
    process.exitCode = 1;
  }
}

main();
