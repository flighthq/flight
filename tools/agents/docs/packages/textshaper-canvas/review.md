---
package: '@flighthq/textshaper-canvas'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/textshaper-canvas.md
  - source
  - incoming/builder-67dc46d64
---

# textshaper-canvas — Review

## Verdict

**solid — 82/100.** A faithful, idiomatic Canvas 2D backend for the text-shaping seam that has grown well past the 70/100 advances-only adapter the depth review surveyed: it now implements `getFontMetrics`, plumbs `letterSpacing`/`direction` into the measuring context, memoizes advances, prefers `OffscreenCanvas`, and degrades to a documented sentinel in no-DOM environments. The score is held below the worker's claimed 88 by one real correctness bug — the advance cache key omits `letterSpacing`, so the newly-added letterSpacing plumbing is silently defeated under cache hits — and by a `unitsPerEm: 0` sentinel that violates the `FontMetrics` contract's own division formula. Both are within-package fixes; neither is a design fork.

## Status claims — verified against the diff

Every claim in `status.md` checks out against `incoming/builder-67dc46d64`:

- `clearCanvasTextShaperBackendCache(backend)` and the `CanvasTextShaperBackend extends TextShaperBackend { clearCache() }` interface are present in source and in the realized `dist/canvasTextShaper.d.ts`. ✓
- `getFontMetrics`, `letterSpacing`/`wordSpacing`/`direction` feature-detect plumbing, the bounded 512-entry advance cache with oldest-first eviction, the `OffscreenCanvas`-then-`document` context path, and the `_createSentinelBackend()` (-1 / null) guard are all in `canvasTextShaper.ts`. ✓
- The three types-index additions (`TextDirectionKind`, `TextFeature`, `TextShaperOptions`) are present in `head/packages/types/src/index.ts` (lines 411, 412, 433). ✓
- 15 tests present and aligned. ✓

The status doc is accurate. Two of its own footnotes turn out to understate the situation — see Gaps.

## Present capabilities

Source: `incoming/builder-67dc46d64:packages/textshaper-canvas/src/canvasTextShaper.ts`.

- **`createCanvasTextShaperBackend(): CanvasTextShaperBackend`** — the constructor. Owns exactly one private `OffscreenCanvas`/`HTMLCanvasElement` 2D context, no shared global state, no top-level side effects. Returns the sentinel backend when no context can be created.
- **`measureText(text, format)`** — sets `context.font = computeTextFormatFontString(format)` (the same font-string builder the renderers use, so advances match rasterization), plumbs `letterSpacing`/`wordSpacing`/`direction` under a one-time feature-detect, and returns `context.measureText(text).width`. Memoized in a per-backend `Map<string, number>` keyed by `${fontString}\x00${text}`, capped at `_CACHE_MAX_SIZE` (512) with oldest-first eviction.
- **`getFontMetrics(format): FontMetrics | null`** — probes `'H'`/`'x'` for cap/x-height ink extents via `actualBoundingBoxAscent`, reads `fontBoundingBox*` (falling back to `actualBoundingBox*`) for ascent/descent, and supplies size-relative estimates for `underlinePosition`/`underlineThickness`/ `lineGap`. This is the highest-value depth gain the depth review left on the table, now delivered.
- **`clearCanvasTextShaperBackendCache(backend)`** — pure explicit cache-invalidation hook for the webfont-load case. No `document.fonts` listener is registered (correctly keeps the package side-effect-free).
- **Sentinel backend** — `_createSentinelBackend()` yields `-1` / `null` / no-op `clearCache`, matching the platform-suite "sentinel over throw" convention; the depth review's no-DOM gap is closed.
- Packaging is clean: `"sideEffects": false`, single `.` export, deps limited to `@flighthq/render`, `@flighthq/textshaper`, `@flighthq/types`; `crate: null` is correct (Canvas2D substrate is not in the Rust box).

## Gaps

Ordered by value. The first two are correctness defects, not missing features.

