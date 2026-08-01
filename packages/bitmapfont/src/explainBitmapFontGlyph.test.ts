import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { BitmapFontData } from '@flighthq/types/contract';

import { createBitmapFont } from './bitmapFont';
import { explainBitmapFontGlyph } from './explainBitmapFontGlyph';

function fontData(over: Partial<BitmapFontData> = {}): BitmapFontData {
  return {
    glyphs: [
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, width: 7, x: 0, y: 0 },
      { advance: 4, bearingX: 0, bearingY: 0, codepoint: 32, height: 0, width: 0, x: 0, y: 0 },
    ],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
    pages: [createTextureAtlas()],
    ...over,
  };
}

describe('explainBitmapFontGlyph', () => {
  it('reports ok for a glyph that will draw', () => {
    const font = createBitmapFont(fontData());

    expect(explainBitmapFontGlyph(font, 65)).toEqual({
      glyphHeight: 8,
      glyphWidth: 7,
      page: 0,
      pageCount: 1,
      reason: 'ok',
      renderable: true,
    });
  });

  it('distinguishes a codepoint the font does not cover', () => {
    const font = createBitmapFont(fontData());

    expect(explainBitmapFontGlyph(font, 0x1f600)).toEqual({
      glyphHeight: 0,
      glyphWidth: 0,
      // -1 rather than 0: there is no glyph, so there is no page it resolved to, and reporting 0 would
      // read as "page zero" to a caller checking which page to upload.
      page: -1,
      pageCount: 1,
      reason: 'no-glyph',
      renderable: false,
    });
  });

  it('distinguishes a zero-sized glyph the font does carry', () => {
    // A space. The lookup returns a glyph, so the null sentinel cannot report this at all — which is the
    // reason it is worth a distinct reason: drew-nothing-on-purpose and drew-nothing-by-mistake look
    // identical from a blank screen.
    const font = createBitmapFont(fontData());

    const explanation = explainBitmapFontGlyph(font, 32);
    expect(explanation.reason).toBe('empty-glyph');
    expect(explanation.renderable).toBe(false);
  });

  it('reports a font with no page images ahead of the glyph size', () => {
    // Both faults are present on this glyph — no pages AND it is well-formed — and no-pages is the more
    // actionable answer, so the order is deliberate rather than incidental.
    const font = createBitmapFont(fontData({ pages: [] }));

    expect(explainBitmapFontGlyph(font, 65).reason).toBe('no-pages');
    expect(explainBitmapFontGlyph(font, 65).pageCount).toBe(0);
  });

  it('reports no-pages rather than empty-glyph when both apply', () => {
    const font = createBitmapFont(fontData({ pages: [] }));

    expect(explainBitmapFontGlyph(font, 32).reason).toBe('no-pages');
  });
});
