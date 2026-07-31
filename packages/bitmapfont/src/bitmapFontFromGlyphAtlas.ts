import { createTexture } from '@flighthq/texture/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { BitmapFont, BitmapFontGlyphData, GlyphAtlas } from '@flighthq/types/contract';

import { createBitmapFont } from './bitmapFont';

/** Freezes a live `GlyphAtlas` into a static `BitmapFont` — the dynamic cache's contents as a fixed
 *  font, so a build step can bake what a run actually rasterized and ship it instead of rasterizing
 *  again at startup.
 *
 *  This lives in `@flighthq/bitmapfont` rather than in `@flighthq/glyphatlas` because a conversion
 *  constructor belongs to the package that owns the PRODUCT, the same way `createImageResourceFromBitmap`
 *  lives in `@flighthq/image`. Every type is in `@flighthq/types`, so reading a `GlyphAtlas` here costs
 *  no dependency on the atlas package, and `glyphatlas` gains no edge to `textureatlas` or `texture`.
 *
 *  The page is CPU-only: the atlas's own bitmap is already a valid `TextureSource` under the flat
 *  texture model, so the font's page is a `TextureAtlas` over a bitmap-sourced `Texture` with no GPU
 *  work and no readback. Whichever backend consumes the font uploads it later through the ordinary
 *  kind-keyed resolver path, exactly as it would for any other bitmap-sourced texture.
 *
 *  The result is a snapshot: later rasterization into the source atlas does not reach the font, and the
 *  font holds its own reference to the atlas bitmap. */
export function createBitmapFontFromGlyphAtlas(atlas: Readonly<GlyphAtlas>): BitmapFont {
  const runtime = atlas.runtime;
  const glyphs: BitmapFontGlyphData[] = [];
  for (const [codepoint, entry] of runtime.entries) {
    glyphs.push({
      advance: entry.advance,
      bearingX: entry.bearingX,
      bearingY: entry.bearingY,
      codepoint,
      height: entry.height,
      // The dynamic atlas is a single growing bitmap, so every glyph is on page 0.
      page: 0,
      width: entry.width,
      x: entry.x,
      y: entry.y,
    });
  }
  // Regions stay empty: a bitmap font addresses its glyphs through its own glyph table, so the page
  // exists to carry the pixels, not to name sub-rectangles.
  const page = createTextureAtlas({ texture: createTexture({ source: runtime.bitmap }) });
  return createBitmapFont({
    glyphs,
    metrics: { ...runtime.metrics },
    pages: [page],
  });
}
