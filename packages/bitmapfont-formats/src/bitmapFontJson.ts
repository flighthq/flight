import type { BitmapFont, BitmapFontEncoding, BitmapFontParseOptions } from '@flighthq/types';

import { buildBitmapFontFromRecord } from './bitmapFontRecord';
import type {
  BitmapFontCharRecord,
  BitmapFontKerningRecord,
  BitmapFontPageRecord,
  BitmapFontRecord,
} from './bitmapFontRecord';

// Parses the JSON AngelCode/BMFont export into a `BitmapFont`. The shape mirrors the text/XML blocks as
// an object: `{ common: { lineHeight, base }, pages: [file, …], chars: [{ id, x, … }], kernings: [{
// first, second, amount }] }`, where `pages` is a filename array whose index is the page id. A
// distance-field export's `distanceField.fieldType` (`sdf`/`msdf`) selects the font encoding; classic
// exports stay `raster`. Semantics otherwise match `parseBitmapFontFnt`, including `resolvePage` atlas
// rehydration. Returns the `null` sentinel — never throwing — for malformed JSON, a missing
// `common`/`chars`, or an atlas page that cannot be resolved.
export function parseBitmapFontJson(text: string, options?: Readonly<BitmapFontParseOptions>): BitmapFont | null {
  const record = parseBitmapFontJsonRecord(text);
  if (record === null) return null;
  return buildBitmapFontFromRecord(record, options);
}

// Parses the JSON export into the neutral record, or `null` when the JSON is malformed or the
// `common`/`chars` blocks are absent or malformed.
function parseBitmapFontJsonRecord(text: string): BitmapFontRecord | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(root)) return null;

  const common = root.common;
  if (!isObject(common)) return null;
  const lineHeight = readJsonNumber(common.lineHeight);
  const base = readJsonNumber(common.base);
  if (lineHeight === null || base === null) return null;

  const rawChars = root.chars;
  if (!Array.isArray(rawChars)) return null;
  const chars: BitmapFontCharRecord[] = [];
  for (const raw of rawChars) {
    const char = readJsonChar(raw);
    if (char !== null) chars.push(char);
  }
  if (chars.length === 0) return null;

  const pages: BitmapFontPageRecord[] = [];
  if (Array.isArray(root.pages)) {
    for (let id = 0; id < root.pages.length; id++) {
      const file = root.pages[id];
      pages.push({ file: typeof file === 'string' ? file : '', id });
    }
  }

  const kernings: BitmapFontKerningRecord[] = [];
  if (Array.isArray(root.kernings)) {
    for (const raw of root.kernings) {
      const kerning = readJsonKerning(raw);
      if (kerning !== null) kernings.push(kerning);
    }
  }

  return { base, chars, encoding: readJsonEncoding(root.distanceField), kernings, lineHeight, pages };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonChar(raw: unknown): BitmapFontCharRecord | null {
  if (!isObject(raw)) return null;
  const id = readJsonNumber(raw.id);
  const x = readJsonNumber(raw.x);
  const y = readJsonNumber(raw.y);
  const width = readJsonNumber(raw.width);
  const height = readJsonNumber(raw.height);
  const xoffset = readJsonNumber(raw.xoffset);
  const yoffset = readJsonNumber(raw.yoffset);
  const xadvance = readJsonNumber(raw.xadvance);
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
  return { height, id, page: readJsonNumber(raw.page) ?? 0, width, x, xadvance, xoffset, y, yoffset };
}

// Reads the encoding from a `distanceField` block: `msdf`/`sdf` when its `fieldType` names one, else
// `raster` (classic pre-rendered BMFont, and any unrecognized field type).
function readJsonEncoding(distanceField: unknown): BitmapFontEncoding {
  if (isObject(distanceField)) {
    const fieldType = distanceField.fieldType;
    if (fieldType === 'msdf' || fieldType === 'sdf') return fieldType;
  }
  return 'raster';
}

function readJsonKerning(raw: unknown): BitmapFontKerningRecord | null {
  if (!isObject(raw)) return null;
  const first = readJsonNumber(raw.first);
  const second = readJsonNumber(raw.second);
  const amount = readJsonNumber(raw.amount);
  if (first === null || second === null || amount === null) return null;
  return { amount, first, second };
}

function readJsonNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
