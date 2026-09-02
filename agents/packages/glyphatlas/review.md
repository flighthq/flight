---
package: '@flighthq/glyphatlas'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source
---

# glyphatlas — Review

## Verdict

solid — 82/100. Every chartered decision from 2026-07-10 has been realized or was realized in a sibling package where it belongs. The orchestration core is mature: rasterize-on-miss, incremental shelf packing, LRU eviction with O(1) recency, three-axis budgeting (bytes/area/count), repack with layout versioning, dirty-region tracking, the page-aware `GlyphSource` adapter, a three-layer backend provider (sentinel/host/custom) with per-atlas override, diagnostics (`enableGlyphAtlasGuards` + `explainGlyphAtlasEntry`), and a deterministic stub backend for CI. The remaining gaps are the North-star stretch items (SDF/MSDF, multi-page) and the still-placeholder kerning, none of which contradict the charter.

## Present capabilities

### Entity and lifecycle (`glyphAtlas.ts`, 110 lines)

- `createGlyphAtlas(options)` — allocates the atlas bitmap via `@flighthq/bitmap`, initializes the shelf packer, resolves metrics from the bound backend (with `deriveGlyphMetricsFromFontSize` as fallback), respects per-atlas `rasterizerBackend` override (charter Decision 2026-08-01). Options carry `fontStyle`/`fontWeight` threaded to the rasterizer.
- `disposeGlyphAtlas(atlas)` — correctly `dispose*` (CPU data, no GPU handle); clears entries, bitmaps, LRU, shelves, budgets; bumps `layoutVersion` so consumers invalidate baked rects.
- `getGlyphAtlasBitmap(atlas)` — the backing `Bitmap` for GPU upload.
- `getGlyphAtlasLayoutVersion(atlas)` — the rect-placement revision, bumped on repack and dispose, not on append or bare eviction.
- `deriveGlyphMetricsFromFontSize(fontSize)` — 0.8/0.2 Latin-typical heuristic fallback.

### Rasterize-on-miss and packing (`glyphAtlasEntry.ts`, 249 lines)

- `getGlyphAtlasEntry(atlas, codepoint)` — cache hit touches LRU (O(1) Map delete-then-set); miss rasterizes via the atlas's bound backend; rejects glyphs larger than usable area; evicts under three budgets (`maxGlyphs`, `maxBytes`, `maxArea`) before placement; incremental shelf placement with best-height-fit; falls back to evict+repack loops; blits via `createBitmapRegion`/`writeBitmapPixels`; unions the dirty rect; stamps `page: 0`. Returns null sentinel for two distinct failure cases (rasterizer-returned-null, glyph-larger-than-atlas) with a pluggable guard seam.
- `_repackGlyphAtlas(runtime)` — clears bitmap and shelves, re-places survivors tallest-first for tight packing, re-blits from retained source bitmaps, drops survivors that no longer fit, bumps `layoutVersion` unconditionally (before any placement). Full-dirties the atlas.
- `_isGlyphAtlasOverBudget` — three-axis budget check; 0 means unbounded; admits a single glyph larger than the whole budget.
- `_releaseGlyphBudget` — bookkeeping called before map mutations so running totals stay consistent.
- `setGlyphAtlasEntryGuard` — internal seam so the guard module installs its callback without adding weight to the hot path.

### Dirty region (`glyphAtlasDirty.ts`, 22 lines)

- `getGlyphAtlasDirtyRegion(atlas)` — fresh `Rectangle` (via `createRectangle`) or null.
- `clearGlyphAtlasDirty(atlas)` — resets after GPU upload.

### Line metrics and kerning (`glyphAtlasMetrics.ts`, 14 lines)

- `getGlyphAtlasMetrics(atlas)` — returns metrics resolved at construction: real `fontBoundingBoxAscent/Descent` from backends that implement `measureMetrics` (the web rasterizer in `host-web` does), else the 0.8/0.2 heuristic.
- `getGlyphAtlasKerning(atlas, left, right)` — constant 0, documented placeholder; the canvas rasterizer exposes no kerning table.

### Rasterizer backend provider (`glyphRasterizerBackend.ts`, 128 lines)

A three-layer provider: sentinel (returns null, no `measureMetrics`), host (installed via `installGlyphRasterizerHostBackend`, first-install-wins, conflict-flagged), custom (set/cleared via `setGlyphRasterizerBackend`). Resolution order: custom > host > sentinel. Per-atlas override via `GlyphAtlasOptions.rasterizerBackend` captures at construction.

