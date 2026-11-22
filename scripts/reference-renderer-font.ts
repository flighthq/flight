import { sdkHostDecompressDeflate } from '@flighthq/compression';
import { createGlyphOutlineSourceFromOpenTypeFont, createSyntheticFont } from '@flighthq/font-formats';
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
  const bytes = createSyntheticFont({
    advances: glyphs.map(() => FONT_ADVANCE),
    codepoints,
    glyphs,
    unitsPerEm: FONT_UNITS_PER_EM,
  });
  const source = createGlyphOutlineSourceFromOpenTypeFont(bytes, sdkHostDecompressDeflate);
  if (source === null) throw new Error('[reference-renderer] generated SFNT face was rejected');
  return { bytes, fnv1a32: fnv1a(bytes), text: TEXT };
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
