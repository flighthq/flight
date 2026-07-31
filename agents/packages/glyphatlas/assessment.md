---
package: '@flighthq/glyphatlas'
updated: 2026-07-13
basedOn: ./review.md
---

# glyphatlas — Assessment

## Recommended

Sweep-safe, within-package:

1. ~~**`bakeBitmapFont(atlas)`**~~ — **relocated and landed 2026-07-31.** Chief ruled option (d): a conversion constructor belongs to the package that owns the PRODUCT, so `createBitmapFontFromGlyphAtlas` lives in `@flighthq/bitmapfont`, not here. Every type is in `@flighthq/types`, so the product side reads a `GlyphAtlas` with no dependency on this package — **glyphatlas gained zero new edges**, which was the whole objection to building it here. The pages obstacle dissolved under the flat texture model: the atlas bitmap is already a valid `TextureSource`, so a page is a `TextureAtlas` over a bitmap-sourced `Texture`, CPU-only, uploaded later by the ordinary kind-keyed resolver.

## Backlog

- **SDF/MSDF generation mode** — parked: charter Open direction 2; field generation here, shader cross-package in `render-gl`/`render-wgpu`.
- **Multi-page cache surfaces** — parked: the seam is page-ready (decision [2026-07-10]) but growing N pages changes eviction/repack policy; sized beyond a sweep and explicitly called "that deepening" by the charter.
- **Kerning via a shaping source** — parked: real pair kerning needs the `textshaper` seam (cross-package; charter boundary names it a hardening item).
- **`binpack`-backed batch repack** — parked: charter reserves it for the batch-bake/repack path; also the subject of the stale Package Map line (admin-doc revision for the user: map says binpack-backed today, code is self-contained shelf).
- **Renderer glyph-quad integration** — parked: charter Open direction 3, cross-package.

## Approved

_Empty — awaiting the user's verbal approval gate._
