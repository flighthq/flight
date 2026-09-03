import { createBitmapText, updateBitmapText } from '@flighthq/bitmaptext/contract';
import { createImageResource } from '@flighthq/image/contract';
import type { BitmapText, GlyphEntry, GlyphSource, ImageResource, RenderProxy2D } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { defaultCanvasBitmapTextRenderer, drawCanvasSpriteText } from './canvasBitmapText';
import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';

// Single-page stub glyph source whose page-0 image is a real ImageResource backed by a DOM <img>.
function createTestGlyphSource(): GlyphSource {
  const entries = new Map<number, GlyphEntry>([
    [0x41, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x: 0, y: 0 }],
    [0x42, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x: 6, y: 0 }],
  ]);
  const image = createImageResource(globalThis.document.createElement('img'));
  image.width = 64;
  image.height = 64;
  return {
    getGlyphAtlasImage: (page = 0): ImageResource | null => (page === 0 ? image : null),
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: () => 0,
    getGlyphLayoutVersion: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const state = createCanvasRenderState(canvas);
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  return state;
}

function makeProxy(source: BitmapText): RenderProxy2D {
  return {
    source,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    colorScaleBias: null,
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultCanvasBitmapTextRenderer', () => {
  it('has submit and createData', () => {
    expect(typeof defaultCanvasBitmapTextRenderer.submit).toBe('function');
    expect(typeof defaultCanvasBitmapTextRenderer.createData).toBe('function');
  });
});

describe('drawCanvasSpriteText', () => {
  it('draws one image per laid-out glyph', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    const state = makeState();
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasSpriteText(state, makeProxy(text));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('draws nothing for empty text', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: '' });
    updateBitmapText(text);
    const state = makeState();
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasSpriteText(state, makeProxy(text));
    expect(spy).not.toHaveBeenCalled();
  });
});
