---
package: '@flighthq/path-formats'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# path-formats — Review

**Verdict:** solid — 74/100. The blessed first-build scope (SVG path data, 2026-07-09 decision) is fully and cleanly delivered — full grammar, correct shorthand reflection, a proper spec-aware tokenizer, sentinel error handling, 25 focused tests. It sits at solid rather than higher because the codec cell is still single-format, has no diagnostics layer for its silent sentinels (`explain*` per the diagnostics inversion rule), no compact/relative output, and a few tokenizer/append edge cases are untested.

## Present capabilities

One module, `packages/path-formats/src/svgPathData.ts`, three exports (alphabetized), re-exported by a thin root barrel `index.ts`:

- **`appendSvgPathData(path, d): boolean`** — the workhorse. Hand-written context-aware scanner (no regex token stream) over the full SVG path grammar: absolute/relative `M L H V C S Q T A Z`, comma/whitespace separators (space, tab, LF, CR, FF), signed numbers, decimals including leading-dot forms, scientific notation (`readNumber` backtracks a dangling `e`), no-separator negative packing (`10-5`), and single-character arc flags that may be packed (`0110`) via a dedicated `readFlag`. Implicit repeated operand groups are handled, including the spec's M→L (m→l) shift after the first moveto pair. `S`/`T` reflection tracks `lastKind` so reflection applies only after `C`/`S` (resp. `Q`/`T`), falling back to the current point otherwise — spec-correct. `Z` closes via `appendPathClose` and returns the current point to the subpath start. Returns `false` on structural malformation (leading non-moveto, unknown command letter, short coordinate run); empty/whitespace-only input is well-formed and appends nothing.
- **`parseSvgPathData(d): Path | null`** — thin wrapper: `createPath()` + `appendSvgPathData`, `null` sentinel on malformed input. Matches the charter decision exactly (sentinel, not throw, not silent partial).
- **`formatSvgPathData(path, options?): string`** — walks `forEachPathSegment`, emitting absolute `M/L/Q/C/Z` per segment kind. `options.precision` rounds and trims trailing zeros (`formatSvgNumber` normalizes `-0` to `0`); default is full precision. Absolute-only emission is a blessed charter decision.

Arc handling is correctly delegated: `A`/`a` converts the SVG angle (degrees → radians at the seam, per the angle convention) and calls `appendPathArcTo`, which implements SVG §F.6.6 endpoint parameterization including zero-radius → lineto, negative radii → abs, too-small radii scale-up, and start==end no-op (`packages/path/src/path.ts:47`). Since `@flighthq/path` has no arc segment kind, `formatSvgPathData` never emits `A`; geometry round-trips, the arc *verb* does not — documented in both function docs and status.md.

Tests (`svgPathData.test.ts`, 25 tests): all commands, relative resolution, implicit repeats, both shorthand-reflection branches, packed flags, scientific notation, close-then-continue current-point semantics, malformed sentinels, precision option, and a 5-case parse→format→parse round-trip with numeric closeness assertions. `describe` blocks alphabetized and mirroring exports.

## Gaps

Versus a textbook SVG path-data codec (the charter is silent past the first-build decision; codebase-map AAA standard applies):

