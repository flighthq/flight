import { createBitmap } from '@flighthq/bitmap/contract';
import {
  createWebImageBackend,
  explainImageOperation,
  resetImageBackendForTest,
  setImageBackend,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';
import { resolveCanvasTexture } from './canvasTestSupport';

beforeEach(() => setImageBackend(createWebImageBackend()));
afterEach(() => {
  vi.restoreAllMocks();
  resetImageBackendForTest();
});

describe('registerCanvasBitmapTextureResolver', () => {
  it('materializes a Bitmap as a canvas source', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerCanvasBitmapTextureResolver(getCanvasRenderStateTextureResolvers(state));
    expect(
      resolveCanvasTexture(
        getCanvasRenderStateTextureResolvers(state),
        createTexture({ dimension: '2d', source: bitmap }),
      ),
    ).toBeInstanceOf(HTMLCanvasElement);
  });

  it('refuses Bitmap resolution without materialization support or a DOM fallback', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerCanvasBitmapTextureResolver(getCanvasRenderStateTextureResolvers(state));
    resetImageBackendForTest();
    const createElement = vi.spyOn(document, 'createElement');

    expect(
      resolveCanvasTexture(
        getCanvasRenderStateTextureResolvers(state),
        createTexture({ dimension: '2d', source: bitmap }),
      ),
    ).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
    expect(explainImageOperation('createImageFromBitmap')).toEqual({
      implemented: false,
      layer: 'none',
      operation: 'createImageFromBitmap',
    });
  });
});
