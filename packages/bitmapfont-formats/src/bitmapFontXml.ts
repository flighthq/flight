import type { BitmapFont, BitmapFontParseOptions } from '@flighthq/types';
import {
  getXmlElementAttribute,
  getXmlElementAttributeNumber,
  getXmlElementChildByName,
  getXmlElementChildrenByName,
  parseXmlDocument,
} from '@flighthq/xml';
import type { XmlElement } from '@flighthq/xml';

import { buildBitmapFontFromRecord } from './bitmapFontRecord';
import type {
  BitmapFontCharRecord,
  BitmapFontKerningRecord,
  BitmapFontPageRecord,
  BitmapFontRecord,
} from './bitmapFontRecord';

// Parses the XML AngelCode/BMFont `.fnt` variant into a `BitmapFont`. The document is
// `<font><info/><common/><pages><page/></pages><chars><char/></chars><kernings><kerning/></kernings></font>`
// with every field an element attribute. Semantics match `parseBitmapFontFnt` — the same line metrics,
// glyph mapping, and `resolvePage` atlas rehydration. Returns the `null` sentinel — never throwing —
// for malformed XML, a missing `common`/`chars`, or an atlas page that cannot be resolved.
export function parseBitmapFontXml(text: string, options?: Readonly<BitmapFontParseOptions>): BitmapFont | null {
  const record = parseBitmapFontXmlRecord(text);
  if (record === null) return null;
  return buildBitmapFontFromRecord(record, options);
}

// Parses the XML `.fnt` into the neutral record, or `null` when the root/`common`/`chars` blocks are
// absent or a required attribute is malformed.
function parseBitmapFontXmlRecord(text: string): BitmapFontRecord | null {
  const root = parseXmlDocument(text);
  if (root === null || root.name !== 'font') return null;

  const common = getXmlElementChildByName(root, 'common');
  if (common === null) return null;
  const lineHeight = getXmlElementAttributeNumber(common, 'lineHeight');
  const base = getXmlElementAttributeNumber(common, 'base');
  if (lineHeight === null || base === null) return null;

  const pages: BitmapFontPageRecord[] = [];
  const pagesElement = getXmlElementChildByName(root, 'pages');
  if (pagesElement !== null) {
    for (const pageElement of getXmlElementChildrenByName(pagesElement, 'page')) {
      const id = getXmlElementAttributeNumber(pageElement, 'id');
      if (id !== null) pages.push({ file: getXmlElementAttribute(pageElement, 'file') ?? '', id });
    }
  }

  const chars: BitmapFontCharRecord[] = [];
  const charsElement = getXmlElementChildByName(root, 'chars');
  if (charsElement !== null) {
    for (const charElement of getXmlElementChildrenByName(charsElement, 'char')) {
      const char = readXmlChar(charElement);
      if (char !== null) chars.push(char);
    }
  }
  if (chars.length === 0) return null;

  const kernings: BitmapFontKerningRecord[] = [];
  const kerningsElement = getXmlElementChildByName(root, 'kernings');
  if (kerningsElement !== null) {
    for (const kerningElement of getXmlElementChildrenByName(kerningsElement, 'kerning')) {
      const kerning = readXmlKerning(kerningElement);
      if (kerning !== null) kernings.push(kerning);
    }
  }

  return { base, chars, encoding: 'raster', kernings, lineHeight, pages };
}

function readXmlChar(element: Readonly<XmlElement>): BitmapFontCharRecord | null {
  const id = getXmlElementAttributeNumber(element, 'id');
  const x = getXmlElementAttributeNumber(element, 'x');
  const y = getXmlElementAttributeNumber(element, 'y');
  const width = getXmlElementAttributeNumber(element, 'width');
  const height = getXmlElementAttributeNumber(element, 'height');
  const xoffset = getXmlElementAttributeNumber(element, 'xoffset');
  const yoffset = getXmlElementAttributeNumber(element, 'yoffset');
  const xadvance = getXmlElementAttributeNumber(element, 'xadvance');
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
  return {
    height,
    id,
    page: getXmlElementAttributeNumber(element, 'page') ?? 0,
    width,
    x,
    xadvance,
    xoffset,
    y,
    yoffset,
  };
}

function readXmlKerning(element: Readonly<XmlElement>): BitmapFontKerningRecord | null {
  const first = getXmlElementAttributeNumber(element, 'first');
  const second = getXmlElementAttributeNumber(element, 'second');
  const amount = getXmlElementAttributeNumber(element, 'amount');
  if (first === null || second === null || amount === null) return null;
  return { amount, first, second };
}
