import { createRenderTexture } from '@flighthq/texture/contract';

import { renderIntoCanvasRenderTexture } from './canvasRenderTexture.ts';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver.ts';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport.ts';
import { createCanvasRenderState } from './canvasTestSupport.ts';
import { resolveCanvasTexture } from './canvasTestSupport.ts';

describe('registerCanvasRenderTextureResolver', () => {
  it('resolves a populated render texture', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 2, width: 2 });
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });
});
