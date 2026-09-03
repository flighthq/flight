import { createBitmap } from '@flighthq/bitmap/contract';
import { createImageResourceFromCanvas } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { HasGraphicsImage, ImageBackend } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import {
  createCanvasRenderState,
  getCanvasRenderStateTextureResolvers,
  resolveCanvasTexture,
} from './canvasTestSupport';

function imageHost(backend: ImageBackend = createTestImageBackend()): HasGraphicsImage {
  return { graphics: { image: backend } } as HasGraphicsImage;
}

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerCanvasBitmapTextureResolver', () => {
  it('materializes a Bitmap as a canvas source', () => {
    const host = imageHost();
    const state = createCanvasRenderState(document.createElement('canvas'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerCanvasBitmapTextureResolver(host, getCanvasRenderStateTextureResolvers(state));
    expect(
      resolveCanvasTexture(
        getCanvasRenderStateTextureResolvers(state),
        createTexture({ dimension: '2d', source: bitmap }),
      ),
    ).toBeInstanceOf(HTMLCanvasElement);
  });

  it('refuses Bitmap resolution without materialization support', () => {
    const backend: ImageBackend = { [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() };
    const host = imageHost(backend);
    const state = createCanvasRenderState(document.createElement('canvas'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerCanvasBitmapTextureResolver(host, getCanvasRenderStateTextureResolvers(state));
    const createElement = vi.spyOn(document, 'createElement');

    expect(
      resolveCanvasTexture(
        getCanvasRenderStateTextureResolvers(state),
        createTexture({ dimension: '2d', source: bitmap }),
      ),
    ).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });
});
