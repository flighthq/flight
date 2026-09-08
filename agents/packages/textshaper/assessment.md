---
package: '@flighthq/textshaper'
updated: 2026-09-08
basedOn: ./review.md
---

# textshaper — Assessment

Refreshed 2026-09-08 from the 2026-09-02 re-review (`review.md`). Prior assessment's 7 landed items confirmed still landed. All 10 review gaps verified open against source. 126 test cases across 9 test files. Score aligned to review: 62/100.

## Directed

_None._

## Recommended

Strictly sweep-safe: within `@flighthq/textshaper`, no unresolved design decision.

- **Alphabetize `index.ts` exports.** `disposeTextShaperSignals` precedes `disableTextShaperGuards` — out of order.
- **Resolve `disposeTextShaperCache` / `clearTextShaperCache` duplication.** Both bodies are `cache._entries.clear()`. `dispose` has comment-only finality with no enforcement. Either remove one or give `dispose` distinct teardown semantics.
- **Fix `getCaretPositionsForRun` xOffset contradiction.** Comment at `textShaperCluster.ts:8` promises xOffset awareness; line 18 sums only `xAdvance`. Comment-vs-code correctness bug.
- **Fix `TextShaperCache._entries` public-as-internal.** `types/src/TextShaperCache.ts:5` exposes `_entries` as a public `readonly` field. Should be on the runtime or behind an accessor.

## Depth gaps

1. **Full-glyph tier has zero real callers.** `textshaper-canvas` does not implement `shapeRun`; no callers of `shapeTextRun`/`shapeTextRuns`/`shapeTextRunCached` exist outside tests. The glyph tier is architecturally complete but inert.
2. **Public lane omits backend registration.** `getTextShaperBackend`/`setTextShaperBackend`/`explainTextShaperOperation`/`hasTextShaperOperation` are contract-only. End users cannot set a backend without importing `./contract`.
3. **`itemizeText` self-contained bidi table.** No dependency on `@flighthq/textbidi`; status.md confirms undecided.
4. **Font introspection absent.** No `getFontFeatures`/`getFontScripts`/`getFontVariationAxes` in source or backend type.
5. **No incremental reshape.** No `reshapeTextRun` or equivalent.
6. **No font-fallback seam.** No `FontFallbackBackend`; ownership undecided.

## Backlog

- **Glyph introspection format-awareness.** Per charter Open direction #1. Needs design decision before HarfBuzz backend.
- **HarfBuzz backend.** Per charter Open direction #2. Separate package, wasm strategy needed.
- **textlayout → `ShapedRun` migration.** Per charter Open direction #3. Cross-package coordination.
- **`FontFallbackBackend` seam.** Per charter Open direction #4.

## Landed

1. ~~**Rename `shapeText` to `measureText`.**~~ Landed.
2. ~~**Forward `options` through `shapeTextRunInto`.**~~ Landed.
3. ~~**Drop gratuitous cast in `getFontUnitScale`.**~~ Landed.
4. ~~**Fix signal type mismatch.**~~ Landed.
5. ~~**Normalize unused `format` parameter naming.**~~ Landed.
6. ~~**Package Map description update.**~~ Landed.
7. ~~**Add `enableTextShaperGuards` for the pool brackets.**~~ Landed.

## Approved

- [2026-07-02 · picked] Sweep items 1–6: measureText rename, options forward, cast drop, signal fix, param naming, Package Map
