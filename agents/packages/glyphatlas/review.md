---
package: '@flighthq/glyphatlas'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# glyphatlas — Review

## Verdict

solid — 68/100. The orchestration core the charter calls "the tested core" is genuinely there — rasterize-on-miss behind a swappable backend, incremental shelf packing, LRU eviction with repack, dirty-region tracking, and the page-aware `GlyphSource` adapter. But three blessed charter items are unrealized (`bakeBitmapFont`, byte/area budget, multi-page surfaces) and the metrics/kerning placeholders make it a geometry-correct but typography-approximate cache today.

## Present capabilities

- **Entity + lifecycle** (`packages/glyphatlas/src/glyphAtlas.ts`) — `createGlyphAtlas(options)` (surface, empty cache, fresh shelf packer, padding default 1, `maxGlyphs` LRU budget), `disposeGlyphAtlas` (correctly `dispose*`, with the GPU-texture ownership note), `getGlyphAtlasSurface`, and the `deriveGlyphMetricsFromFontSize` 0.8/0.2 placeholder.
- **Rasterize-on-miss** (`glyphAtlasEntry.ts`) — `getGlyphAtlasEntry`: cache hit touches LRU; miss rasterizes via the active backend, rejects glyphs larger than the usable atlas, evicts past the glyph budget, places via best-height-fit shelf packing (`_placeGlyphOnShelf`), falls back to evict+repack loops on exhaustion, blits via `@flighthq/surface` (`createSurfaceRegion`/`writeSurfacePixels`), unions the dirty rect, and stamps `page: 0`. `_repackGlyphAtlas` re-places survivors tallest-first, re-blits from retained source bitmaps, and full-dirties the atlas.
- **Dirty region** (`glyphAtlasDirty.ts`) — `getGlyphAtlasDirtyRegion` (fresh `Rectangle` or null) + `clearGlyphAtlasDirty`, the incremental-upload bracket.
- **Rasterizer seam** (`glyphRasterizerBackend.ts`) — `get`/`set`/`createWebGlyphRasterizerBackend`; the web backend lazily acquires `OffscreenCanvas`-then-DOM-canvas, measures with `actualBoundingBox*`, fills white-on-transparent at the baseline with a 1px AA guard, returns straight-alpha RGBA; null sentinels for no-context, zero-ink, and thrown `getContext`.
- **`GlyphSource` adapter** (`glyphSource.ts`) — `createGlyphSourceFromGlyphAtlas` binding entry/kerning/metrics/`getGlyphAtlasImage(page)` (page 0 = the surface, else null), per the page-aware seam decision.
- Tests cover cache/evict/repack invariants (non-overlap after repack), dirty-region lifecycle, blit correctness, sentinels, and seam swapping — the orchestration is tested with a mock rasterizer, per the charter's backend-independence intent.

## Gaps

- **`bakeBitmapFont(atlas) → BitmapFont` does not exist.** A dated charter Decision ([2026-07-10]) and the stated composition direction; today it appears only in a comment in `@flighthq/types/src/BitmapFont.ts`. All ingredients exist (entries, bitmaps, surface, metrics).
- **Eviction budget is glyph-count, not byte/area.** The Decision says "Under a byte/area budget"; `maxGlyphs` counts entries. A memory-denominated budget is what a GPU cache actually manages against.
- **Kerning is a constant 0 and line metrics are the fontSize heuristic** (`glyphAtlasMetrics.ts`) — both documented placeholders (the charter boundary defers real metrics to `textshaper`'s `getFontMetrics`), but they cap layout fidelity for every consumer today. Canvas `measureText` exposes `fontBoundingBoxAscent/Descent`, which would already beat the 0.8/0.2 split without a new seam.
- **Single style per atlas, keyed by codepoint only** — `fontStyle`/`fontWeight` exist in `GlyphRasterizeOptions` but `createGlyphAtlas` never sets them and the cache key is the bare codepoint, so bold/italic variants need separate atlases (workable, but undocumented as the model).
- **No SDF/MSDF mode** (North star; Open direction 2) and **no multi-page surfaces** (the seam is page-ready per the decision; the cache itself is one page).
- **No guards/`explain*`** — a too-big glyph, a rasterizer returning null, or repack-dropped survivors are all silent nulls/omissions; the LRU thrash case (working set > budget) is invisible.
- `_touchGlyphLru`/eviction use `Array.indexOf`/`splice` — O(n) per hit on hot text; a linked or map-ordered LRU is the standard shape at scale.

## Charter contradictions

- **Byte/area budget vs. `maxGlyphs`** — the implemented budget contradicts the letter of the LRU decision (count vs. memory).
- **`bakeBitmapFont`** — a blessed decision not yet realized (unfinished rather than contradicted; nothing blocks it).
- Underscore-prefixed function names (`_placeGlyphOnShelf`, `_touchGlyphLru`, module-private) diverge from house naming style used elsewhere; cosmetic.

## Contract & docs fit

- Deps exactly `surface` + `geometry` + `types` per the charter boundary (binpack correctly deferred); `sideEffects: false` with lazy backend/context; sentinels not throws; seam types (`GlyphSource`, `GlyphEntry`, `GlyphMetrics`, `GlyphRasterizerBackend`, `GlyphAtlasRuntime`) in `@flighthq/types`.
- `agents/index.md` Package Map describes "`@flighthq/binpack`-backed batch repack on eviction" — **stale**: repack is the self-contained shelf packer; binpack is not a dependency. Candidate revision (or the code grows into the map's claim).

## Candidate open directions

- Cache identity: is one `GlyphAtlas` per (family, size, style, weight) the blessed model (with the key staying a bare codepoint), or should the entry key widen? Multi-style UIs hit this immediately.
- Should real line metrics arrive by taking `fontBoundingBox*` from the existing canvas backend (no new dep), or strictly via the `textshaper` seam the charter boundary names?
- For the byte/area budget: bytes of retained source bitmaps, atlas area occupancy, or both? The retained `bitmaps` map (needed for repack) roughly doubles memory per glyph and belongs in whatever budget is chosen.
