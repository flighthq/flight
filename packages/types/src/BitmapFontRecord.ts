import type { BitmapFontEncoding } from './BitmapFont';

// One parsed AngelCode/BMFont `char` record — the raw format fields, before the shared mapping onto a
// `GlyphEntry`. `x`/`y`/`width`/`height` are the glyph's rectangle in the atlas page; `xoffset`/
// `yoffset` are the pen-to-box bearing; `xadvance` is the pen advance; `page` is the atlas page image
// the rectangle is cut from (default 0), indexing the record's `pages`.
export interface BitmapFontCharRecord {
  height: number;
  id: number;
  page: number;
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
