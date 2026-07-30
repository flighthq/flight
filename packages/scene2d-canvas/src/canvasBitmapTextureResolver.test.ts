import { createBitmap } from '@flighthq/bitmap/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { createCanvasRenderState } from './canvasRenderState';
import { resolveCanvasTexture } from './canvasTextureResolver';

describe('registerCanvasBitmapTextureResolver', () => {
  it('materializes a Bitmap as a canvas source', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerCanvasBitmapTextureResolver(state);
    expect(resolveCanvasTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });
});
