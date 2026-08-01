import { createTexture } from '@flighthq/texture/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { Bitmap, BitmapFontData, TextureAtlas } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { createBitmapFont } from './bitmapFont';
import { summarizeBitmapFont } from './summarizeBitmapFont';

// A page whose CPU-side image data is `bytes` long. The summary reports the byte footprint of the
// actual data rather than width times height, so the fixture supplies data rather than dimensions.
function pageOfBytes(bytes: number): TextureAtlas {
  const image = {
    alphaType: 'straight',
    colorSpace: 'srgb',
    data: new Uint8ClampedArray(bytes),
    format: 'rgba8unorm',
    height: 1,
    kind: BitmapTextureSourceKind,
    version: 0,
    width: bytes / 4,
  } as unknown as Bitmap;
  return createTextureAtlas({ texture: createTexture({ dimension: '2d', source: image }) });
}

function fontData(over: Partial<BitmapFontData> = {}): BitmapFontData {
  return {
    glyphs: [
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, width: 7, x: 0, y: 0 },
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 0x1f600, height: 8, width: 7, x: 8, y: 0 },
    ],
    kerning: [{ amount: -2, left: 65, right: 0x1f600 }],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
    pages: [pageOfBytes(64 * 32 * 4)],
    ...over,
  };
}

describe('summarizeBitmapFont', () => {
  it('counts glyphs, kerning pairs, pages, pixels and bytes', () => {
    const font = createBitmapFont(fontData());

    expect(summarizeBitmapFont(font)).toEqual({
      byteSize: 64 * 32 * 4,
      glyphCount: 2,
      kerningPairCount: 1,
      maxCodepoint: 0x1f600,
      minCodepoint: 65,
      pageCount: 1,
    });
  });

  it('sums every page rather than reporting only the first', () => {
    const font = createBitmapFont(fontData({ pages: [pageOfBytes(2048), pageOfBytes(512)] }));

    const summary = summarizeBitmapFont(font);
    expect(summary.pageCount).toBe(2);
    expect(summary.byteSize).toBe(2560);
  });

  it('treats an unresolved page as contributing nothing, making the size a lower bound', () => {
    // A page whose texture has not loaded yet. Counting it as zero is what makes the figure a floor
    // rather than an estimate, and the page still shows in pageCount so the gap is visible.
    const font = createBitmapFont(fontData({ pages: [pageOfBytes(2048), createTextureAtlas()] }));

    const summary = summarizeBitmapFont(font);
    expect(summary.pageCount).toBe(2);
    expect(summary.byteSize).toBe(2048);
  });

  it('reports -1 for both ends of the codepoint range of an empty font', () => {
    // 0 would be a lie: U+0000 is a real codepoint, so a caller cannot tell an empty font from one
    // carrying only NUL.
    const font = createBitmapFont(fontData({ glyphs: [], kerning: [] }));

    const summary = summarizeBitmapFont(font);
    expect(summary.minCodepoint).toBe(-1);
    expect(summary.maxCodepoint).toBe(-1);
    expect(summary.glyphCount).toBe(0);
  });

  it('reports the range across supplementary-plane glyphs', () => {
    const font = createBitmapFont(fontData());

    expect(summarizeBitmapFont(font).maxCodepoint).toBe(0x1f600);
  });
});
