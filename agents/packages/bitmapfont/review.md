---
package: '@flighthq/bitmapfont'
status: solid
score: 88
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# bitmapfont — Review

## Verdict

solid — 88/100. The package realizes the charter's full bedrock model: an immutable multi-page `BitmapFont` value with pure lookups, supplementary-plane-safe kerning, the `GlyphSource` seam adapter, the bake-from-`GlyphAtlas` snapshot, diagnostics (guards + explain), and a summary query. All four items the prior assessment recommended are landed. The remaining distance is design-fork work the charter explicitly parks as open directions (SDF parameters, fallback composition, replacement-glyph convention), not missing structure within the decided scope.

## Present capabilities

### Construction

- **`createBitmapFont(data)`** (`bitmapFont.ts`) — builds the immutable value from plain `BitmapFontData`. Glyph list becomes `Map<codepoint, GlyphEntry>` with per-glyph `page` (default 0, out-of-range clamped to 0 with guard-seam notification). Kerning pairs packed via `left * 0x110000 + right` (full Unicode range, safe-integer arithmetic — the old `(left << 16) | right` aliasing bug is fixed and the fix is commented). `pages` defensively sliced, metrics copied, `encoding` defaults `'raster'`.
- **`createBitmapFontFromGlyphAtlas(atlas)`** (`bitmapFontFromGlyphAtlas.ts`) — freezes a live `GlyphAtlas` into a static `BitmapFont`. Snapshot semantics: later rasterization into the source atlas does not reach the font. Creates a single-page `TextureAtlas` over a bitmap-sourced `Texture` (CPU-only, no GPU work). This is the charter's "bakeBitmapFont target" decision realized.

### Pure lookups

- **`getBitmapFontGlyph(font, codepoint)`** — null sentinel for absent codepoint. Returns stable (same object) entry across calls.
- **`getBitmapFontKerning(font, left, right)`** — 0 sentinel. Supplementary-plane-safe: tested with U+10000, U+1F600, and the full U+10FFFF boundary.
- **`getBitmapFontMetrics(font)`** — ascent/descent/lineGap.
- **`getBitmapFontPage(font, page = 0)`** — null out of range.
- **`getBitmapFontPages(font)`** — the page-indexed atlas list.
- **`hasBitmapFontGlyph(font, codepoint)`** — boolean coverage predicate beside the null-sentinel lookup.

### Kerning key utilities (contract lane only)

- **`packBitmapFontKerningKey(left, right)`** / **`unpackBitmapFontKerningKey(key, out)`** — the encode/decode pair for the `left * 0x110000 + right` key, exported on the contract lane for `bitmapfont-formats`. `unpack` writes into an `out` parameter (no allocation). Both tested across the full Unicode range including keys exceeding 2^32.
- **`setBitmapFontGuard`** — internal seam for the guard module, contract-only.

### GlyphSource seam adapter

- **`createGlyphSourceFromBitmapFont(font)`** (`bitmapFontGlyphSource.ts`) — binds the pure lookups into the `GlyphSource` method object. `getGlyphAtlasImage(page)` resolves through the flat texture model (`pages[page]?.texture` then `texture.dimension === '2d' ? texture.source : null`). `getGlyphLayoutVersion()` returns a constant 0, because a pre-baked font never relocates a glyph. Tested with single-page and multi-page fonts.

### Diagnostics

- **`enableBitmapFontGuards()` / `disableBitmapFontGuards()`** (`enableBitmapFontGuards.ts`) — opt-in push-style warning through `@flighthq/log` when `createBitmapFont` silently clamps an out-of-range page. Uses `logOnce` keyed by `'bitmapfont:page-out-of-range'`. Message names the codepoint, the bad page index, and that the font data (not the atlas) is at fault. Follows the diagnostics convention: the core carries the seam (`setBitmapFontGuard`), the guard module carries the messages and the `@flighthq/log` dependency.
- **`explainBitmapFontGlyph(font, codepoint)`** (`explainBitmapFontGlyph.ts`) — pull-style plain-data explanation returning `BitmapFontGlyphExplanation` with `reason` (`'ok' | 'no-glyph' | 'no-pages' | 'empty-glyph'`), `renderable`, `page`, `pageCount`, `glyphWidth`, `glyphHeight`. Priority order: no-glyph, then no-pages (more actionable than size), then empty-glyph, then ok. `page` is -1 when there is no glyph (0 would alias a real page index).

### Summary / reporting

- **`summarizeBitmapFont(font)`** (`summarizeBitmapFont.ts`) — returns `BitmapFontSummary`: `glyphCount`, `kerningPairCount`, `pageCount`, `byteSize` (summed via `getTextureAtlasByteSize`, a lower bound for partly-loaded fonts), `minCodepoint` / `maxCodepoint` (-1 for both when empty, since 0 would alias U+0000). Tested with multi-page fonts, unresolved pages, supplementary-plane glyphs, and empty fonts.

### Test coverage

49 tests across 6 colocated test files (all green). Coverage highlights:
- Supplementary-plane kerning: five dedicated tests verifying that U+10000/U+0000 and U+1F600/U+F600 aliasing is gone, right-glyph carry-over is gone, the full codepoint boundary works, and safe-integer range holds.
- `unpackBitmapFontKerningKey`: out-parameter reuse, keys exceeding 2^32, round-trip with pack.
- Guard seam: tested independently from the guard module (seam fires, passes reason + codepoint + page; uninstalls cleanly).
- `explainBitmapFontGlyph`: all four reason branches, priority ordering (no-pages before empty-glyph), -1 page sentinel.
- `createBitmapFontFromGlyphAtlas`: snapshot isolation (later atlas rasterization does not reach the font), empty atlas, metrics carry-over, page texture source identity.

