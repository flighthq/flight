// API & Structural Alignment Review
// =================================
// A multi-dimension audit of whether the SDK follows its own conventions. Each agent writes its own
// Markdown doc; each dimension also gets one cross-cutting synthesis doc. Dimensions are independent
// and run concurrently — select a subset with args.dimensions to scope cost.
//
// DIMENSIONS (args.dimensions, default = all four):
//   api       — per-package: do exported function/type names follow the SDK API conventions?
//   filenames — per-package: removed of their folder, is each filename self-describing of domain?
//   deps      — per-package dependency hygiene + a global dependency-graph synthesis.
//   ts-rust   — per mapped pair: does the Rust crate track the TS package (names/methods/files)?
//               PLUS each `-rs` wasm drop-in (e.g. surface-rs) vs its base TS package — the most
//               important conformance target, since a drop-in that drifts is silently broken.
//
// This review is the JUDGMENT layer. It COMPLEMENTS the machine-checkable gates and should reference
// (not duplicate) them: `npm run api`/`api:json`, `npm run packages:check`, `npm run order`,
// `npm run rust:conformance`, `npm run mixing:conformance`. Agents run those and report only what
// the gates miss.
//
// Output (each agent writes its own file):
//   <root>/tools/agents/docs/reviews/alignment/api/<pkg>.md        + api/_consistency.md
//   <root>/tools/agents/docs/reviews/alignment/filenames/<pkg>.md  + filenames/_global.md
//   <root>/tools/agents/docs/reviews/alignment/deps/<pkg>.md       + deps/_graph.md
//   <root>/tools/agents/docs/reviews/alignment/ts-rust/<pkg>.md    + ts-rust/_divergence.md
// Returns { findings[] } summaries; build alignment/index.md from those after the run.
//
// COST: all four dimensions ≈ (86×3 + 78 + 4 synthesis) ≈ 340 agents. Scope down with:
//   Workflow({ name: 'api-alignment-review', args: { dimensions: ['filenames'] } })
//   Workflow({ name: 'api-alignment-review', args: { dimensions: ['api','ts-rust'], packages: ['easing','path'] } })
//
// IMPROVE FOR FUTURE RUNS: retune the *_CHECKLIST strings (the encoded conventions), the TS_ONLY /
// RUST_ONLY sets when crates are added/removed, or add a new dimension to DIMENSION_KEYS + the
// builders. Re-derive TS_ONLY/RUST_ONLY with:
//   comm -23 <(ls packages|sort) <(ls crates|sed 's/^flighthq-//'|sort)   # TS-only
//   comm -13 <(ls packages|sort) <(ls crates|sed 's/^flighthq-//'|sort)   # Rust-only
//
// args shape (all optional): { root, packages: string[], dimensions: string[], tsOnly: string[], rustOnly: string[] }

export const meta = {
  name: 'api-alignment-review',
  description:
    'Audit the SDK against its own conventions across four dimensions — API naming/verbs/out-params, filename descriptiveness, dependency hygiene, and TS↔Rust alignment — each agent writing its own doc.',
  whenToUse:
    'Periodic convention/consistency audit: API naming, file names, dependency mapping, and TS-upstream↔Rust-downstream sync.',
  phases: [
    { title: 'api', detail: 'per-package API convention audit + global consistency synthesis' },
    { title: 'filenames', detail: 'per-package filename descriptiveness audit + global synthesis' },
    { title: 'deps', detail: 'per-package dependency hygiene + global graph synthesis' },
    { title: 'ts-rust', detail: 'per mapped pair TS↔Rust alignment + divergence-map synthesis' },
  ],
};

const ROOT = (args && args.root) || '/home/joshua/Development/flight/worktrees/review';
const OUT = ROOT + '/tools/agents/docs/reviews/alignment';

