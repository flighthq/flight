import { createBitmap } from '@flighthq/bitmap/contract';
import {
  createWebImageBackend,
  explainImageOperation,
  resetImageBackendForTest,
  setImageBackend,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerDomBitmapTextureResolver } from './domBitmapTextureResolver';
import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';

beforeEach(() => setImageBackend(createWebImageBackend()));
afterEach(() => {
  vi.restoreAllMocks();
  resetImageBackendForTest();
});

describe('registerDomBitmapTextureResolver', () => {
  it('materializes a Bitmap as a canvas source', () => {
    const state = createDomRenderState(document.createElement('div'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerDomBitmapTextureResolver(state);
    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });

  it('refuses Bitmap resolution without materialization support or a DOM fallback', () => {
    const state = createDomRenderState(document.createElement('div'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerDomBitmapTextureResolver(state);
    resetImageBackendForTest();
    const createElement = vi.spyOn(document, 'createElement');

    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
    expect(explainImageOperation('createImageFromBitmap')).toEqual({
      implemented: false,
      layer: 'none',
      operation: 'createImageFromBitmap',
    });
  });
});