- `createStubGlyphRasterizerBackend()` — deterministic opaque-white box backend for CI/headless; returns an `Entity`.
- `explainGlyphRasterizerBackend()` — `BackendExplanation` reporting layer, conflict, operation, viability (unobserved/available/runtime-api-unavailable).
- `explainGlyphRasterizerOperation(operation)` — per-operation availability; deliberately does not consult the sentinel.
- `hasGlyphRasterizerOperation(operation)` — boolean shorthand.
- `observeGlyphRasterizerHostResult(operation, succeeded)` — called by host backends to record viability transitions.
- `resetGlyphRasterizerBackendForTest()` — test teardown.

### GlyphSource adapter (`glyphSource.ts`, 31 lines)

- `createGlyphSourceFromGlyphAtlas(atlas)` — binds the atlas's free functions into the `GlyphSource` method-object seam, including `getGlyphLayoutVersion` and the page-aware `getGlyphAtlasImage(page)` (page 0 = bitmap, else null).

### Diagnostics

- **Guard layer** (`enableGlyphAtlasGuards.ts`, 107 lines) — `enableGlyphAtlasGuards()`/`disableGlyphAtlasGuards()` install a guard via the entry-guard seam. Warns via `logOnce` through `@flighthq/log` for: rasterizer-returned-null, glyph-larger-than-atlas, repack-dropped, and repack-thrashing (past a settling threshold of 4). The thrashing message names the consumer-visible consequence (`refreshBitmapTextGlyphLayout`). Tree-shakable: not importing the module costs nothing.
- **Explain query** (`explainGlyphAtlasEntry.ts`, 51 lines) — `explainGlyphAtlasEntry(atlas, codepoint)` returns `GlyphAtlasEntryExplanation` (plain data, in `@flighthq/types`) distinguishing the two null paths with measured glyph and usable sizes. Does not re-measure a cached glyph.

### Testing

Eight test files totaling ~1,580 lines (of ~2,320 total source). Tests cover:
- Cache hit/miss/eviction with LRU ordering, including interleaved touches and re-rasterization ordering.
- Non-overlap invariant after packing and after eviction+repack.
- Blit correctness (pixel values verified against mock backend output).
- Three-axis budget enforcement (bytes, area, count) with running-total consistency check.
- Dirty-region lifecycle (null on fresh, covers new rect, clears, re-dirties).
- Per-atlas rasterizer override and process-wide backend precedence (sentinel/host/custom/per-call walkthrough).
- Host backend conflict, idempotence, observation transitions, call-order independence.
- Guard warnings for all four reasons with threshold and suppression behavior.
- Explain query for both null paths plus the cached-glyph shortcut.
- GlyphSource adapter forwarding including layout version through the seam.
- Layout version behavior: not bumped on append or bare eviction, bumped on repack even when survivors land on same coordinates.
- `createStubGlyphRasterizerBackend` Entity identity, determinism, sizing.

## Gaps

- **SDF/MSDF generation mode** — North-star item and Open direction 2. No implementation; the rasterizer seam would need to carry a mode flag and the atlas a second bitmap format. This is the feature that enables crisp scaling and is the major remaining gap against the charter's complete vision.
- **Multi-page atlas** — the seam is page-ready (`GlyphEntry.page`, `getGlyphAtlasImage(page)`), and the charter Decision anticipates it, but the cache is a single growing bitmap (`page: 0` is hardcoded in `getGlyphAtlasEntry`). A second page would require a `Map<number, Bitmap>` replacement for the single `bitmap` field and a page-selection strategy.
- **Pair kerning** — `getGlyphAtlasKerning` is a constant 0. The canvas rasterizer has no kerning table; real kerning requires either a font-parsing path or the shaping backend. Documented in status as the model rather than a defect, but it caps layout fidelity for any consumer not using the `textshaper` path.
- **`lineGap`** — always 0 even with measured metrics (`glyphRasterizerBackend.ts:63` in `host-web`), because canvas exposes no line-gap field. Documented in status.

## Charter contradictions

None. Every dated Decision from 2026-07-10 and 2026-08-01 is realized:

