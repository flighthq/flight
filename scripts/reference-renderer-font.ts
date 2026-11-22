import { createBitmap } from '@flighthq/bitmap';
import type { Bitmap } from '@flighthq/bitmap/contract';
import { sdkHostDecompressDeflate } from '@flighthq/compression';
import { allocateGlyphRasterizerBackendFromGlyphOutlineSource } from '@flighthq/font';
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
const FONT_SIZE = 28;
const FONT_UNITS_PER_EM = 28;
const FONT_ADVANCE = 24;
const GLYPH_CELL = 4;
const GLYPH_INK = 3;

export interface ReferenceRendererFontFixture {
  readonly bytes: Uint8Array;
  readonly fnv1a32: number;
  readonly text: string;
  readonly bitmap: Bitmap;
}

/**
 * Generates and parses Flight-owned SFNT bytes, then rasterizes the pinned glyph outlines through
 * the portable font backend shared by browser and native targets. The bitmap is the authored text
 * component, not a substitute pattern: every amber pixel comes from the loaded face's outlines.
 */
export function createReferenceRendererFontFixture(color: number): ReferenceRendererFontFixture {
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
  const rasterizer = allocateGlyphRasterizerBackendFromGlyphOutlineSource(source);
  const bitmap = createBitmap(252, 70);
  let cursor = 2;
  for (const letter of TEXT) {
    const raster = rasterizer.rasterize(letter.codePointAt(0)!, {
      fontFamily: 'FlightReferenceSynthetic',
      fontSize: FONT_SIZE,
    });
    if (raster === null) throw new Error(`[reference-renderer] generated face lacks ${letter}`);
    blitGlyph(bitmap, raster.pixels, raster.width, raster.height, cursor + raster.bearingX, 2, color);
    cursor += raster.advance;
  }
  return { bitmap, bytes, fnv1a32: fnv1a(bytes), text: TEXT };
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

function blitGlyph(
  target: Bitmap,
  source: Readonly<Uint8Array>,
  width: number,
  height: number,
  targetX: number,
  targetY: number,
  color: number,
): void {
  const [red, green, blue, packedAlpha] = [color >>> 24, color >>> 16, color >>> 8, color].map(
    (component) => component & 0xff,
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceOffset = (y * width + x) * 4;
      const coverage = source[sourceOffset + 3]!;
      if (coverage === 0) continue;
      const pixelX = Math.round(targetX) + x;
      const pixelY = Math.round(targetY) + y;
      if (pixelX < 0 || pixelY < 0 || pixelX >= target.width || pixelY >= target.height) continue;
      const targetOffset = (pixelY * target.width + pixelX) * 4;
      target.data[targetOffset] = red!;
      target.data[targetOffset + 1] = green!;
      target.data[targetOffset + 2] = blue!;
      target.data[targetOffset + 3] = Math.round((coverage * packedAlpha!) / 255);
    }
  }
}

function fnv1a(bytes: Readonly<Uint8Array>): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}
