---
package: '@flighthq/bitmapfont'
crate: flighthq-bitmapfont
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# bitmapfont — Charter

## What it is

`@flighthq/bitmapfont` is the **static bitmap-font cell** — a font whose glyphs are pre-rendered into a texture atlas, described by a metrics table (`char → atlas rect + bearing + advance`, plus kerning and line metrics). It is the **static** implementation of the `GlyphSource` seam that `@flighthq/glyphatlas` defines; both hand a text renderer an atlas + `glyph → region + metrics`, so the GL/WGPU glyph-quad path consumes either agnostically. This is the games-standard fast-text path (textured quads, zero runtime rasterization) and the home for SDF/MSDF fonts.

## North star

The complete static bitmap-font model: load a `BitmapFont` (atlas ref + glyph table + kerning + line metrics), query glyphs through the shared `GlyphSource` seam, support raster and **SDF/MSDF** glyph encodings (a field on the font; the shader lives in `render-gl`/`render-wgpu`), and serve as the target of `glyphatlas`'s `bakeBitmapFont`. Format parsing (AngelCode/BMFont) is the `@flighthq/bitmapfont-formats` neighbor; the `BitmapText` display node (in `@flighthq/text`) draws it via the sprite quad-batch.

## Boundaries

- **Depends on `@flighthq/textureatlas` (the glyph atlas) + `@flighthq/types`.** No display object, no renderer, no rasterization (the glyphs are already baked — that's the difference from `glyphatlas`).
- **Implements `GlyphSource` (defined in `@flighthq/types` by `glyphatlas`).** `getGlyphEntry` is a pure lookup (no side effects — the static counterpart to glyphatlas's rasterize-on-miss).
- **Model + queries, not parsing or rendering.** The `.fnt` codec is `@flighthq/bitmapfont-formats`; laying out a string is `@flighthq/textlayout`; drawing quads is the `render-*`/`BitmapText` path.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Static `GlyphSource`; immutable `BitmapFont` value.** `BitmapFont` = atlas reference + `Map<codepoint, GlyphEntry>` + kerning table + `GlyphMetrics` (ascent/descent/lineGap), with an `encoding` field (`'raster' | 'sdf' | 'msdf'`). `createBitmapFont(...)` builds it; `getBitmapFontGlyph`/kerning/metrics are pure lookups satisfying the `GlyphSource` seam. Immutable, unlike the growing `glyphatlas` — which is why they are separate implementations of one seam, not one type.
- **[2026-07-10] `bakeBitmapFont(glyphAtlas)` target.** This cell is the output type of `@flighthq/glyphatlas`'s one-way bake: a live dynamic atlas frozen into a shippable static font. (Same freeze-mutable-into-immutable shape as `@flighthq/snapshot`.)
- **[2026-07-10] Neighbors.** `@flighthq/bitmapfont-formats` (AngelCode/BMFont `.fnt`/`.xml`/`.json` codec → `BitmapFont`) is a `-formats` subpackage; `BitmapText` (quad-batch display node) lives in `@flighthq/text` beside `TextLabel`/`RichText`, not here (bitmapfont stays display-free).

## Open directions

1. **SDF/MSDF generation + shader.** Field-atlas generation (or bake from `glyphatlas`'s SDF mode) and the crisp-scaling shader in `render-gl`/`render-wgpu`.
2. **Multi-page fonts (the seam is now page-aware — [2026-07-10]).** A bitmap font spanning several atlas pages (large CJK sets). The `GlyphSource` seam already carries this: `GlyphEntry.page` names each glyph's page and `getGlyphAtlasImage(page)` returns that page's image, and `@flighthq/bitmaptext` already draws one QuadBatch per page. `bitmapfont` is single-page for now (`createBitmapFont` stamps `page: 0`, `getGlyphAtlasImage(0)` returns `font.atlas.image`). The remaining producer work: hold N page images (an atlas per page or a page→image map) and let `@flighthq/bitmapfont-formats` populate each glyph's page from a multi-page `.fnt`.
3. **Fallback chains.** Compose multiple `GlyphSource`s (a bitmap font + a `glyphatlas` fallback for missing glyphs) behind one seam.
