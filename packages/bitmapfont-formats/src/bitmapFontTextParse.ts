import { addBitmapFontGlyph, addBitmapFontKerning, createBitmapFont } from '@flighthq/bitmapfont';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import type { BitmapFont } from '@flighthq/types';

import type {
  BitmapFontTextChar,
  BitmapFontTextCommon,
  BitmapFontTextDocument,
  BitmapFontTextInfo,
  BitmapFontTextKerning,
  BitmapFontTextPage,
} from './bitmapFontTextSchema';

// Parses an AngelCode BMFont **text** (.fnt) file into a BitmapFont: an atlas of glyph pixel
// rectangles (one region per char, keyed by code point) composed with per-glyph metrics and kerning.
// The atlas image is NOT loaded here — a freshly parsed font has `atlas.image === null` and the page
// file names live in the returned document via parseBitmapFontTextDocument; load the page image and
// assign it to `font.atlas.image` separately. Single-page fonts are the common case; for multi-page
// fonts every glyph's rectangle is still registered, but only one atlas image slot exists (see the
// bitmapfont charter's multi-page open direction).
export function parseBitmapFontText(text: string): BitmapFont {
  const document = parseBitmapFontTextDocument(text);
  const atlas = createTextureAtlas();
  for (const char of document.chars) {
    atlas.regions.push(
      createTextureAtlasRegion({
        height: char.height,
        id: char.id,
        width: char.width,
        x: char.x,
        y: char.y,
      }),
    );
  }

  const font = createBitmapFont({
    atlas: atlas,
    base: document.common.base,
    face: document.info.face,
    lineHeight: document.common.lineHeight,
    size: document.info.size,
  });
  for (const char of document.chars) {
    addBitmapFontGlyph(font, char.id, char.xoffset, char.yoffset, char.xadvance, char.page);
  }
  for (const kerning of document.kernings) {
    addBitmapFontKerning(font, kerning.first, kerning.second, kerning.amount);
  }
  return font;
}

// Parses an AngelCode BMFont text (.fnt) file into its raw document form, without building a
// BitmapFont. Loss-tolerant: unknown tags and missing attributes fall back to zero/empty defaults.
export function parseBitmapFontTextDocument(text: string): BitmapFontTextDocument {
  const info: BitmapFontTextInfo = {
    bold: false,
    charset: '',
    face: '',
    italic: false,
    padding: '',
    size: 0,
    smooth: false,
    spacing: '',
    unicode: false,
  };
  const common: BitmapFontTextCommon = { base: 0, lineHeight: 0, pages: 0, scaleH: 0, scaleW: 0 };
  const pages: BitmapFontTextPage[] = [];
  const chars: BitmapFontTextChar[] = [];
  const kernings: BitmapFontTextKerning[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const tag = line.slice(0, Math.max(0, indexOfWhitespace(line)) || line.length);
    const attributes = parseAttributes(line);

    switch (tag) {
      case 'info':
        info.face = getString(attributes, 'face');
        info.size = Math.abs(getNumber(attributes, 'size'));
        info.bold = getBoolean(attributes, 'bold');
        info.italic = getBoolean(attributes, 'italic');
        info.charset = getString(attributes, 'charset');
        info.unicode = getBoolean(attributes, 'unicode');
        info.smooth = getBoolean(attributes, 'smooth');
        info.padding = getString(attributes, 'padding');
        info.spacing = getString(attributes, 'spacing');
        break;
      case 'common':
        common.lineHeight = getNumber(attributes, 'lineHeight');
        common.base = getNumber(attributes, 'base');
        common.scaleW = getNumber(attributes, 'scaleW');
        common.scaleH = getNumber(attributes, 'scaleH');
        common.pages = getNumber(attributes, 'pages');
        break;
      case 'page':
        pages.push({ file: getString(attributes, 'file'), id: getNumber(attributes, 'id') });
        break;
      case 'char':
        chars.push({
          chnl: getNumber(attributes, 'chnl'),
          height: getNumber(attributes, 'height'),
          id: getNumber(attributes, 'id'),
          page: getNumber(attributes, 'page'),
          width: getNumber(attributes, 'width'),
          x: getNumber(attributes, 'x'),
          xadvance: getNumber(attributes, 'xadvance'),
          xoffset: getNumber(attributes, 'xoffset'),
          y: getNumber(attributes, 'y'),
          yoffset: getNumber(attributes, 'yoffset'),
        });
        break;
      case 'kerning':
        kernings.push({
          amount: getNumber(attributes, 'amount'),
          first: getNumber(attributes, 'first'),
          second: getNumber(attributes, 'second'),
        });
        break;
      default:
        // 'chars'/'kernings' count headers and any unknown tag carry no data we retain.
        break;
    }
  }

  return { chars: chars, common: common, info: info, kernings: kernings, pages: pages };
}

function getBoolean(attributes: ReadonlyMap<string, string>, key: string): boolean {
  return getNumber(attributes, key) !== 0;
}

function getNumber(attributes: ReadonlyMap<string, string>, key: string): number {
  const value = attributes.get(key);
  if (value === undefined) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getString(attributes: ReadonlyMap<string, string>, key: string): string {
  return attributes.get(key) ?? '';
}

function indexOfWhitespace(line: string): number {
  return line.search(/\s/);
}

// Extracts `key=value` attributes from a BMFont line. Values may be double-quoted (with spaces) or a
// bare non-space token; quotes are stripped. Comma tuples (padding=0,0,0,0) survive as their string.
function parseAttributes(line: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /(\w+)=("[^"]*"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    const key = match[1];
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    attributes.set(key, value);
  }
  return attributes;
}