const DEFAULT_PACKAGES = [
  'application',
  'app',
  'camera',
  'clipboard',
  'clip',
  'device',
  'dialog',
  'displayobject-canvas',
  'displayobject-dom',
  'displayobject-gl',
  'displayobject-wgpu',
  'displayobject',
  'easing',
  'effects-canvas',
  'effects-gl',
  'effects-wgpu',
  'effects',
  'entity',
  'filesystem',
  'filters-canvas',
  'filters-css',
  'filters-gl',
  'filters-surface',
  'filters-wgpu',
  'filters',
  'geolocation',
  'geometry',
  'haptics',
  'host-electron',
  'input',
  'interaction',
  'ipc',
  'keyboard',
  'lifecycle',
  'lighting',
  'loader',
  'log',
  'materials',
  'math',
  'media',
  'menu',
  'mesh',
  'network',
  'node',
  'notification',
  'particles-formats',
  'particles',
  'path',
  'platform',
  'power',
  'protocol',
  'render-gl',
  'render-wgpu',
  'render',
  'resources',
  'scene-gl',
  'scene-wgpu',
  'scene',
  'screen',
  'sdk',
  'sensors',
  'shape',
  'share',
  'shell',
  'shortcut',
  'signals',
  'spritesheet-formats',
  'spritesheet',
  'sprite',
  'statusbar',
  'storage',
  'surface-rs',
  'surface',
  'textinput',
  'textlayout',
  'textshaper-canvas',
  'textshaper',
  'texture',
  'text',
  'timeline',
  'tray',
  'tween',
  'types',
  'updater',
  'velocity',
  'webcam',
];

// Packages with NO Rust crate (intentionally TS-only: Canvas/DOM/CSS substrate, TS host, wasm wrapper).
const DEFAULT_TS_ONLY = [
  'displayobject-canvas',
  'displayobject-dom',
  'effects-canvas',
  'filters-canvas',
  'filters-css',
  'host-electron',
  'surface-rs',
  'textshaper-canvas',
];
// Crates with NO TS package (intentionally Rust-only: native hosts, capture, software backend, test harness).
const DEFAULT_RUST_ONLY = [
  'capture',
  'displayobject-skia',
  'functional',
  'host-sdl',
  'host-web',
  'host-winit',
  'surface-wasm',
];

const PACKAGES = (args && args.packages) || DEFAULT_PACKAGES;
const TS_ONLY = (args && args.tsOnly) || DEFAULT_TS_ONLY;
const RUST_ONLY = (args && args.rustOnly) || DEFAULT_RUST_ONLY;
const DIMENSION_KEYS = (args && args.dimensions) || ['api', 'filenames', 'deps', 'ts-rust'];

const MAPPED = PACKAGES.filter((p) => !TS_ONLY.includes(p)); // packages that have an identity-named crate

// `-rs` packages are wasm "mixing" drop-ins: a TS package X-rs that must export the SAME public API
// as its base TS package X (per the Mixing section of the Rust map), backed by the X-wasm crate.
// These are the MOST important conformance target — a drop-in that drifts from its base is broken.
const RS_PACKAGES = PACKAGES.filter((p) => p.endsWith('-rs')).map((p) => ({
  pkg: p,
  base: p.replace(/-rs$/, ''),
  crate: p.replace(/-rs$/, '') + '-wasm',
}));

const API_CHECKLIST =
  'API convention checklist (from the CLAUDE map: Design Constraints + Source Style):\n' +
  '- Function names contain the FULL, unabbreviated type word they operate on (getDisplayObjectBounds, not getDOBounds / getObjBounds). Never abbreviate a type name.\n' +
  '- Exported names are globally unique, especially from the package root barrel.\n' +
  '- Allocation discipline by verb: create*/clone* and pool acquire* may allocate; math/transform/bounds/update and other hot-path helpers write into an `out`/`target` parameter and must NOT allocate.\n' +
  '- out-param functions are alias-safe: read every input field into locals before writing any output field (so out === an input is safe). Flag ones that read-after-write.\n' +
  '- Mutable-param NAMING by read/write semantics: `source` = read-only input; `out` = WRITTEN-only (never read — e.g. cleared then filled); `target` = read AND write (mutated in place / additive merge). Order is destination-first: `(out|target, source)`. A function that must read its destination keeps explicit `source` + `out` and is alias-safe. Flag a write-only destination named `target`, a read+write destination named `out`, or reversed `(source, out)` order.\n' +
  '- Teardown verbs are used with their distinct meanings: dispose* (detach/release-to-GC), destroy* (free a non-GC resource now: GPU/native handle), acquire*/release* (pool brackets only). Flag misuse or synonym drift.\n' +
  '- Readonly<T> on every parameter/return/stored reference where mutation is not intended (object types; primitives exempt). Flag mutable-by-default object params.\n' +
  '- Sentinels (null/false/-1) for expected failure; throw ONLY for programmer error (precondition/misuse). Flag thrown errors for expected-missing cases and validation of unreachable internal invariants.\n' +
  '- Accessors use get*; boolean-returning use has*/is*. Flag get* that returns boolean or a non-getter, and boolean getters without has/is.\n' +
  '- Verb CONSISTENCY: the same operation uses the same verb across the package and vs sibling packages (create vs make vs new; copy/set vs assign; enable* signal groups). Flag inconsistent verbs for the same concept.\n' +
  '- Parameter-ordering symmetry across related functions (out/target placement consistent; source/target order consistent). Flag asymmetry.\n' +
  '- `import type {}` on its own line (never `import { type Foo, bar }`). Cross-package types come from @flighthq/types, not defined inline.\n' +
  '- Exported functions alphabetized within the file (npm run order checks this — only note egregious cases).';

