---
package: '@flighthq/glyphatlas'
updated: 2026-07-13
basedOn: ./review.md
---

# glyphatlas — Assessment

## Recommended

Sweep-safe, within-package:

1. **`bakeBitmapFont(atlas)` — BLOCKED on a design call, see below.** The item's own note assumes a dep-free path exists ("emits plain `BitmapFontData` from `@flighthq/types` to stay dep-free") and it does not: `BitmapFontData.pages` is `readonly TextureAtlas[]`, `TextureAtlas extends Entity` and carries a `Texture2D | null`, so producing one needs `@flighthq/textureatlas` (for `createTextureAtlas`) or `@flighthq/entity`. There is no types-only construction. Worse, the shapes disagree in kind: a glyph atlas owns CPU pixels (a `Bitmap`), while a bitmap-font page is texture-oriented. So the fork is real — add a dependency, give `BitmapFontData` a bitmap-friendly page representation, or have the bake return a narrower type and let the caller supply the page. Routed rather than guessed, because each answer moves the dep graph. Original text: — realize the blessed [2026-07-10] decision: freeze the live cache (entries + surface + metrics) into a `BitmapFontData` and call `@flighthq/bitmapfont`'s `createBitmapFont`. Note: adds a `@flighthq/bitmapfont` dependency (or emits plain `BitmapFontData` from `@flighthq/types` to stay dep-free) — prefer the types-only shape so the dep graph stays one-directional; the decision text already blesses the feature itself.
2. ~~**Byte/area LRU budget**~~ — landed 2026-07-31 (`4129ea34d`). `maxBytes` and `maxArea` on `GlyphAtlasOptions`, with running totals maintained at every mutation and `maxGlyphs` kept as a secondary count cap. Original text: — honor the decision's "byte/area budget": track retained-bitmap bytes + occupied atlas area and evict on that, keeping `maxGlyphs` as an optional secondary cap. Within `glyphAtlasEntry.ts`/`GlyphAtlasRuntime`.
3. **Real line metrics from the canvas backend** — surface `fontBoundingBoxAscent/Descent` (falling back to the current heuristic when absent) through `GlyphRasterizedBitmap`/backend metrics so `getGlyphAtlasMetrics` reports measured values. No new dependency; replaces a documented placeholder.
4. ~~**O(1) LRU**~~ — landed 2026-07-30 (`e0e4515ed`). `GlyphAtlasRuntime.lru` is an insertion-ordered `Map`; touch is delete-then-set, eviction takes the first key. Behaviour-identical, and the ordering semantics are now pinned by tests rather than implied — see [status](./status.md).
5. ~~**Guards + `explain*`**~~ — landed 2026-07-31. `enableGlyphAtlasGuards` warns once per blocked-lookup reason through `@flighthq/log`, installed via a `setGlyphAtlasEntryGuard` seam so the messages and the log dependency stay out of the hot path; `explainGlyphAtlasEntry` returns plain data distinguishing the two null causes plus the measured sizes. Original text: — `enableGlyphAtlasGuards` (glyph-too-big, rasterizer-null, repack-drop, budget thrash) and `explainGlyphAtlasEntry(atlas, codepoint)` returning plain data on why an entry is null. Straight diagnostics-convention application to existing silent sentinels.
6. ~~**Style/weight into the atlas config**~~ — landed 2026-07-30 (`c1c91a2e2`). `GlyphAtlasOptions` gained optional `fontStyle`/`fontWeight`, forwarded to `rasterizeOptions` only when supplied; one-atlas-per-(family, size, style, weight) is documented on the type. Note this was not a cosmetic threading job: the rasterizer already read both fields, but nothing could set them, so bold and italic atlases were unreachable.

## Backlog

- **SDF/MSDF generation mode** — parked: charter Open direction 2; field generation here, shader cross-package in `render-gl`/`render-wgpu`.
- **Multi-page cache surfaces** — parked: the seam is page-ready (decision [2026-07-10]) but growing N pages changes eviction/repack policy; sized beyond a sweep and explicitly called "that deepening" by the charter.
- **Kerning via a shaping source** — parked: real pair kerning needs the `textshaper` seam (cross-package; charter boundary names it a hardening item).
- **`binpack`-backed batch repack** — parked: charter reserves it for the batch-bake/repack path; also the subject of the stale Package Map line (admin-doc revision for the user: map says binpack-backed today, code is self-contained shelf).
- **Renderer glyph-quad integration** — parked: charter Open direction 3, cross-package.

## Approved

_Empty — awaiting the user's verbal approval gate._