1. **No `explain*` query for the silent sentinels.** `parseSvgPathData` returns `null` and `appendSvgPathData` returns `false` with no way to learn *where or why* parsing failed. The diagnostics rule is explicit: "every silent sentinel gets a shakeable `explain*` query returning plain data." An `explainSvgPathData(d)` returning `{ position, reason }`-style plain data is the canonical missing piece. No `enable*Guards` module either (arguably less needed here since the sentinel is already the caller's signal).
2. **Partial-mutation on `append` failure.** `appendSvgPathData` documents "returns `false` without further mutation guarantee" — a failed append can leave a half-appended path. A textbook codec either guarantees atomicity (parse to a scratch path, append on success) or surfaces the boundary. Untested either way.
3. **No compact/minified or relative output.** The writer always emits absolute long-form (`L` even for axis-aligned lines that could be `H`/`V`, no implicit-repeat elision, no relative-when-shorter). Absolute is blessed; a size-optimizing writer mode is absent, and for an interchange codec output size matters (SVG tooling ecosystems minify aggressively).
4. **Tokenizer edge cases untested** (behavior looks correct by inspection but has no coverage): leading-dot numbers (`.5`), packed decimals (`0.5.5` → 0.5, 0.5), explicit `+` signs, trailing-dot numbers (`10.`), a dangling exponent (`1e` backtrack), and huge values overflowing to `Infinity` (currently accepted silently).
5. **Arc-after-`Z` corner** (recorded in status.md): an `A` immediately after `Z` without a moveto derives its start point from `getPathLastPoint`, which post-close is the pre-close anchor rather than the subpath origin the parser's own `currentX/Y` correctly holds. Rare in real SVG but a known correctness corner, untested.
6. **Single format.** Canvas2D `Path2D` record/replay and other formats are charter-deferred Open directions, so this is expected — but the package's "formats are independently tree-shakable, one module per format" boundary is so far exercised by exactly one module.

## Charter contradictions

None. The implementation matches every 2026-07-09 decision: naming pair (`format*`/`parse*` keyed by `*SvgPathData`), sentinel-on-malformed, absolute emission with optional precision, full grammar including shorthands and implicit repeats, deps limited to `path` + `types`, no geometry math owned locally (arcs delegated to `appendPathArcTo`). `appendSvgPathData` is an addition beyond the decision's two named functions but is consistent with its spirit (and `parseSvgPathData` is honestly a wrapper over it).

## Contract & docs fit

- **Contract compliance is clean:** single root `.` export (thin barrel), `sideEffects: false`, deps `@flighthq/path` + `@flighthq/types` only, no DOM, sentinels not throws, `Readonly<Path>`/`Readonly<{...}>` on non-mutated params, `import type` on its own line, private helpers below exports, exported functions alphabetized, colocated test file with mirrored alphabetized describes, comments are durable-semantic (grammar/aliasing/why), no inline TODOs.
- **Minor:** the `formatSvgPathData` options type is an inline anonymous `Readonly<{ precision?: number }>`. It doesn't cross a package boundary so `@flighthq/types` residence isn't required, but a named `SvgPathDataFormatOptions` would be more navigable if options grow.
- **Candidate doc revisions:** (a) the Package Map / package-map line names only `parseSvgPathData`/`formatSvgPathData` — `appendSvgPathData` is a public third export worth listing; (b) the diagnostics convention doc's "every silent sentinel gets an `explain*`" rule is currently unmet here — either the rule tolerates young packages or the TODO index should carry the item (it belongs in this package either way).

## Candidate open directions

1. **Relation to chartered-unbuilt `svg-formats` (structural fork I).** `svg-formats` will parse whole SVG documents and is explicitly documented as landing path data "via `path-formats`". Worth a charter line here confirming path-formats is the shared substrate (and that document-level concerns — transforms on `<path>`, `pathLength`, CSS — never leak down into this package).
2. **Arc verb fidelity.** Should a future `Path` arc segment kind (or a cubic→arc recognizer at format time) exist so `A` survives round-trips textually, not just geometrically? Cross-package (`@flighthq/path` owns the segment vocabulary) — a question for the path charter, not this cell.
3. **Writer output modes.** Is a compact/relative/minified emission mode in scope (an `options` extension), or is absolute-long-form the deliberate final shape? The charter blesses absolute but does not rule on minification.
4. **Lenient parsing.** SVG user agents render up to the first error; the charter deliberately chose all-or-nothing sentinel. If an importer (`svg-formats`) ever needs UA-style leniency, is that a mode here or that package's concern? Flagging so the decision is recorded rather than assumed.
