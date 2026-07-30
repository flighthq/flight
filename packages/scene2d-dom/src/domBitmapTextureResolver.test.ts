import { createBitmap } from '@flighthq/bitmap/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerDomBitmapTextureResolver } from './domBitmapTextureResolver';
import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';

describe('registerDomBitmapTextureResolver', () => {
  it('materializes a Bitmap as a canvas source', () => {
    const state = createDomRenderState(document.createElement('div'));
    const bitmap = createBitmap(2, 2, 0xffffffff);
    registerDomBitmapTextureResolver(state);
    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: bitmap }))).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });
});