const FILENAME_CHECKLIST =
  'Filename convention checklist (the test: remove the folder — is the bare filename self-describing?):\n' +
  '- A filename names the DOMAIN it covers or the OBJECT it operates over — NEVER a single function. Flag files named after one function.\n' +
  '- HasTransform2D → transform2D.ts, BlurFilter → blurFilter.ts: the file says the domain/object at a glance.\n' +
  '- Backend-variant packages (*-canvas / *-dom / *-gl / *-wgpu) prefix EVERY file with the backend token, PREFIX-FIRST: glBlurFilter.ts, canvasBitmap.ts, wgpuShape.ts, domDisplayObject.ts — NOT blurFilterGl.ts and NOT a bare blurFilter.ts. This gives file-level "where am I / what backend" clarity. Flag missing/suffix-style/bare names in these packages.\n' +
  '- Single-implementation domains (node, surface, geometry, signals, text, …) take a plain domain/object name and need NO backend prefix. Cross-package basename collisions there are fine when each is a legit domain/object name (the package disambiguates).\n' +
  '- Flag GENERIC names that carry no domain: data.ts, format.ts, query.ts, utils.ts, helpers.ts, math.ts, common.ts, index-as-dumping-ground. Propose a specific domain/object name.\n' +
  '- Tests colocated as <source>.test.ts, mirroring the source filename.';

const DEPS_CHECKLIST =
  'Dependency hygiene checklist (run `npm run packages:check` first; report what JUDGMENT adds beyond it):\n' +
  '- No package imports @flighthq/sdk (the barrel). Flag any.\n' +
  '- Cross-package types live in @flighthq/types, not redefined inline in a consumer. Flag inline cross-package types.\n' +
  '- Declared deps are MINIMAL and CORRECT: no unused declared dependency; no used-but-undeclared (phantom) dependency; workspace deps pinned "*".\n' +
  '- Layering is respected: depend on features/the header, not across boundaries. Renderers depend on render core; backends do not depend on each other; nothing reaches "up" a layer. Flag boundary violations and surprising edges.\n' +
  '- type-only deps imported with `import type` and not pulling runtime weight; package stays tree-shakable ("sideEffects": false).\n' +
  '- The dependency MAPPING reads cleanly: a reader can predict this package’s deps from its purpose. Flag edges that are surprising given the package’s role.';

const TSRUST_CHECKLIST =
  'TS↔Rust alignment checklist (TS @flighthq/<name> is upstream/authoritative; Rust flighthq-<name> conforms). Run `npm run rust:conformance` first; this review adds the judgment the script cannot see:\n' +
  '- Package→crate name is identity (@flighthq/<name> → flighthq-<name>) unless the pair is in the documented rename/divergence map (tools/agents/docs/rust/conformance.md + scripts/rust-conformance.ts). Flag undocumented name divergence.\n' +
  '- Exported function names map 1:1 with camelCase→snake_case and the FULL type word preserved (getDisplayObjectBounds → get_display_object_bounds). Flag missing ports, renamed-without-reason, abbreviated, or extra Rust functions not present upstream.\n' +
  '- File names track too (nice-to-have): TS transform2D.ts ↔ Rust transform2d.rs; same domain/object basename. Flag files whose Rust basename does not track its TS counterpart.\n' +
  '- Out-param / sentinel / teardown-verb conventions carry across (out → &mut, null → Option, dispose_/destroy_/acquire_/release_ preserved).\n' +
  '- Any TS↔Rust difference must be a RECORDED entry in the divergence map with a rationale — not silent drift. Flag drift that is not in the map; note map entries that look stale.\n' +
  '- `-rs` wasm drop-in packages are the MOST important conformance target: a TS X-rs must export the SAME API as base TS X (verified by `npm run mixing:conformance`), backed by the X-wasm crate. These get a dedicated mixing-conformance agent in this phase.';

