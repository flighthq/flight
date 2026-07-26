import { createBitmapText, getBitmapTextPages, updateBitmapText } from '@flighthq/bitmaptext';
import { setNodeColorAdjustmentsTint } from '@flighthq/node';
import type { BitmapText, GlyphEntry, GlyphSource, ImageResource, RenderProxy2D } from '@flighthq/types';

import { defaultGlBitmapTextRenderer } from './glBitmapText';
import { registerGlColorAdjustmentMaterialFeature } from './glColorAdjustmentMaterialFeature';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { registerStandardGlMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

// A single-page stub glyph source whose page-0 image carries a `source` (so hasImageResourcePixels is true).
function createTestGlyphSource(): GlyphSource {
  const entries = new Map<number, GlyphEntry>([
    [0x41, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x: 0, y: 0 }],
    [0x42, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x: 6, y: 0 }],
  ]);
  const image = {
    source: document.createElement('img'),
    data: null,
    compressed: null,
    width: 64,
    height: 64,
  } as unknown as ImageResource;
  return {
    getGlyphAtlasImage: (page = 0) => (page === 0 ? image : null),
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

function makeProxy(source: BitmapText, colorScaleBias: unknown = null): RenderProxy2D {
  return {
    source,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    colorScaleBias,
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultGlBitmapTextRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultGlBitmapTextRenderer.createData).toBe('function');
    expect(typeof defaultGlBitmapTextRenderer.submit).toBe('function');
  });
});

describe('defaultGlBitmapTextRenderer.submit', () => {
  it('draws one instanced pass covering every laid-out glyph', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    expect(getBitmapTextPages(text)[0].instanceCount).toBe(2);

    const { state, gl } = createGlState();
    registerStandardGlMaterial(state);
    defaultGlBitmapTextRenderer.submit(state, makeProxy(text));
    flushGlSpriteBatch(state as never);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('draws nothing for empty text', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: '' });
    updateBitmapText(text);
    const { state, gl } = createGlState();
    registerStandardGlMaterial(state);
    defaultGlBitmapTextRenderer.submit(state, makeProxy(text));
    flushGlSpriteBatch(state as never);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('folds the node color adjustment in when the adjustment fold is enabled', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A' });
    setNodeColorAdjustmentsTint(text, 0x000000ff);
    updateBitmapText(text);

    const { state, gl } = createGlState();
    registerStandardGlMaterial(state);
    registerGlColorAdjustmentMaterialFeature(state);
    // The resolved color adjustment arrives on the proxy; submit must draw without throwing through the fold.
    defaultGlBitmapTextRenderer.submit(
      state,
      makeProxy(text, {
        redScale: 0,
        greenScale: 0,
        blueScale: 0,
        alphaScale: 1,
        redBias: 0,
        greenBias: 0,
        blueBias: 0,
        alphaBias: 0,
      }),
    );
    flushGlSpriteBatch(state as never);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
  });
});