## Gaps

- **SDF/MSDF parameters.** `encoding` distinguishes `'raster' | 'sdf' | 'msdf'` but carries no field-range/spread data. A distance-field renderer needs at least the field range. `bitmapfont-formats` reads `distanceField.range` from BMFont JSON and discards the range value. This is an acknowledged design fork (charter Open direction 1; assessment Backlog).
- **Fallback-chain `GlyphSource` composition.** No way to compose multiple `GlyphSource`s (e.g. bitmap font primary + dynamic atlas fallback) behind one seam. Charter Open direction 2; placement question (this package vs. `glyphatlas` vs. neutral home).
- **`.notdef` / replacement-glyph convention.** No model for an explicit replacement glyph when a codepoint is missing. The null sentinel + `explainBitmapFontGlyph` tell the caller what happened, but there is no mechanism for "draw this substitute glyph instead." Assessment Backlog item.
- **No `cloneBitmapFont` or `disposeBitmapFont`.** The font is immutable and GC-eligible, so clone is trivial (share the maps) and dispose is arguably unnecessary, but neither exists. The atlas page textures may hold GPU resources; a `destroyBitmapFont` that calls through to destroy each page's texture would give explicit teardown for the GPU path.

## Charter contradictions

None against the North star or Decisions. One stale boundary:

- The charter's Boundaries section states "Depends on `@flighthq/textureatlas` (the glyph atlas) + `@flighthq/types`." The actual production dependencies are `@flighthq/log`, `@flighthq/texture`, `@flighthq/textureatlas`, and `@flighthq/types`. The `log` dependency is justified by the diagnostics convention (guard module); `texture` is justified by `createBitmapFontFromGlyphAtlas` (wrapping the atlas bitmap in a `Texture`). Both additions follow from charter Decisions that postdate the Boundaries text, so the boundary statement is stale rather than violated. A charter update would align it.

## Contract & docs fit

- **Types in `@flighthq/types`:** `BitmapFont`, `BitmapFontData`, `BitmapFontGlyphData`, `BitmapFontKerningData`, `BitmapFontKerningPair`, `BitmapFontEncoding`, `BitmapFontGlyphExplanation`, `BitmapFontGlyphExplanationReason`, `BitmapFontSummary`, `BitmapFontParseOptions` (consumed by `bitmapfont-formats`), `BitmapFontRecord` family (consumed by `bitmapfont-formats`). All in their proper home; no types defined inline in the implementation package.
- **Naming:** Full unabbreviated type names in every function (`createBitmapFont`, `getBitmapFontGlyph`, `hasBitmapFontGlyph`, `explainBitmapFontGlyph`, `summarizeBitmapFont`, `createBitmapFontFromGlyphAtlas`, `createGlyphSourceFromBitmapFont`). Globally self-identifying.
- **Sentinels not throws:** `getBitmapFontGlyph` returns null, `getBitmapFontKerning` returns 0, `getBitmapFontPage` returns null. No throws anywhere. Page clamp is a silent repair with a guard seam, not an exception.
- **Export lanes:** Two blessed lanes. Public (`.`) exports 13 functions. Contract (`./contract`) additionally exports `packBitmapFontKerningKey`, `unpackBitmapFontKerningKey`, `setBitmapFontGuard`. No other subpaths.
- **`sideEffects: false`:** Declared; no top-level registration, no globals patched.
- **Out-parameter discipline:** `unpackBitmapFontKerningKey` writes into caller-supplied `out` and returns it; tested with reuse across calls.
- **`Readonly<T>`:** All `font` parameters typed `Readonly<BitmapFont>`, `data` typed `Readonly<BitmapFontData>`, `atlas` typed `Readonly<GlyphAtlas>`.
- **Diagnostics convention:** Guard seam in core (`setBitmapFontGuard`), messages + log dep in separately-importable `enableBitmapFontGuards`, pull-style `explainBitmapFontGlyph` returning plain data. Correct inversion.
- **Module-variable placement:** `UNICODE_CODEPOINT_SPACE` constant and `_guard` mutable at bottom of `bitmapFont.ts`, after exported functions.

### Candidate contract/docs revisions

- Charter Boundaries should list `@flighthq/log` and `@flighthq/texture` alongside `textureatlas` and `types`, reflecting the guard module and the bake function.
- The `GlyphSource` interface comment in `types/src/GlyphSource.ts` (line 7) still refers to "the planned `@flighthq/bitmapfont`" — it is no longer planned; the static implementation exists.

## Candidate open directions

1. **Distance-field parameters.** Where do field range/spread live: on `BitmapFont` (per-font), per-glyph, or on a separate `BitmapFontSdfConfig` type? The `bitmapfont-formats` parser already reads and discards `distanceField.range`; the model decision gates preserving it. (Carried from prior review; charter Open direction 1.)
2. **Fallback composition.** A `GlyphSource` combinator that tries sources in order (bitmap font, then dynamic atlas for misses). Placement question: this package, `glyphatlas`, or a neutral home? (Carried from prior review; charter Open direction 2.)
3. **Replacement-glyph convention.** Should `BitmapFont` model an explicit `.notdef` glyph, or is fallback purely the composition chain? Real font formats carry one; the current model has no mechanism for it.
4. **Teardown.** Should this package export `destroyBitmapFont` for explicit GPU-resource cleanup of page textures, or is that the renderer's concern? The font is immutable and GC-eligible in the CPU model, but page textures may hold GPU buffers.
