---
package: '@flighthq/textshaper'
status: partial
score: 62
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - types
---

# textshaper — Review

## Verdict

`partial — 62/100`. The seam architecture is sound: a single nullable backend slot, two shaping tiers (advances-only `measureText` and full-glyph `shapeTextRun`), opt-in signals, guards, pool, cache, cluster navigation, and script/bidi itemization. Naming is honest and unabbreviated; sentinel returns, `Readonly<>` parameters, out-parameter conventions, and tree-shaking discipline are upheld throughout. The score sits at 62 because the full-glyph tier — 80% of the exported surface by function count — is structurally complete but operationally inert: no backend in the repo implements `shapeRun`, so every glyph-producing function returns its sentinel. The public lane omits backend registration entirely, and several documented behaviors diverge from the code. These are recorded below with file and line references verified against the live tree.

11 source files (9 implementation + `contract.ts` + `index.ts`), 9 test files, 115 `it()` cases. 34 public exported functions (contract lane); 31 of those re-exported through the `.` lane.

## Present capabilities

**Measure tier (live).** `measureText` delegates to `TextShaperBackend.measureText`, returns `-1` when no backend is installed. `textlayout` imports `measureText` and `getTextShaperBackend` from `@flighthq/textshaper/contract` and treats the shaper as its measure provider. The canvas backend (`@flighthq/textshaper-canvas`) implements `measureText` and `getFontMetrics`, making these two the only backend methods exercised in production.

**Backend registration.** `getTextShaperBackend`/`setTextShaperBackend` with last-write-wins semantics, no throw on re-registration. `_textShaperBackendHook.ts` provides an internal callback slot so `textShaperSignals.ts` observes backend changes through one setter rather than a forked `WithSignals` variant. The hook module is not re-exported from either lane.

**Operation introspection.** `explainTextShaperOperation` and `hasTextShaperOperation` query whether the installed backend provides a given method, derived structurally from `keyof TextShaperBackend` (no hand-maintained roster). Returns `layer: 'none'` when nothing is installed, `layer: 'custom'` when a backend provides it.

**Full-glyph tier (inert).** `shapeTextRun` / `shapeTextRunInto` delegate to `TextShaperBackend.shapeRun?`. Font metrics: `getFontMetrics` / `getFontMetricsInto` / `getFontUnitScale`. Glyph introspection: `getGlyphExtents` / `getGlyphExtentsInto` / `getGlyphExtentsBatch` / `getGlyphIndexForCodePoint` / `getCodePointForGlyph` / `getGlyphName`. Run helpers: `createShapedRun` / `clearShapedRun`. All null-guarded, all return documented sentinels (`null`, `-1`, `''`, `false`, `0`). Well-tested against mock backends but no real backend supplies `shapeRun`.

**Itemization.** `itemizeText` splits a string into contiguous runs by Unicode script and bidi direction. Carries its own simplified bidi-class and script tables (`textShaperItemize.ts` lines 103-152) rather than depending on `@flighthq/textbidi`. `shapeTextRuns` composes `itemizeText` with `shapeTextRun` for multi-script strings.

**Cluster navigation.** `getCaretPositionsForRun`, `getClusterForIndex`, `getIndexRangeForCluster` operate on `ShapedRun` glyph data for caret positioning and hit-testing.

**Pool.** `acquireShapedRun` / `releaseShapedRun` with a bounded pool (64 entries), `WeakSet` membership mirror for O(1) double-release detection, and a guard seam (`setShapedRunReleaseGuard`) that the guard module installs.

**Cache.** `createTextShaperCache` / `clearTextShaperCache` / `disposeTextShaperCache` / `shapeTextRunCached` with stable string-key derivation from text + format + options.

**Signals.** `enableTextShaperSignals` / `disposeTextShaperSignals` / `getTextShaperSignals`. `onBackendChanged` signal built with `createSignal` from `@flighthq/signals`. Opt-in, costs nothing when not enabled.

**Guards.** `enableTextShaperGuards` / `disableTextShaperGuards`. Warns via `logOnce` on double-release. Separately importable; `@flighthq/log` dependency stays in this module only.

## Gaps

Every item is verified against the live tree on 2026-09-02. File and line references name this tree's source.

1. **The full-glyph tier has zero real-world callers.** No backend in the repo implements `shapeRun` (`@flighthq/textshaper-canvas` provides `measureText` and `getFontMetrics` only). `shapeTextRun` therefore always returns `null`; `shapeTextRuns`, `shapeTextRunCached`, the cluster helpers, and the pool have no call sites outside their own tests.

