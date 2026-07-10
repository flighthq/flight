import { createBitmapFont } from '@flighthq/bitmapfont';
import type {
  BitmapFont,
  BitmapFontData,
  BitmapFontEncoding,
  BitmapFontGlyphData,
  BitmapFontKerningData,
  BitmapFontParseOptions,
} from '@flighthq/types';

// One parsed AngelCode/BMFont `char` record — the raw format fields, before the shared mapping onto a
// `GlyphEntry`. `x`/`y`/`width`/`height` are the glyph's rectangle in the atlas page; `xoffset`/
// `yoffset` are the pen-to-box bearing; `xadvance` is the pen advance.
export interface BitmapFontCharRecord {
  height: number;
  id: number;
  width: number;
  x: number;
  xadvance: number;
  xoffset: number;
  y: number;
  yoffset: number;
}

// One parsed AngelCode/BMFont `kerning` record — the raw `first`/`second` codepoints and the
// horizontal `amount` (pixels) between them.
export interface BitmapFontKerningRecord {
  amount: number;
  first: number;
  second: number;
}

// One parsed AngelCode/BMFont `page` record — a page's numeric `id` and its atlas image `file` name.
// The file is a reference the caller's `resolvePage` rehydrates to a live `TextureAtlas`.
export interface BitmapFontPageRecord {
  file: string;
  id: number;
}

// The neutral intermediate the three BMFont front-ends (text `.fnt`, XML, JSON) parse into before the
// shared `buildBitmapFontFromRecord` maps it onto `createBitmapFont`. It flattens the format's blocks:
// `base`/`lineHeight` are the `common` line-metric fields, and `pages`/`chars`/`kernings` mirror the
// page/char/kerning blocks. `encoding` defaults to `raster` (classic BMFont); a JSON distance-field
// export carries `sdf`/`msdf`.
export interface BitmapFontRecord {
  base: number;
  chars: BitmapFontCharRecord[];
  encoding: BitmapFontEncoding;
  kernings: BitmapFontKerningRecord[];
  lineHeight: number;
  pages: BitmapFontPageRecord[];
}

// Maps a parsed `BitmapFontRecord` onto a `BitmapFont` via `createBitmapFont`, resolving the atlas page
// through `options.resolvePage`. The atlas is required: a `BitmapFont` carries a non-null atlas, so
// when `resolvePage` is omitted, the record has no page, or the resolver returns `null` for the first
// page, this returns the `null` sentinel and the parse fails as a whole. Each `char` becomes a glyph
// (`xoffset`/`yoffset` → `bearingX`/`bearingY`, `xadvance` → `advance`); each `kerning` becomes a pair;
// the line metrics derive from the BMFont `common` fields (`ascent` = `base`, `descent` =
// `lineHeight - base`, `lineGap` = 0), which `formatBitmapFontFnt` inverts losslessly.
export function buildBitmapFontFromRecord(
  record: Readonly<BitmapFontRecord>,
  options?: Readonly<BitmapFontParseOptions>,
): BitmapFont | null {
  const page = record.pages[0];
  const resolvePage = options?.resolvePage;
  const atlas = page !== undefined && resolvePage !== undefined ? resolvePage(page.id, page.file) : null;
  if (atlas === null) return null;

  const glyphs: BitmapFontGlyphData[] = record.chars.map((char) => ({
    advance: char.xadvance,
    bearingX: char.xoffset,
    bearingY: char.yoffset,
    codepoint: char.id,
    height: char.height,
    width: char.width,
    x: char.x,
    y: char.y,
  }));
  const kerning: BitmapFontKerningData[] = record.kernings.map((pair) => ({
    amount: pair.amount,
    left: pair.first,
    right: pair.second,
  }));

  const data: BitmapFontData = {
    atlas,
    encoding: record.encoding,
    glyphs,
    kerning,
    metrics: { ascent: record.base, descent: record.lineHeight - record.base, lineGap: 0 },
  };
  return createBitmapFont(data);
}
