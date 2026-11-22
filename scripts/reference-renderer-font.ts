import { sdkHostDecompressDeflate } from '@flighthq/compression';
import {
  assembleSfntFont,
  computeSfntTableChecksum,
  createGlyphOutlineSourceFromOpenTypeFont,
  createSyntheticFont,
  packSfntTag,
  readSfntTableDirectory,
} from '@flighthq/font-formats';
import type { SyntheticGlyph } from '@flighthq/font-formats';

const PATTERNS = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
} as const;

const TEXT = 'FLIGHT TS';
const FONT_UNITS_PER_EM = 28;
const FONT_ADVANCE = 24;
const GLYPH_CELL = 4;
const GLYPH_INK = 3;

export interface ReferenceRendererFontFixture {
  readonly bytes: Uint8Array;
  readonly fnv1a32: number;
  readonly text: string;
}

/**
 * Generates Flight-owned SFNT bytes for the production browser/native text paths. This helper owns
 * only the face data: layout, glyph rasterization and drawing deliberately remain the responsibility
 * of the SDK text node and its registered backend renderer.
 */
export function createReferenceRendererFontFixture(): ReferenceRendererFontFixture {
  const glyphEntries = Object.entries(PATTERNS);
  const glyphs: SyntheticGlyph[] = [
    { endPoints: [], points: [] },
    { endPoints: [], points: [] },
  ];
  const codepoints = new Map<number, number>([[0x20, 1]]);
  for (const [letter, pattern] of glyphEntries) {
    codepoints.set(letter.codePointAt(0)!, glyphs.length);
    glyphs.push(patternGlyph(pattern));
  }
  const bytes = completeBrowserFont(
    createSyntheticFont({
      advances: glyphs.map(() => FONT_ADVANCE),
      codepoints,
      glyphs,
      unitsPerEm: FONT_UNITS_PER_EM,
    }),
    glyphs.length,
  );
  const source = createGlyphOutlineSourceFromOpenTypeFont(bytes, sdkHostDecompressDeflate);
  if (source === null) throw new Error('[reference-renderer] generated SFNT face was rejected');
  return { bytes, fnv1a32: fnv1a(bytes), text: TEXT };
}

/** Adds the standardized tables and metrics a browser font sanitizer requires to Flight's minimal SFNT. */
function completeBrowserFont(minimal: Readonly<Uint8Array>, glyphCount: number): Uint8Array {
  const directory = readSfntTableDirectory(minimal);
  if (directory === null) throw new Error('[reference-renderer] generated SFNT directory was rejected');
  const tables = new Map<string, Uint8Array>();
  for (const [tag, range] of directory.tables) {
    tables.set(tag, minimal.slice(range.offset, range.offset + range.length));
  }

  const head = tables.get('head')!.slice();
  const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);
  headView.setUint32(4, 0x00010000);
  headView.setUint32(12, 0x5f0f3cf5);
  headView.setUint16(16, 3);
  headView.setInt16(36, 0);
  headView.setInt16(38, 0);
  headView.setInt16(40, 19);
  headView.setInt16(42, 27);
  headView.setUint16(46, 8);
  headView.setInt16(48, 2);
  tables.set('head', head);

  const hhea = tables.get('hhea')!.slice();
  const hheaView = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength);
  hheaView.setUint32(0, 0x00010000);
  hheaView.setInt16(4, FONT_UNITS_PER_EM);
  hheaView.setInt16(6, 0);
  hheaView.setInt16(8, 0);
  hheaView.setUint16(10, FONT_ADVANCE);
  hheaView.setInt16(12, 0);
  hheaView.setInt16(14, FONT_ADVANCE - 19);
  hheaView.setInt16(16, 19);
  hheaView.setInt16(18, 1);
  tables.set('hhea', hhea);

  const cmap = tables.get('cmap')!.slice();
  const cmapView = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const format4Offset = cmapView.getUint32(8);
  const segmentCount = cmapView.getUint16(format4Offset + 6) / 2;
  const segmentPowerOfTwo = 2 ** Math.floor(Math.log2(segmentCount));
  cmapView.setUint16(format4Offset + 8, segmentPowerOfTwo * 2);
  cmapView.setUint16(format4Offset + 10, Math.log2(segmentPowerOfTwo));
  cmapView.setUint16(format4Offset + 12, segmentCount * 2 - segmentPowerOfTwo * 2);
  tables.set('cmap', cmap);

  const maxp = new Uint8Array(32);
  const maxpView = new DataView(maxp.buffer);
  maxpView.setUint32(0, 0x00010000);
  maxpView.setUint16(4, glyphCount);
  maxpView.setUint16(6, 128);
  maxpView.setUint16(8, 32);
  maxpView.setUint16(14, 1);
  tables.set('maxp', maxp);

  const glyf = tables.get('glyf')!.slice();
  const loca = tables.get('loca')!;
  const locaView = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  const glyfView = new DataView(glyf.buffer, glyf.byteOffset, glyf.byteLength);
  for (let glyph = 0; glyph < glyphCount; glyph++) {
    const start = locaView.getUint32(glyph * 4);
    const end = locaView.getUint32((glyph + 1) * 4);
    if (start === end) continue;
    glyfView.setInt16(start + 2, 0);
    glyfView.setInt16(start + 4, 0);
    glyfView.setInt16(start + 6, 19);
    glyfView.setInt16(start + 8, 27);
  }
  tables.set('glyf', glyf);
  tables.set('name', encodeNameTable());
  tables.set('OS/2', encodeOs2Table());
  const post = new Uint8Array(32);
  new DataView(post.buffer).setUint32(0, 0x00030000);
  tables.set('post', post);

  const font = assembleSfntFont(
    0x00010000,
    [...tables].map(([tag, data]) => ({ data, tag: packSfntTag(tag) })),
  );
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const maximumPowerOfTwo = 2 ** Math.floor(Math.log2(tables.size));
  view.setUint16(6, maximumPowerOfTwo * 16);
  view.setUint16(8, Math.log2(maximumPowerOfTwo));
  view.setUint16(10, tables.size * 16 - maximumPowerOfTwo * 16);
  const completedDirectory = readSfntTableDirectory(font)!;
  const completedHead = completedDirectory.tables.get('head')!;
  view.setUint32(completedHead.offset + 8, 0);
  view.setUint32(completedHead.offset + 8, (0xb1b0afba - computeSfntTableChecksum(font)) >>> 0);
  return font;
}

