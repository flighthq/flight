---
package: '@flighthq/glyphatlas'
crate: flighthq-glyphatlas
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# glyphatlas — Charter

## What it is

`@flighthq/glyphatlas` is the **dynamic glyph-atlas cell** — it rasterizes a font's glyphs into a growing texture atlas on demand, caches `glyph → atlas region + metrics`, and hands the GPU text renderers an atlas plus a lookup. It is the missing primitive that lets **vector text render on WebGL/WebGPU**, which have no native text: glyphs must be rasterized into an atlas and drawn as quads. It is the *runtime* sibling of `@flighthq/bitmapfont` (pre-baked): both satisfy one shared `GlyphSource` seam, so the renderer consumes either agnostically.

Backends split cleanly: **DOM** never needs it (native text), **Canvas** may use it or `fillText`, **GL/WGPU** require it.

## North star

The complete dynamic glyph cache: on-demand rasterization behind a swappable rasterizer backend (web = offscreen-canvas `fillText`), a `binpack`-packed atlas that grows (and spills to additional pages) as glyphs appear, `glyph → region + metrics` lookup, **LRU eviction** under a memory budget, **dirty-region** tracking for incremental GPU upload, an optional **SDF/MSDF** generation mode for crisp scaling, and a one-way **`bakeBitmapFont`** export that freezes the live atlas into a static `@flighthq/bitmapfont`. It defines and owns the `GlyphSource` seam the whole text-render path plugs into.

## Boundaries

- **Depends on `@flighthq/surface` (the atlas bitmap + glyph blit) + `@flighthq/geometry` (the dirty `Rectangle`) + `@flighthq/types`.** The rasterizer is a swappable backend (web = canvas); no direct DOM at import. (First build uses a self-contained **incremental shelf packer** for the hot per-glyph path — `@flighthq/binpack` is reserved for the deferred batch-bake/repack path, not a first-build dep — and derives line metrics from the requested font size as a placeholder; real metrics via `@flighthq/textshaper`'s `getFontMetrics` and kerning are a hardening item.)
- **A glyph cache, not a text renderer or display object.** It produces an atlas + region/metrics lookup; laying out a string (`textlayout`) and drawing the quads (the `render-*` glyph-quad path / `BitmapText`) are the consumers. It holds no display node.
- **Rasterization mechanism is backend-swappable.** The web backend rasterizes via an offscreen canvas; a native host supplies a FreeType-style rasterizer. The orchestration (cache / pack / evict / dirty-region / `GlyphSource`) is backend-independent and is the tested core.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Owns the shared `GlyphSource` seam (in `@flighthq/types`).** `GlyphSource` = the interface a text renderer consumes: an atlas handle + `getGlyphEntry(codepoint, ...) → GlyphEntry | null` (region + advance + bearing/offset) + line metrics + kerning. **`@flighthq/glyphatlas` (dynamic) and `@flighthq/bitmapfont` (static) are two implementations of it.** Defining it here (the load-bearing, first-built cell) keeps the seam where the renderer plugs in; bitmapfont implements the same shape. `GlyphSource`/`GlyphEntry`/`GlyphMetrics` live in the header layer.
- **[2026-07-10] Mutable `GlyphAtlas` entity; rasterize-on-miss behind a rasterizer backend.** `createGlyphAtlas(font, options)` builds a growing atlas; `getGlyphAtlasEntry(atlas, codepoint)` returns the cached entry or **rasterizes on miss** (via the active `GlyphRasterizerBackend`), packs the bitmap into the atlas with `binpack`, blits it into the `surface`, records the dirty rect, and caches the entry. `get/set/createWebGlyphRasterizerBackend` (web = canvas `measureText`/`fillText` → `ImageData`). This is *not* a static font — it grows and evicts; that's why it's separate from immutable `bitmapfont`.
- **[2026-07-10] LRU eviction + dirty-region + multi-page.** Under a byte/area budget, least-recently-used glyphs are evicted and their atlas space reclaimed (repacked); a `dirty` rectangle set drives incremental texture upload so the renderer re-uploads only changed regions. When an atlas page fills and can't grow to the cap, a new page is allocated (glyph entries carry their page index).
- **[2026-07-10] One-way `bakeBitmapFont(atlas) → BitmapFont`.** Freeze the current live atlas + metrics into a static `@flighthq/bitmapfont` (ship a pre-baked font built from real glyph usage). This is the honest composition direction — `glyphatlas` *produces* a `bitmapfont`, it does not *become* one. (Same shape as `@flighthq/snapshot`: freezing a mutable thing into an immutable value.)

## Open directions

1. **The static sibling cluster** — `@flighthq/bitmapfont` (static `GlyphSource` + `bakeBitmapFont` target), `@flighthq/bitmapfont-formats` (AngelCode/BMFont `.fnt`/`.xml`/`.json` codec), and a `BitmapText` display node in `@flighthq/text` (quad-batch-backed) — all consuming the `GlyphSource` seam this cell defines.
2. **SDF/MSDF generation.** Rasterize glyphs as signed-distance fields for crisp arbitrary-scale text; the special shader lives in `render-gl`/`render-wgpu`, the field generation here.
3. **Renderer integration.** The `render-gl`/`render-wgpu` glyph-quad path that consumes a `GlyphSource` (shared by dynamic vector text and `BitmapText`), plus the `TextLabel`/`RichText` GL glyph-atlas hookup.