2. **Public lane omits backend registration.** `getTextShaperBackend`, `setTextShaperBackend`, `explainTextShaperOperation`, and `hasTextShaperOperation` are exported from `contract.ts` (via `export * from './textShaper'`) but absent from `index.ts`. The SDK barrel (`packages/sdk/src/index.ts`) re-exports the `.` lane, so `@flighthq/sdk` users cannot install or query a backend. Only `measureText` reaches the app boundary. This was a deliberate choice (intra-SDK consumers use the `/contract` lane), but it means an end-user application importing from `@flighthq/sdk` cannot set up text shaping without importing directly from `@flighthq/textshaper/contract` or `@flighthq/textshaper-canvas`.

3. **`getCaretPositionsForRun` comment contradicts its code.** The comment (`textShaperCluster.ts` lines 7-9) states "this respects per-glyph xOffset (mark attachment, kerning corrections)"; the loop (lines 17-20) sums only `xAdvance` and never reads `xOffset`. Mark attachment positioning and kerning corrections recorded in `xOffset` are silently dropped.

4. **`index.ts` alphabetical ordering is broken.** `disposeTextShaperSignals` (line 8) precedes `disableTextShaperGuards` (line 9); alphabetically `disable*` < `dispose*`.

5. **`TextShaperCache._entries` is a public field named as internal.** `TextShaperCache` (`packages/types/src/TextShaperCache.ts`) declares `readonly _entries: Map<string, ShapedRun>`. The underscore prefix signals internal, but the field is `readonly` (not private), and `textShaperCache.ts` calls `cache._entries.clear()` / `.get()` / `.set()` directly. Consumers of the type see `_entries` on the type surface.

6. **`disposeTextShaperCache` and `clearTextShaperCache` are identical.** Both call `cache._entries.clear()` with no additional teardown. The dispose comment says "the cache must not be used after this call" but nothing enforces it (no null-out, no flag). A caller that disposes then reuses sees no error.

7. **`itemizeText` carries its own simplified bidi-class table** (`textShaperItemize.ts` lines 103-132) while `@flighthq/textbidi` has the real Unicode bidi implementation; `package.json` does not depend on `textbidi`. Whether itemization should consume that package or keep a self-contained fallback is undecided (charter is silent).

8. **Font introspection wrappers absent.** No `getFontFeatures` / `getFontScripts` / `getFontLanguages` / `getFontVariationAxes` wrapper, and `TextShaperBackend` declares no matching method. The `FontVariationAxis` type in `@flighthq/types` has no producer on either side of the seam. `TextShaperOptions.features`, `.variations`, and `.language` exist on the options type but no wrapper or backend method consumes them.

9. **No incremental reshape.** No `reshapeTextRun` or equivalent for typing-into-a-paragraph -- every edit reshapes from scratch.

10. **No font-fallback seam.** No `FontFallbackBackend` for resolving `.notdef` against a system font chain; ownership between textshaper and font is undecided.

## Charter contradictions

1. **Charter says `shapeTextRunInto` was missing `options` (decision item 2).** This has been fixed: `shapeTextRunInto` now accepts `options?: ShapeRunOptions` as its fourth parameter and forwards it to the backend (`textShaperRun.ts` line 117). The fix landed; this is no longer a contradiction.

2. **Charter says drop gratuitous cast in `getFontUnitScale` (decision item 3).** Fixed: the function reads `format.size ?? 12` directly (`textShaperRun.ts` line 55) with no cast. Landed.

3. **Charter says fix signal type mismatch (decision item 4).** Fixed: `onBackendChanged` is built with `createSignal` (`textShaperSignals.ts` line 16). Landed.

4. **Charter says `index.ts` is not alphabetized (Open item in status.md).** Still true: `disposeTextShaperSignals` precedes `disableTextShaperGuards` in `index.ts` lines 8-9.

All six charter decisions are landed. The remaining charter open directions (glyph format-awareness, HarfBuzz backend, textlayout migration, font-fallback seam, package-map update) are still open.

## Contract & docs fit

**Export lanes.** Two blessed lanes (`.` and `./contract`) correctly configured in `package.json`. `contract.ts` uses `export *` from all modules; `index.ts` uses a curated named re-export list from `./contract`. The internal `_textShaperHooks.ts` is excluded from both.

**sideEffects.** `"sideEffects": false` in `package.json`. Verified: no top-level registration, no global mutation, no listeners at import time. Module-scoped `let _backend` and `let _signals` are private nullable slots, not side effects.

