import { getBitmapFontMetrics } from '@flighthq/bitmapfont';
import type { BitmapFont, BitmapFontParseOptions, GlyphEntry } from '@flighthq/types';

import { buildBitmapFontFromRecord } from './bitmapFontRecord';
import type {
  BitmapFontCharRecord,
  BitmapFontKerningRecord,
  BitmapFontPageRecord,
  BitmapFontRecord,
} from './bitmapFontRecord';

// Re-emits a `BitmapFont` as the classic AngelCode/BMFont text `.fnt` (`info`/`common`/`page`/`char`/
// `kerning` lines of `key=value` pairs). Lossless for the fields the model carries — the glyph table,
// kerning pairs, encoding, and line metrics all round-trip (`parseBitmapFontFnt` of this output rebuilds
// an equivalent font). The page reference cannot round-trip to a filename: a `BitmapFont` holds a live
// `TextureAtlas`, not the source page path, so the `page` line is emitted with an empty `file=""` and
// the reader supplies the atlas again through its `resolvePage`. `info`/`common` beyond the line
// metrics (face, style, spacing, packing) are not part of the model and are emitted as neutral defaults.
export function formatBitmapFontFnt(font: Readonly<BitmapFont>): string {
  const metrics = getBitmapFontMetrics(font);
  const lineHeight = metrics.ascent + metrics.descent + metrics.lineGap;
  const base = metrics.ascent;
  const image = font.atlas.image;
  const scaleW = image !== null ? image.width : 0;
  const scaleH = image !== null ? image.height : 0;

  const lines: string[] = [];
  lines.push(
    `info face="" size=${lineHeight} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0 outline=0`,
  );
  lines.push(
    `common lineHeight=${lineHeight} base=${base} scaleW=${scaleW} scaleH=${scaleH} pages=1 packed=0 alphaChnl=1 redChnl=0 greenChnl=0 blueChnl=0`,
  );
  lines.push('page id=0 file=""');

  const codepoints = [...font.glyphs.keys()];
  lines.push(`chars count=${codepoints.length}`);
  for (const codepoint of codepoints) {
    const glyph = font.glyphs.get(codepoint) as GlyphEntry;
    lines.push(
      `char id=${codepoint} x=${glyph.x} y=${glyph.y} width=${glyph.width} height=${glyph.height} ` +
        `xoffset=${glyph.bearingX} yoffset=${glyph.bearingY} xadvance=${glyph.advance} page=0 chnl=15`,
    );
  }

  const kernKeys = [...font.kerning.keys()];
  lines.push(`kernings count=${kernKeys.length}`);
  for (const key of kernKeys) {
    const amount = font.kerning.get(key) as number;
    const first = key >>> 16;
    const second = key & 0xffff;
    lines.push(`kerning first=${first} second=${second} amount=${amount}`);
  }

  return lines.join('\n') + '\n';
}

// Parses the classic AngelCode/BMFont text `.fnt` into a `BitmapFont`. The format is one record per
// line: a leading tag (`info`/`common`/`page`/`char`/`kerning`) followed by `key=value` pairs whose
// values are bare tokens, quoted strings, or comma lists. The atlas page named on the `page` line is
// rehydrated through `options.resolvePage`. Returns the `null` sentinel — never throwing — when the
// text carries no `common` line metrics, no `char` records, or its atlas page cannot be resolved.
export function parseBitmapFontFnt(text: string, options?: Readonly<BitmapFontParseOptions>): BitmapFont | null {
  const record = parseBitmapFontFntRecord(text);
  if (record === null) return null;
  return buildBitmapFontFromRecord(record, options);
}

// Parses the text `.fnt` into the neutral record, or `null` when required blocks are absent or
// malformed. Kept separate from `buildBitmapFontFromRecord` so the atlas-resolution step is shared
// across the text/XML/JSON front-ends.
function parseBitmapFontFntRecord(text: string): BitmapFontRecord | null {
  let lineHeight: number | null = null;
  let base: number | null = null;
  const pages: BitmapFontPageRecord[] = [];
  const chars: BitmapFontCharRecord[] = [];
  const kernings: BitmapFontKerningRecord[] = [];

  for (const rawLine of text.split(/\r\n?|\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const spaceAt = line.search(/\s/);
    const tag = spaceAt < 0 ? line : line.slice(0, spaceAt);
    const fields = parseFntFields(line.slice(tag.length));

    if (tag === 'common') {
      lineHeight = readFntNumber(fields.lineHeight);
      base = readFntNumber(fields.base);
    } else if (tag === 'page') {
      const id = readFntNumber(fields.id);
      if (id !== null) pages.push({ file: fields.file ?? '', id });
    } else if (tag === 'char') {
      const char = readFntChar(fields);
      if (char !== null) chars.push(char);
    } else if (tag === 'kerning') {
      const kerning = readFntKerning(fields);
      if (kerning !== null) kernings.push(kerning);
    }
  }

  if (lineHeight === null || base === null || chars.length === 0) return null;
  return { base, chars, encoding: 'raster', kernings, lineHeight, pages };
}

// Tokenizes a record's `key=value` pairs. Values may be double-quoted (holding spaces), or a bare
// non-space run (numbers, comma lists). Quotes are stripped; the raw string value is stored.
function parseFntFields(rest: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const re = /([A-Za-z_]\w*)\s*=\s*(?:"([^"]*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest)) !== null) {
    fields[match[1]] = match[2] !== undefined ? match[2] : (match[3] ?? '');
  }
  return fields;
}

function readFntChar(fields: Readonly<Record<string, string>>): BitmapFontCharRecord | null {
  const id = readFntNumber(fields.id);
  const x = readFntNumber(fields.x);
  const y = readFntNumber(fields.y);
  const width = readFntNumber(fields.width);
  const height = readFntNumber(fields.height);
  const xoffset = readFntNumber(fields.xoffset);
  const yoffset = readFntNumber(fields.yoffset);
  const xadvance = readFntNumber(fields.xadvance);
  if (
    id === null ||
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    xoffset === null ||
    yoffset === null ||
    xadvance === null
  ) {
    return null;
  }
  return { height, id, width, x, xadvance, xoffset, y, yoffset };
}

function readFntKerning(fields: Readonly<Record<string, string>>): BitmapFontKerningRecord | null {
  const first = readFntNumber(fields.first);
  const second = readFntNumber(fields.second);
  const amount = readFntNumber(fields.amount);
  if (first === null || second === null || amount === null) return null;
  return { amount, first, second };
}

// Parses a `.fnt` field value as a finite number, returning `null` (the malformed sentinel) for an
// absent field or a non-numeric value.
function readFntNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