const CHECKLIST = {
  api: API_CHECKLIST,
  filenames: FILENAME_CHECKLIST,
  deps: DEPS_CHECKLIST,
  'ts-rust': TSRUST_CHECKLIST,
};

function perPackagePrompt(dim, name) {
  const common =
    'Read the package at ' +
    ROOT +
    '/packages/' +
    name +
    ' (src + package.json). ' +
    'You may run `cd ' +
    ROOT +
    ' && npm run api ' +
    name +
    '` for the compact exported signatures. ' +
    'The authoritative conventions are in ' +
    ROOT +
    '/tools/agents/docs/index.md (and rust/index.md, rust/conformance.md for ts-rust). ';
  if (dim === 'api') {
    return (
      'AUDIT the EXPORTED API of @flighthq/' +
      name +
      ' against the SDK API conventions.\n\n' +
      common +
      'Run `cd ' +
      ROOT +
      ' && npm run order:check` mentally-aside; do not re-report pure alphabetization.\n\n' +
      API_CHECKLIST +
      '\n\nWrite Markdown to EXACTLY ' +
      OUT +
      '/api/' +
      name +
      '.md: title `# API Alignment: @flighthq/' +
      name +
      '`, a one-line **Verdict**, then `## Findings` as a table (Severity | Symbol | Issue | Suggested fix), then `## Clean` (conventions it follows well). Be specific — cite the exact exported name. Return the structured summary.'
    );
  }
  if (dim === 'filenames') {
    return (
      'AUDIT the SOURCE FILENAMES of @flighthq/' +
      name +
      ' for descriptiveness.\n\n' +
      common +
      'List the files under src/ first.\n\n' +
      FILENAME_CHECKLIST +
      '\n\nWrite Markdown to EXACTLY ' +
      OUT +
      '/filenames/' +
      name +
      '.md: title `# Filename Alignment: @flighthq/' +
      name +
      '`, a one-line **Verdict** (note whether this is a backend-variant package, which changes the rule), then `## Findings` table (File | Issue | Suggested rename), then `## Clean`. Return the structured summary.'
    );
  }
  if (dim === 'deps') {
    return (
      'AUDIT the DEPENDENCY hygiene of @flighthq/' +
      name +
      '.\n\n' +
      common +
      'Run `cd ' +
      ROOT +
      ' && npm run packages:check` and only report what judgment adds beyond it. Cross-check declared deps in package.json against actual imports in src/.\n\n' +
      DEPS_CHECKLIST +
      '\n\nWrite Markdown to EXACTLY ' +
      OUT +
      '/deps/' +
      name +
      '.md: title `# Dependency Alignment: @flighthq/' +
      name +
      '`, a one-line **Verdict**, then `## Findings` table (Severity | Dependency/edge | Issue | Fix), then `## Declared vs used` (unused / phantom). Return the structured summary.'
    );
  }
  // ts-rust
  return (
    'AUDIT TS↔Rust alignment for @flighthq/' +
    name +
    ' (TS) ↔ flighthq-' +
    name +
    ' (Rust crate at ' +
    ROOT +
    '/crates/flighthq-' +
    name +
    ').\n\n' +
    common +
    'Run `cd ' +
    ROOT +
    ' && npm run rust:conformance` and read its output for this crate; this review adds file-name alignment, naming nuance, and undocumented-drift judgment the script cannot see. Compare TS src/ exports + filenames against the crate src/ functions + filenames.\n\n' +
    TSRUST_CHECKLIST +
    '\n\nWrite Markdown to EXACTLY ' +
    OUT +
    '/ts-rust/' +
    name +
    '.md: title `# TS↔Rust Alignment: @flighthq/' +
    name +
    '`, a one-line **Verdict**, then `## Name map findings` table (TS symbol/file | Rust symbol/file | Issue), then `## In sync`. Note anything that should be added to the divergence map. Return the structured summary.'
  );
}