**Dependencies.** `@flighthq/types`, `@flighthq/signals`, `@flighthq/log`. All three are appropriate: types is universal, signals is used by `textShaperSignals.ts`, log is used by `enableTextShaperGuards.ts`. No circular dependencies. No dependency on `@flighthq/sdk`.

**Types-first.** All exported types (`TextShaperBackend`, `TextShaperOperation`, `ShapeRunOptions`, `ShapedRun`, `ShapedGlyph`, `FontMetrics`, `GlyphExtents`, `TextItem`, `TextShaperCache`, `TextShaperSignals`, `TextShaperOptions`, `FontVariationAxis`, `BackendOperationExplanation`) live in `@flighthq/types`. The implementation package exports functions only. Correct.

**Naming.** Full, unabbreviated type names throughout: `getGlyphExtentsBatch`, `getCodePointForGlyph`, `shapeTextRunInto`, `enableTextShaperGuards`. `get*` / `create*` / `clear*` / `shape*` / `acquire*` / `release*` / `enable*` / `disable*` / `dispose*` / `has*` / `explain*` verbs used correctly. No abbreviations.

**Readonly.** All format/input parameters use `Readonly<TextFormat>`, `Readonly<ShapeRunOptions>`, `Readonly<ShapedRun>` where appropriate. Out-parameters are mutable.

**Sentinels.** No throws for expected failures. `measureText` returns `-1`; `getFontMetrics`/`getGlyphExtents` return `null`; `shapeTextRun` returns `null`; `getGlyphName` returns `''`; `getFontUnitScale` returns `-1`; `getGlyphIndexForCodePoint`/`getCodePointForGlyph` return `-1`; `shapeTextRunInto`/`getFontMetricsInto`/`getGlyphExtentsInto` return `false`.

**Teardown vocabulary.** `dispose*` for GC-eligible teardown (cache, signals); `release*` for pool bracket return; `clear*` for content-only reset. No `destroy*` (no GPU resources). Consistent with the codebase contract except the `dispose`/`clear` identity issue noted in gap 6.

**Tests.** One test file per source file, colocated, `*.test.ts`. `describe` blocks mirror exported function names. The tests verify no-backend, advances-only, and full-backend paths, alias safety for `*Into` functions, pool invariants, cache hit/miss, signal lifecycle, and guard warnings. 115 test cases for 34 exports is solid coverage by count, though all glyph-tier tests run against synthetic mock backends.

**Source style.** Exported functions are alphabetized within each file. Module-scoped variables are at the bottom. No structural divider comments. No inline TODOs. Comments are durable-semantic (coordinate-space, allocation, ownership rules). No `Co-Authored-By` trailers in commit convention.

## Candidate open directions

1. **Decide on public-lane backend access.** The `.` lane exposes `measureText` but not `setTextShaperBackend`. An SDK user cannot set up shaping without reaching for `/contract`. Either promote the backend registration pair to the public lane or document that backend setup is a contract-lane operation.

2. **Fix `getCaretPositionsForRun` xOffset omission.** The comment promises mark-attachment and kerning-correction awareness; the code does not deliver it. Either incorporate `xOffset` into the position accumulation or correct the comment to match the code.

3. **HarfBuzz backend (charter open direction 2).** The gate that turns the inert glyph tier into a live pipeline. Separate package, wasm strategy needed.

4. **Glyph introspection format-awareness (charter open direction 1).** The `_format` parameter on glyph-introspection wrappers is unused because `TextShaperBackend` glyph methods are glyphId-only. A full shaper needs the format to select the correct font face. Decide before building the HarfBuzz backend.

5. **textlayout measure-provider to `ShapedRun` migration (charter open direction 3).** Cross-package coordination. `textlayout` currently consumes only the scalar `measureText` path.

6. **`FontFallbackBackend` seam ownership (charter open direction 4).** Font fallback for `.notdef` resolution. Ownership between textshaper and font packages is undecided.

7. **`itemizeText` bidi-table consolidation.** Decide whether to depend on `@flighthq/textbidi` for accurate bidi classification or keep the self-contained fallback.

8. **Font-introspection surface.** `getFontFeatures`, `getFontScripts`, `getFontLanguages`, `getFontVariationAxes` -- the backend methods and wrapper functions are both absent. `FontVariationAxis` and `TextShaperOptions.variations`/`.features`/`.language` types exist with no code to drive them.

9. **Fix `index.ts` alphabetical ordering.** Move `disableTextShaperGuards` before `disposeTextShaperCache`.

10. **Enforce `disposeTextShaperCache` finality.** Either differentiate the implementation from `clearTextShaperCache` (null-out `_entries`, flag-check on reuse) or merge them into a single function.
