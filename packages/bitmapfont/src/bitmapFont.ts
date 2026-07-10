import { createEntity } from '@flighthq/entity';
import { getTextureAtlasRegionById } from '@flighthq/textureatlas';
import type { BitmapFont, BitmapGlyph, TextureAtlasRegion } from '@flighthq/types';

// Appends a glyph's placement metrics to the font. The glyph's pixel rectangle is a separate concern
// — add it to the font's `atlas` as a region whose id matches `id` (getBitmapFontGlyphRegion pairs
// them by id). Last-write-wins is not enforced here; callers building a font supply each glyph once.
export function addBitmapFontGlyph(
  target: BitmapFont,
  id: number,
  xoffset: number,
  yoffset: number,
  xadvance: number,
  page = 0,
): void {
  target.glyphs.push({ id: id, page: page, xadvance: xadvance, xoffset: xoffset, yoffset: yoffset });
}

// Appends a kerning adjustment for the ordered pair (first, second).
export function addBitmapFontKerning(target: BitmapFont, first: number, second: number, amount: number): void {
  target.kernings.push({ amount: amount, first: first, second: second });
}

export function createBitmapFont(obj?: Partial<BitmapFont>): BitmapFont {
  return createEntity({
    atlas: obj?.atlas ?? null,
    base: obj?.base ?? 0,
    face: obj?.face ?? null,
    glyphs: obj?.glyphs ?? [],
    kernings: obj?.kernings ?? [],
    lineHeight: obj?.lineHeight ?? 0,
    size: obj?.size ?? 0,
  });
}

// Returns the glyph for a code point, or null if the font has no glyph for it. Linear scan, matching
// textureatlas's region lookups; a runtime Map index is a deepening item (see the charter).
export function getBitmapFontGlyph(font: Readonly<BitmapFont>, codePoint: number): BitmapGlyph | null {
  for (const glyph of font.glyphs) {
    if (glyph.id === codePoint) return glyph;
  }
  return null;
}

// Returns the atlas region holding a glyph's pixel rectangle, or null if the font has no atlas or no
// region keyed by the glyph's code point. This is the composition seam: BitmapGlyph carries the
// metrics, the atlas region carries the pixels, paired by code-point id.
export function getBitmapFontGlyphRegion(
  font: Readonly<BitmapFont>,
  glyph: Readonly<BitmapGlyph>,
): TextureAtlasRegion | null {
  if (font.atlas === null) return null;
  return getTextureAtlasRegionById(font.atlas, glyph.id);
}

// Returns the kerning adjustment (in pixels) for the ordered pair (first, second), or 0 if the pair
// has no kerning entry. Linear scan; see getBitmapFontGlyph.
export function getBitmapFontKerning(font: Readonly<BitmapFont>, first: number, second: number): number {
  for (const kerning of font.kernings) {
    if (kerning.first === first && kerning.second === second) return kerning.amount;
  }
  return 0;
}

// Measures the horizontal advance width of `text`, in the font's authored pixel size, by summing
// glyph advances and applying kerning between adjacent pairs. Missing glyphs contribute no advance.
// This is the native-size primitive a TextShaperBackend adapter would scale by `format.size / size`
// (see the charter's Open directions — the scaling seam is an unresolved fork, so it is not wired
// here). Iterates by code point, so surrogate pairs count once.
export function measureBitmapFontText(font: Readonly<BitmapFont>, text: string): number {
  let width = 0;
  let previous = -1;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (previous !== -1) width += getBitmapFontKerning(font, previous, codePoint);
    const glyph = getBitmapFontGlyph(font, codePoint);
    if (glyph !== null) width += glyph.xadvance;
    previous = codePoint;
  }
  return width;
}
