import { createBitmapFont } from '@flighthq/bitmapfont';
import type {
  BitmapFont,
  BitmapFontData,
  BitmapFontEncoding,
  BitmapFontGlyphData,
  BitmapFontKerningData,
  BitmapFontParseOptions,
  TextureAtlas,
} from '@flighthq/types';

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

// Maps a parsed `BitmapFontRecord` onto a `BitmapFont` via `createBitmapFont`, resolving every atlas
// page the record declares through `options.resolvePage` (called once per page id). The resolved
// atlases become the font's page-indexed `pages` (page id = index), and each `char`'s `page` carries
// through to its glyph. Resolution rule: a page a glyph actually samples must resolve — if any
// referenced page's atlas is `null` (including when `resolvePage` is omitted, so nothing resolves),
// this returns the `null` sentinel and the parse fails as a whole; a declared-but-unreferenced page
// that fails to resolve is tolerated and simply left absent. Each `char` becomes a glyph
// (`xoffset`/`yoffset` → `bearingX`/`bearingY`, `xadvance` → `advance`, `page` → `page`); each
// `kerning` becomes a pair; the line metrics derive from the BMFont `common` fields (`ascent` =
// `base`, `descent` = `lineHeight - base`, `lineGap` = 0), which `formatBitmapFontFnt` inverts
// losslessly.
export function buildBitmapFontFromRecord(
  record: Readonly<BitmapFontRecord>,
  options?: Readonly<BitmapFontParseOptions>,
): BitmapFont | null {
  const resolvePage = options?.resolvePage;
  const resolved = new Map<number, TextureAtlas>();
  let maxPageId = -1;
  if (resolvePage !== undefined) {
    for (const page of record.pages) {
      const atlas = resolvePage(page.id, page.file);
      if (atlas !== null) {
        resolved.set(page.id, atlas);
        if (page.id > maxPageId) maxPageId = page.id;
      }
    }
  }

  // Every page a glyph samples must have resolved; an unresolved referenced page collapses the parse.
  for (const char of record.chars) {
    if (!resolved.has(char.page)) return null;
    if (char.page > maxPageId) maxPageId = char.page;
  }

  const pages: TextureAtlas[] = [];
  for (let id = 0; id <= maxPageId; id++) {
    const atlas = resolved.get(id);
    // A hole only occurs for a declared-but-unreferenced page that failed to resolve; no glyph
    // indexes it, so it is left absent (`getBitmapFontPage` reports null for that index).
    if (atlas !== undefined) pages[id] = atlas;
  }

  const glyphs: BitmapFontGlyphData[] = record.chars.map((char) => ({
    advance: char.xadvance,
    bearingX: char.xoffset,
    // BMFont `yoffset` is the distance down from the line top to the glyph's top; `GlyphEntry.bearingY`
    // is the distance up from the baseline to that same top (the convention the renderer and
    // @flighthq/glyphatlas share, `quadY = baselineY - bearingY`). Convert across the two references
    // via `base` (line-top-to-baseline). `formatBitmapFontFnt` inverts this with `yoffset = base - bearingY`.
    bearingY: record.base - char.yoffset,
    codepoint: char.id,
    height: char.height,
    page: char.page,
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
    encoding: record.encoding,
    glyphs,
    kerning,
    metrics: { ascent: record.base, descent: record.lineHeight - record.base, lineGap: 0 },
    pages,
  };
  return createBitmapFont(data);
}
