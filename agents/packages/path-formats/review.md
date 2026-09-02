---
package: '@flighthq/path-formats'
status: solid
score: 76
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# path-formats — Review

**Verdict:** solid — 76/100. The blessed first-build scope (SVG path data, 2026-07-09 decision) is fully and cleanly delivered with correct grammar coverage, spec-aware tokenizing, sentinel error handling, and 27 focused tests. Since the prior review (2026-07-13), the non-finite overflow gap was closed (`f867b5529`), and the diagnostics convention was refined to clarify `explain*` as targeted rather than blanket. The package remains single-format and lacks a few tokenizer edge-case tests and the arc-after-`Z` corner fix, keeping it below authoritative.

## Present capabilities

One module, `packages/path-formats/src/svgPathData.ts` (329 lines), three exports re-exported through `index.ts` (thin barrel) and `contract.ts` (`export *`):

- **`appendSvgPathData(path, d): boolean`** — the workhorse parser. Hand-written context-aware scanner over the full SVG path grammar: absolute/relative `M L H V C S Q T A Z`, comma/whitespace separators (space, tab, LF, CR, FF), signed numbers, decimals including leading-dot forms, scientific notation with backtrack on dangling `e`, no-separator negative packing (`10-5`), and single-character arc flags packed without separators (`0110`) via a dedicated `readFlag`. Implicit repeated operand groups are handled, including the spec-mandated M-to-L (m-to-l) shift after the first moveto pair. `S`/`T` smooth-shorthand reflection tracks `lastKind` so reflection applies only after `C`/`S` (resp. `Q`/`T`), falling back to the current point otherwise. `Z` closes via `appendPathClose` and resets `currentX/Y` to the subpath start. Returns `false` on structural malformation: leading non-moveto, unknown command letter, short coordinate run, or non-finite numeric overflow. Empty/whitespace-only input is well-formed and appends nothing.

- **`parseSvgPathData(d): Path | null`** — thin wrapper: `createPath()` + `appendSvgPathData`, `null` sentinel on malformed input. Matches the charter decision exactly.

- **`formatSvgPathData(path, options?): string`** — walks `forEachPathSegment`, emitting absolute `M/L/Q/C/Z` per segment kind. `options.precision` rounds coordinates and trims trailing zeros (`formatSvgNumber` normalizes `-0` to `"0"`); default is full precision. No `A` command is emitted because `@flighthq/path` stores arcs as cubic beziers; geometry round-trips, the arc verb does not.

**Arc handling** is correctly delegated: `A`/`a` converts the SVG rotation angle from degrees to radians at the seam (`(rotationDegrees * Math.PI) / 180`, consistent with the angles convention) and calls `appendPathArcTo`, which implements SVG endpoint parameterization. Since `PathSegment` has no arc kind, `formatSvgPathData` never emits `A`; documented in both JSDoc and status.md.

**Tests** (`svgPathData.test.ts`, 27 tests, all passing): all commands, relative resolution, implicit repeats, both shorthand-reflection branches (reflect and non-reflect for `S` and `T`), packed arc flags, scientific notation, close-then-continue current-point semantics, three malformed-sentinel cases (no-moveto, unknown command, short coordinates), non-finite overflow rejection at both signs, precision option, arc-to-cubic emission, the `append` composability test, and a 5-case parse-format-parse round-trip with numeric closeness assertions. `describe` blocks alphabetized and mirroring the three exports.

**Consumer:** `@flighthq/scene2d-formats` (`svgDocument.ts`) imports `parseSvgPathData` via the contract lane to parse SVG `<path d="...">` elements.

### Change since prior review (2026-07-13)

One substantive commit touched this package: `f867b5529 fix(parsers): bound non-finite numbers and XML nesting`. It changed `readNumber` to return `null` for values where `Number.isFinite` is false (e.g. `1e999` parsing to `Infinity`), converting a silently accepted non-finite coordinate into a parse failure. Two tests were added covering positive and negative overflow. The remaining commits (`e92344b7a`, `cd6b6e71e`) are version bumps only.

## Gaps

Versus a mature SVG path-data codec measured against the charter and the codebase-map AAA standard:

1. **No `explain*` query for the silent sentinels.** `parseSvgPathData` returns `null` and `appendSvgPathData` returns `false` with no way to learn *where* or *why* parsing failed. The diagnostics convention (updated since the prior review) clarifies that `explain*` is **targeted at high-value confusing sentinels**, not a blanket obligation. A path-parse failure is somewhat self-evident (the string was malformed), but identifying the position and reason within a long `d` string is genuinely useful for SVG import diagnostics — `scene2d-formats` currently cannot report *which* `<path>` element failed or where in its `d` attribute. An `explainSvgPathData(d)` returning `{ position, reason }` plain data would serve both human debugging and the `scene2d-formats` diagnostic pipeline.

2. **Partial-mutation on `append` failure.** `appendSvgPathData` documents "returns `false` without further mutation guarantee" — a failed parse can leave a half-appended path. The caller (`parseSvgPathData`) is unaffected because it allocates a fresh path and discards it on failure, but direct `append` callers (e.g. `scene2d-formats`) are exposed. A textbook atomic codec either parses to a scratch path and appends on success, or records the pre-append length and truncates on failure.

