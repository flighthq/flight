---
package: '@flighthq/glyphatlas'
updated: 2026-07-13
basedOn: ./review.md
---

# glyphatlas — Assessment

## Recommended

Sweep-safe, within-package:

1. **`bakeBitmapFont(atlas): BitmapFont`** — realize the blessed [2026-07-10] decision: freeze the live cache (entries + surface + metrics) into a `BitmapFontData` and call `@flighthq/bitmapfont`'s `createBitmapFont`. Note: adds a `@flighthq/bitmapfont` dependency (or emits plain `BitmapFontData` from `@flighthq/types` to stay dep-free) — prefer the types-only shape so the dep graph stays one-directional; the decision text already blesses the feature itself.
2. **Byte/area LRU budget** — honor the decision's "byte/area budget": track retained-bitmap bytes + occupied atlas area and evict on that, keeping `maxGlyphs` as an optional secondary cap. Within `glyphAtlasEntry.ts`/`GlyphAtlasRuntime`.
3. **Real line metrics from the canvas backend** — surface `fontBoundingBoxAscent/Descent` (falling back to the current heuristic when absent) through `GlyphRasterizedBitmap`/backend metrics so `getGlyphAtlasMetrics` reports measured values. No new dependency; replaces a documented placeholder.
4. **O(1) LRU** — replace the `indexOf`/`splice` array with a `Map`-ordered (delete+set) recency structure; behavior-identical, removes the per-hit O(n).
5. **Guards + `explain*`** — `enableGlyphAtlasGuards` (glyph-too-big, rasterizer-null, repack-drop, budget thrash) and `explainGlyphAtlasEntry(atlas, codepoint)` returning plain data on why an entry is null. Straight diagnostics-convention application to existing silent sentinels.
6. **Style/weight into the atlas config** — thread `fontStyle`/`fontWeight` from `GlyphAtlasOptions` into `rasterizeOptions` (the fields already exist on `GlyphRasterizeOptions`), and document one-atlas-per-style as the model.

## Backlog

- **SDF/MSDF generation mode** — parked: charter Open direction 2; field generation here, shader cross-package in `render-gl`/`render-wgpu`.
- **Multi-page cache surfaces** — parked: the seam is page-ready (decision [2026-07-10]) but growing N pages changes eviction/repack policy; sized beyond a sweep and explicitly called "that deepening" by the charter.
- **Kerning via a shaping source** — parked: real pair kerning needs the `textshaper` seam (cross-package; charter boundary names it a hardening item).
- **`binpack`-backed batch repack** — parked: charter reserves it for the batch-bake/repack path; also the subject of the stale Package Map line (admin-doc revision for the user: map says binpack-backed today, code is self-contained shelf).
- **Renderer glyph-quad integration** — parked: charter Open direction 3, cross-package.

## Approved

_Empty — awaiting the user's verbal approval gate._