1. **The advance cache key omits `letterSpacing` (and `wordSpacing`/`direction`) — the new letterSpacing plumbing is silently defeated under cache hits.** `computeTextFormatFontString` (verified in `head/packages/render/src/.../renderTextFormat.ts`) encodes only italic/bold/size/family — _not_ `letterSpacing`. The cache key is `${fontString}\x00${text}`. So `measureText('hi', { letterSpacing: 0 })` then `measureText('hi', { letterSpacing: 8 })` returns the first (zero-spacing) width for the second call: the cache hit short-circuits before `ctx.letterSpacing` is ever set. The very property the session added is dead on the second measurement of any (font, text) pair. The cache key must incorporate every advance-affecting field the context sets — minimally `letterSpacing`. (jsdom's `measureText` returns 0 for everything, so no test catches this; this is exactly why the format-field matrix the status doc defers to a functional scene matters.) **Within-package fix.**

2. **`getFontMetrics` returns `unitsPerEm: 0`, which breaks its own documented division formula.** `FontMetrics.unitsPerEm`'s doc comment says "Divide pixel measurements by `size / unitsPerEm` to convert back to font units." A consumer following that contract divides by zero. The depth-review intent — Canvas cannot read OS/2 — is right, but `0` is not a safe sentinel for a _divisor_. Either the field needs an explicit "0 = unavailable, do not invert" carve-out in the `FontMetrics` doc (a `@flighthq/types` change, so a candidate revision, not a within-package fix) or this backend should return `unitsPerEm: size` (identity, so the inverse is a no-op). The current pairing is a latent trap.

3. **`shapeRun?` is not explicitly present as a `null`-returning marker.** The seam grew to ten optional methods (`getCodePointForGlyph`, `getFontFeatures`, `getFontLanguages`, `getFontMetrics`, `getFontScripts`, `getFontVariationAxes`, `getGlyphExtents`, `getGlyphIndexForCodePoint`, `getGlyphName`, `shapeRun`). All glyph-level ones are correctly missing-by-design — Canvas cannot produce glyph ids. But `TextShaper.ts` documents the intended protocol as _"callers check for `shapeRun` availability and fall back gracefully when it is absent."_ The backend relies on absence rather than an explicit `shapeRun: () => null`. Either is contract-valid; the status doc's own suggestion #2 (add it as an explicit "advances-only tier" marker) would make the tier boundary self-documenting. Worth a deliberate call.

4. **`getFontMetrics` ascent/descent can fall through to `actualBoundingBox*` of `'H'`** when `fontBoundingBox*` is undefined. `actualBoundingBoxDescent` of `'H'` is ~0 (no descender), so on engines lacking `fontBoundingBox*` the descent collapses to near-zero — wrong for layout. The fix would probe a descender glyph (e.g. `'g'`/`'y'`) for the fallback. Minor, engine-dependent.

5. **`wordSpacing` and `TextFormat.direction` are unplumbed because the fields do not exist.** Verified: `TextFormat` has `letterSpacing` and `kerning` but no `wordSpacing`/`direction`. The backend sets `ctx.wordSpacing = '0px'` and `ctx.direction = 'ltr'` as constants. These are correctly deferred multi-package header decisions, not omissions here.

6. **No functional/visual coverage that measured advances equal the Canvas renderer's drawn extents.** jsdom's `measureText` returns 0, so all 15 unit tests can only assert non-throw, type, and monotonic-length behavior — none assert a real width, and bug #1 slipped through precisely because of this. The only meaningful correctness test is a `tools/functional` scene. (Cross-package; a candidate open direction, not a within-package add.)

## Charter contradictions

None — the charter's North star, Boundaries, Decisions, and Open directions are all still `TODO` stubs (only "What it is" is seeded). There is no stated principle to contradict. Per the rubric rule, this review falls back to the codebase-map AAA standard; every assumption I had to make is surfaced as a candidate open direction below.

## Contract & docs fit

**Lives up to the contract:**

- Full unabbreviated names (`createCanvasTextShaperBackend`, `clearCanvasTextShaperBackendCache`), `create*`/`clear*` verbs used correctly, globally self-identifying.
- Sentinels-not-throws: `-1` / `null` on the no-context path, no throws at construction. ✓
- `@flighthq/types`-first: `FontMetrics`, `TextShaperBackend`, `TextFormat` all consumed from `@flighthq/types`; no cross-package types defined inline. ✓
- Single root `.` export, `"sideEffects": false`, no top-level registration. ✓
- `crate: null` is correct and matches the conformance posture (Canvas2D substrate not in the Rust box; the seam, not this impl, is what the Rust shaper conforms to).
- The file-head doc comment is exemplary — records extraction lineage, ownership, the measurement↔rasterization consistency guarantee, and the advances-only scope. Matches the source-style rule for comments that carry rules a name cannot.

**Candidate revisions (the user's gate, not mine):**

- **`FontMetrics.unitsPerEm` doc** in `@flighthq/types` should carve out the "0 = unavailable, do not invert" case, or the type should not promise an invertible divisor that a legitimate backend cannot supply. This is the root of Gap #2 and it lives in the header, not here.
- **Package Map** (`tools/agents/docs/index.md`) has no line for `@flighthq/textshaper-canvas` (nor for `@flighthq/textshaper`). The `text-shaping` entry still reads _"designed, not yet built"_ and names a hypothetical `@flighthq/text-shaping` package, but the seam now ships as `textshaper` + this `textshaper-canvas` backend with a wide `TextShaperBackend` interface. The map is stale against the shape the work took — both packages need Package Map entries and the `text-shaping` line needs reconciling with the realized `textshaper` name.
- **`ctx.letterSpacing` cast** through `unknown as Record<string, unknown>` is a TypeScript lib lag, not a code smell — leave a note for a future lib bump to remove it. (Informational.)

## Candidate open directions

The charter is a stub, so these are the questions a reviewer had to assume answers to. Each should feed `charter.md › Open directions` for the user to settle:

1. **What is the bar for "the Canvas tier is complete"?** Is advances + `getFontMetrics` the intended ceiling (everything glyph-level delegated to HarfBuzz), or is a richer measure tier (per-cluster advance segmentation via `Intl.Segmenter` for caret/selection on emoji and combining marks) in scope for _this_ package? The status doc parks `Intl.Segmenter` as Gold; whether it belongs here or in `textlayout` is undecided.
2. **Should `getFontMetrics` be wired into `@flighthq/textlayout`** so layout/autoSize uses real Canvas-derived ascent/descent instead of size estimates? This is the natural consumer of the new metric, and nothing reads it today — the capability exists but is unconsumed. Cross-package.
3. **Is the explicit-`shapeRun: () => null` marker the intended protocol** (Gap #3), or is absence the blessed signal? This is a seam-wide convention question affecting every advances-only backend.
4. **Where does the measurement↔rasterization parity test live** (Gap #6) — a functional scene owned here, or in `textlayout`/`render-canvas`? It is the only test that can catch bugs like the letterSpacing cache-key defect, so its home is load-bearing.
5. **Boundary with a future `textshaper-harfbuzz`** — the charter should state explicitly that glyph-level methods are permanently out of scope for the Canvas backend (missing-by-design), so a later agent does not mistake them for gaps to fill.