3. **Tokenizer edge cases not yet locked in by tests.** The `readNumber` function handles leading-dot (`.5`), packed decimals (`0.5.5`), explicit `+` signs, trailing-dot (`10.`), and dangling-exponent backtrack (`1e` as a bare token) — all look correct by inspection — but none of these have dedicated test coverage. The non-finite overflow case that *was* untested is now covered (since `f867b5529`).

4. **Arc-after-`Z` corner (recorded in status.md).** An `A` immediately following `Z` without an intervening moveto derives its arc start from `appendPathArcTo`'s internal `getPathLastPoint`, which after a close returns the pre-close anchor rather than the subpath origin. The parser's own `currentX/Y` correctly holds the post-close point (`startX/startY`), so the issue is in the interaction between the parser's state and the path builder's internal state. Rare in real SVG but a known correctness gap, untested.

5. **No compact/relative/minified writer mode.** The formatter always emits absolute long-form (`L` even for axis-aligned lines that could be `H`/`V`, no implicit-repeat elision, no relative-when-shorter). For an interchange codec consumed by SVG tooling, output size can matter. The charter blesses absolute emission but does not rule on a minification option.

6. **Single format.** Canvas2D `Path2D` record/replay and other formats (PostScript, compact binary) are charter-deferred Open directions. The per-format-module boundary (`"Formats are independently tree-shakable"`) is exercised by exactly one module.

## Charter contradictions

None. The implementation matches every 2026-07-09 decision:
- Naming pair `format*`/`parse*` keyed by `*SvgPathData` — present.
- Sentinel-on-malformed (`null`/`false`, not throw, not silent partial) — present, strengthened by the non-finite overflow fix.
- Absolute emission with optional precision — present.
- Full grammar including shorthands and implicit repeats — present.
- Dependencies limited to `@flighthq/path` + `@flighthq/types` — present (verified in `package.json`).
- No geometry math owned locally (arcs delegated to `appendPathArcTo`) — present.
- `appendSvgPathData` is an addition beyond the decision's two named functions but is consistent with its spirit and documented in the status.

## Contract and docs fit

**Contract compliance is clean:**
- Two blessed export lanes: `.` (`index.ts` re-exporting `contract.ts`) and `./contract` (`contract.ts` with `export * from './svgPathData'`). Intra-SDK consumer (`scene2d-formats`) correctly imports from `@flighthq/path-formats/contract`.
- `"sideEffects": false` declared.
- No DOM, no renderer, no side-effecting top-level code.
- `Readonly<Path>` on the non-mutated `formatSvgPathData` parameter; mutable `path: Path` on the mutating `appendSvgPathData`.
- `import type` on its own line (one instance in source).
- Private helpers (`formatSvgNumber`, `isSvgCommandLetter`, `skipSeparators`, `readNumber`, `readFlag`) below the three exports. Exported functions alphabetized within the file.
- Colocated test file with alphabetized `describe` blocks mirroring exports.
- Sentinels for expected failure, no throws. Consistent with the sentinel convention.
- Comments are durable-semantic (grammar notes, aliasing notes, why-arc-is-cubic). No inline TODOs.

**Minor observation:** The `formatSvgPathData` options type is an inline anonymous `Readonly<{ precision?: number }>`. It does not cross a package boundary, so `@flighthq/types` residence is not strictly required. If writer options grow (e.g. a future `compact` or `relative` flag), a named type in `@flighthq/types` would be warranted.

**Docs fit:**
- The catalog.md entry (`packages/catalog.md`) is accurate: names all three exports, describes the codec boundary, notes the arc-to-cubic behavior.
- The package map (`packages/map.md`) entry is accurate: names all three exports.
- The AGENTS.md Package Map line groups `path-formats` under Scene graph codecs alongside `path-boolean`, `shape-formats`, `scene2d-formats`, and `swf`.

No candidate doc revisions identified. The previous review's note about the Package Map missing `appendSvgPathData` has been addressed in both `catalog.md` and `map.md`.

## Candidate open directions

These are questions the charter does not answer that this review had to assume to evaluate the package:

1. **Relation to chartered-unbuilt `svg-formats`.** `svg-formats` will parse whole SVG documents and is documented as delegating path data "via `path-formats`" (already happening in `scene2d-formats`). Worth a charter boundary note confirming that document-level SVG concerns (transforms on `<path>`, `pathLength`, CSS presentation attributes) never leak into this package.

2. **Arc verb fidelity.** Should a future `Path` arc segment kind exist so `A` survives format round-trips verbally (not just geometrically)? Cross-package (`@flighthq/path` owns the segment vocabulary) — a question for the path charter, surfaced here because it directly affects what `formatSvgPathData` can emit.

3. **Writer output modes.** Is a compact/relative/minified emission mode in scope (an `options` extension), or is absolute-long-form the deliberate final shape? The charter blesses absolute but does not rule on minification as a complementary option.

4. **Lenient parsing.** SVG user agents render up to the first error; the charter deliberately chose all-or-nothing sentinel. If the SVG importer (`scene2d-formats` or a future `svg-formats`) ever needs UA-style leniency, is that a mode in this package or a concern of the importing package?
