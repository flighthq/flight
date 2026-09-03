import { createBitmap } from '@flighthq/bitmap/contract';
import { createImageResourceFromCanvas } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { HasGraphicsImage, ImageBackend } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { registerDomBitmapTextureResolver } from './domBitmapTextureResolver';
import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';

function createTestImageBackend(): ImageBackend {
  return {
    [EntityRuntimeKey]: undefined,
    createImageFromBitmap(bitmap) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      return createImageResourceFromCanvas(canvas);
    },
    loadImageFromUrl: vi.fn(),
  };
}

function imageHost(backend: ImageBackend = createTestImageBackend()): HasGraphicsImage {
  return { graphics: { image: backend } } as HasGraphicsImage;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerDomBitmapTextureResolver', () => {
  it('materializes a Bitmap as a canvas source', () => {
    const host = imageHost();
    const state = createDomRenderState(document.createElement('div'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerDomBitmapTextureResolver(host, state);
    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });

  it('refuses Bitmap resolution without materialization support', () => {
    const backend: ImageBackend = { [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() };
    const host = imageHost(backend);
    const state = createDomRenderState(document.createElement('div'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerDomBitmapTextureResolver(host, state);
    const createElement = vi.spyOn(document, 'createElement');

    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });
});