// `-rs` wasm drop-in conformance: X-rs must export the SAME public API as its base X. This is the
// most important conformance target, so it gets its own focused agent within the ts-rust phase.
function rsPackagePrompt(rs) {
  return (
    'AUDIT MIXING CONFORMANCE for the wasm drop-in @flighthq/' +
    rs.pkg +
    ' against its authoritative base @flighthq/' +
    rs.base +
    ' and its backing Rust crate flighthq-' +
    rs.crate +
    ' (at ' +
    ROOT +
    '/crates/flighthq-' +
    rs.crate +
    ').\n\n' +
    'A `-rs` package must be SUBSTITUTABLE for its base at the package seam (see the Mixing section of ' +
    ROOT +
    '/tools/agents/docs/rust/index.md): it must export the SAME public API — identical function names AND signatures — as the base. This is the single most important conformance target, because a drop-in that drifts from its base is silently broken for every consumer.\n\n' +
    'Run `cd ' +
    ROOT +
    ' && npm run mixing:conformance` (the machine gate that diffs the two signature sets) and read its output; then add the judgment it cannot see.\n\n' +
    'Checklist:\n' +
    '- Every exported function of @flighthq/' +
    rs.base +
    ' is present in @flighthq/' +
    rs.pkg +
    ' with an IDENTICAL signature. Flag any missing or signature-drifted function (gate failures).\n' +
    '- Extra exports in the `-rs` package are allowed ONLY for wasm lifecycle (an init*/load* helper). Flag any other extra export as surface a drop-in should not add.\n' +
    '- @flighthq/' +
    rs.pkg +
    ' actually DELEGATES to the flighthq-' +
    rs.crate +
    ' wasm crate, not a second JS reimplementation; and the crate implements the base ops. Flag a reimplementation or a stubbed/dead delegation.\n' +
    '- Semantic drop-in risks the signature diff cannot see: byte-for-byte output expectations at the seam, async/init timing, error/sentinel behavior. Note these.\n' +
    '- Docs are not stale (e.g. the Mixing section calling the package "future"). Flag stale wording.\n\n' +
    'Write Markdown to EXACTLY ' +
    OUT +
    '/ts-rust/' +
    rs.pkg +
    '.md: title `# Mixing Conformance: @flighthq/' +
    rs.pkg +
    ' ↔ @flighthq/' +
    rs.base +
    '`, a one-line **Verdict**, then `## Signature conformance` (missing/drifted/extra vs base), `## Delegation & behavior` (wraps the wasm crate; semantic risks), `## In sync`. Return the structured summary (subject "' +
    rs.pkg +
    '").'
  );
}

function synthesisPrompt(dim) {
  if (dim === 'api') {
    return (
      'CROSS-PACKAGE API CONSISTENCY synthesis. Using `cd ' +
      ROOT +
      ' && npm run api:json` (all exported signatures at once) and the conventions in ' +
      ROOT +
      '/tools/agents/docs/index.md, look for inconsistencies that are only visible GLOBALLY: the same concept named with different verbs across packages (create vs make; copy vs set vs assign), allocation-verb inconsistency, get*/has*/is* drift, out-param ordering that differs between packages, and globally-colliding exported names from package roots.\n\n' +
      API_CHECKLIST +
      '\n\nWrite Markdown to EXACTLY ' +
      OUT +
      '/api/_consistency.md: title `# API Consistency — Cross-Package`, then `## Verb inconsistencies`, `## Naming collisions`, `## Out-param / ordering drift`, `## Recommendations`. Return the structured summary (use subject "_consistency").'
    );
  }
  if (dim === 'filenames') {
    return (
      'GLOBAL FILENAME synthesis. Survey filenames across all packages (you may `cd ' +
      ROOT +
      ' && ls packages/*/src`). Report: generic-name offenders across the repo, backend-variant packages missing the prefix-first convention, and basename collisions that are NOT legitimate domain reuse.\n\n' +
      FILENAME_CHECKLIST +
      '\n\nWrite Markdown to EXACTLY ' +
      OUT +
      '/filenames/_global.md: title `# Filename Alignment — Global`, then `## Generic names to fix`, `## Backend-prefix violations`, `## Collisions worth resolving`, `## Clean patterns to keep`. Return the structured summary (subject "_global").'
    );
  }
  if (dim === 'deps') {
    return (
      'GLOBAL DEPENDENCY-GRAPH synthesis. Using package.json files (and `cd ' +
      ROOT +
      ' && npm run packages:check`), assess the overall layering: cycles, any package importing @flighthq/sdk, cross-boundary edges, and whether the layer structure (types → entity/geometry/signals → node → displayobject/sprite → render → render-* → *-backend; platform suite seams) is clean.\n\n' +
      DEPS_CHECKLIST +
      '\n\nWrite Markdown to EXACTLY ' +
      OUT +
      '/deps/_graph.md: title `# Dependency Graph — Global`, then `## Layering map`, `## Cycles & boundary violations`, `## Surprising edges`, `## Recommendations`. Return the structured summary (subject "_graph").'
    );
  }
  // ts-rust
  return (
    'TS↔Rust DIVERGENCE-MAP audit. Compare the actual package set vs crate set against the documented divergence map (' +
    ROOT +
    '/tools/agents/docs/rust/conformance.md and scripts/rust-conformance.ts).\n' +
    'TS-only packages (should have NO crate): ' +
    TS_ONLY.join(', ') +
    '.\n' +
    'Rust-only crates (should have NO package): ' +
    RUST_ONLY.join(', ') +
    '.\n' +
    'Verify each TS-only / Rust-only entry is DOCUMENTED with a rationale (existence rule / substrate / native host). Flag any package missing a crate or crate missing a package that is NOT in the map (undocumented drift), and any map entry that looks stale now that renames are applied.\n\n' +
    'Mixing pairs: ' +
    (RS_PACKAGES.length
      ? RS_PACKAGES.map(
          (r) => '@flighthq/' + r.pkg + ' ↔ base @flighthq/' + r.base + ' ↔ crate flighthq-' + r.crate,
        ).join('; ')
      : '(none)') +
    '. Each `-rs` package must be in TS_ONLY and its `-wasm` crate in RUST_ONLY (a matched pair across the JS↔wasm seam, not unmatched drift). Run `cd ' +
    ROOT +
    ' && npm run mixing:conformance` and confirm each triad is recorded in the map and the drop-in matches its base.\n\n' +
    TSRUST_CHECKLIST +
    '\n\nWrite Markdown to EXACTLY ' +
    OUT +
    '/ts-rust/_divergence.md: title `# TS↔Rust Divergence Map — Audit`, then `## Documented & correct`, `## Undocumented drift`, `## Mixing pairs (-rs ↔ base ↔ -wasm)`, `## Stale / questionable entries`, `## Recommendations`. Return the structured summary (subject "_divergence").'
  );
}

const ALIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    dimension: { type: 'string' },
    verdict: { type: 'string' },
    high: { type: 'number' },
    medium: { type: 'number' },
    low: { type: 'number' },
    highlights: { type: 'array', items: { type: 'string' } },
    file: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['subject', 'dimension', 'highlights', 'file', 'summary'],
};

const thunks = [];
for (const dim of DIMENSION_KEYS) {
  const subjects = dim === 'ts-rust' ? MAPPED : PACKAGES;
  for (const name of subjects) {
    thunks.push(() =>
      agent(perPackagePrompt(dim, name), {
        label: dim + ':' + name,
        phase: dim,
        agentType: 'general-purpose',
        effort: dim === 'ts-rust' ? 'high' : 'medium',
        schema: ALIGN_SCHEMA,
      }),
    );
  }
  if (dim === 'ts-rust') {
    for (const rs of RS_PACKAGES) {
      thunks.push(() =>
        agent(rsPackagePrompt(rs), {
          label: 'ts-rust:' + rs.pkg + ' (mixing)',
          phase: dim,
          agentType: 'general-purpose',
          effort: 'high',
          schema: ALIGN_SCHEMA,
        }),
      );
    }
  }
  thunks.push(() =>
    agent(synthesisPrompt(dim), {
      label: dim + ':_synthesis',
      phase: dim,
      agentType: 'general-purpose',
      effort: 'high',
      schema: ALIGN_SCHEMA,
    }),
  );
}

log(
  'API-alignment review: dimensions [' +
    DIMENSION_KEYS.join(', ') +
    '] over ' +
    PACKAGES.length +
    ' packages (' +
    MAPPED.length +
    ' mapped to crates) → ' +
    thunks.length +
    ' agents.',
);

const results = (await parallel(thunks)).filter(Boolean);

const byDim = {};
for (const r of results) {
  const d = r.dimension || 'unknown';
  (byDim[d] = byDim[d] || []).push(r);
}
for (const d of Object.keys(byDim))
  byDim[d].sort((a, b) => (b.high || 0) - (a.high || 0) || a.subject.localeCompare(b.subject));

log('Done: ' + results.length + '/' + thunks.length + ' docs across ' + Object.keys(byDim).length + ' dimensions.');

return {
  findings: results,
  byDimension: byDim,
  dimensions: DIMENSION_KEYS,
  agentCount: thunks.length,
  completed: results.length,
};