- The `GlyphSource` seam with page awareness is defined and implemented.
- The mutable `GlyphAtlas` entity with rasterize-on-miss behind a swappable backend is the core of the package.
- LRU eviction + dirty-region + multi-page readiness (though not multi-page population) are present.
- `bakeBitmapFont` shipped as `createBitmapFontFromGlyphAtlas` in `@flighthq/bitmapfont` (the correct ownership per the charter's "honest composition direction" — the product owns the constructor).
- Per-atlas rasterizer binding (2026-08-01 Decision) is implemented via `GlyphAtlasOptions.rasterizerBackend`.

The previous review's charter contradictions (byte/area budget, `bakeBitmapFont`) have all been resolved.

## Contract and docs fit

**How well the package lives up to the contract:**

- **Export lanes** — `.` (cultivated public, 19 exports) and `./contract` (star re-export of all modules). Clean two-lane shape.
- **Types in `@flighthq/types`** — all exported types (`GlyphAtlas`, `GlyphAtlasOptions`, `GlyphAtlasRuntime`, `GlyphEntry`, `GlyphMetrics`, `GlyphSource`, `GlyphRasterizerBackend`, `GlyphRasterizedBitmap`, `GlyphRasterizeOptions`, `GlyphAtlasEntryExplanation`, `GlyphAtlasShelf`, `BackendExplanation`, `BackendOperationExplanation`, `GlyphRasterizerOperation`) live in `@flighthq/types`. The implementation package exports functions only.
- **`sideEffects: false`** — declared and honored. No module-level registration, no global mutation on import. The rasterizer backend module variables are set only via explicit `set*`/`install*` calls.
- **Naming** — full unabbreviated type names in function names (`getGlyphAtlasEntry`, `createGlyphSourceFromGlyphAtlas`, `enableGlyphAtlasGuards`). `get*` prefix on accessors. `dispose*` correctly chosen over `destroy*` (CPU data, no GPU handle). Sentinels not throws.
- **Dependencies** — `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/bitmap`, `@flighthq/log`, `@flighthq/types`. The `log` dependency is in the guard module only, tree-shakable.
- **Diagnostics** — implements the inversion rule: the core module exposes the `setGlyphAtlasEntryGuard` seam; messages live in `enableGlyphAtlasGuards` via `@flighthq/log`; `explainGlyphAtlasEntry` returns plain data. Both are separately importable.
- **`Readonly<T>`** — used on function parameters throughout (`Readonly<GlyphAtlas>`, `Readonly<GlyphEntry>`, `Readonly<GlyphRasterizedBitmap>`, `Readonly<GlyphRasterizeOptions>`).
- **Module variable placement** — `_entryGuard` at bottom of `glyphAtlasEntry.ts`; backend variables at bottom of `glyphRasterizerBackend.ts`. Follows the convention.
- **Commit to `@flighthq/entity`** — `createStubGlyphRasterizerBackend` returns `Entity & GlyphRasterizerBackend` via `createEntity`.

**Candidate contract/docs revisions:**

- The Package Map in `AGENTS.md` lists `glyphatlas` in "Input and text." It is arguably better described as rendering infrastructure (it exists to serve GL/WGPU text rendering), but the current grouping alongside `bitmapfont` and `bitmaptext` is reasonable and does not mislead.
- The previous review noted the Package Map claimed `@flighthq/binpack`-backed repack. This claim appears to have been corrected or is no longer present in the current `AGENTS.md` text (which does not mention binpack in the glyphatlas context).

## Candidate open directions

- **SDF/MSDF rasterization mode.** The charter's North star names it; the implementation path requires a rasterizer mode flag, a distance-field bitmap format (single-channel), and a shader in `render-gl`/`render-wgpu`. The rasterizer seam (`GlyphRasterizeOptions`) would need a `mode` field, and the atlas a per-glyph format indicator. Should this be a separate atlas type, a mode on `GlyphAtlasOptions`, or a separate rasterizer backend that produces distance fields?
- **Multi-page population.** The seam is ready (`GlyphEntry.page`, `getGlyphAtlasImage`), but the implementation is single-page. The runtime already has `bitmaps: Map<number, GlyphRasterizedBitmap>` for retained source bitmaps; a page map would need a parallel structure. When should a new page be allocated -- atlas exhaustion, or an explicit caller decision?
- **Pair kerning path.** The charter boundary defers real metrics to `textshaper`, but the `GlyphSource.getGlyphKerning` seam is live and always returns 0. If an outline-backed rasterizer (e.g. a parsed font) carries a kern table, should it feed through the rasterizer backend or a separate seam?
