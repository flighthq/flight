import { createBitmap } from '@flighthq/bitmap/contract';
import { createImageResource, registerHostImageDimensionResolver } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { HostImageProvider } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { registerDomBitmapTextureResolver } from './domBitmapTextureResolver';
import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';

// The canvases these tests wrap are measured by the host, so the test registers the one-line resolver a
// browser host would install rather than pulling the whole web host into a renderer package's tests.
registerHostImageDimensionResolver((source, out) => {
  const sized = source as { height: number; width: number };
  out.height = sized.height;
  out.width = sized.width;
  return true;
});

function createTestImageBackend(): HostImageProvider {
  return {
    [EntityRuntimeKey]: undefined,
    createImageFromBitmap(bitmap) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      return createImageResource(canvas);
    },
    loadImageFromUrl: vi.fn(),
  };
}

function imageHost(backend: HostImageProvider = createTestImageBackend()): {
  readonly graphics: { readonly image: HostImageProvider };
} {
  return { graphics: { image: backend } } as { readonly graphics: { readonly image: HostImageProvider } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerDomBitmapTextureResolver', () => {
  it('materializes a Bitmap as a canvas source', () => {
    const host = imageHost();
    const state = createDomRenderState(document.createElement('div'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerDomBitmapTextureResolver(host.graphics.image, state);
    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });

  it('refuses Bitmap resolution without materialization support', () => {
    const backend: HostImageProvider = { [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() };
    const host = imageHost(backend);
    const state = createDomRenderState(document.createElement('div'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerDomBitmapTextureResolver(host.graphics.image, state);
    const createElement = vi.spyOn(document, 'createElement');

    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });
});