function encodeNameTable(): Uint8Array {
  const names = [
    [1, 'FlightReferenceSynthetic'],
    [2, 'Regular'],
    [4, 'FlightReferenceSynthetic'],
    [6, 'FlightReferenceSynthetic-Regular'],
  ] as const;
  const encoded = names.map(([id, value]) => {
    const bytes = new Uint8Array(value.length * 2);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < value.length; index++) view.setUint16(index * 2, value.charCodeAt(index));
    return { bytes, id };
  });
  const stringOffset = 6 + encoded.length * 12;
  const out = new Uint8Array(stringOffset + encoded.reduce((total, entry) => total + entry.bytes.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, encoded.length);
  view.setUint16(4, stringOffset);
  let offset = 0;
  encoded.forEach((entry, index) => {
    const record = 6 + index * 12;
    view.setUint16(record, 3);
    view.setUint16(record + 2, 1);
    view.setUint16(record + 4, 0x0409);
    view.setUint16(record + 6, entry.id);
    view.setUint16(record + 8, entry.bytes.length);
    view.setUint16(record + 10, offset);
    out.set(entry.bytes, stringOffset + offset);
    offset += entry.bytes.length;
  });
  return out;
}

function encodeOs2Table(): Uint8Array {
  const out = new Uint8Array(78);
  const view = new DataView(out.buffer);
  view.setInt16(2, FONT_ADVANCE);
  view.setUint16(4, 400);
  view.setUint16(6, 5);
  out.set(new TextEncoder().encode('FLIT'), 58);
  view.setUint16(62, 0x0040);
  view.setUint16(64, 0x0020);
  view.setUint16(66, 0x0054);
  view.setInt16(68, FONT_UNITS_PER_EM);
  view.setInt16(70, 0);
  view.setInt16(72, 0);
  view.setUint16(74, FONT_UNITS_PER_EM);
  view.setUint16(76, 0);
  return out;
}

function patternGlyph(pattern: readonly string[]): SyntheticGlyph {
  const points: Array<readonly [number, number, boolean]> = [];
  const endPoints: number[] = [];
  for (const [row, line] of pattern.entries()) {
    for (let column = 0; column < line.length; column++) {
      if (line[column] !== '1') continue;
      const x = column * GLYPH_CELL;
      const y = row * GLYPH_CELL;
      points.push(
        [x, y, true],
        [x + GLYPH_INK, y, true],
        [x + GLYPH_INK, y + GLYPH_INK, true],
        [x, y + GLYPH_INK, true],
      );
      endPoints.push(points.length - 1);
    }
  }
  return { endPoints, points };
}

function fnv1a(bytes: Readonly<Uint8Array>): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}
