import { createRenderTexture } from '@flighthq/texture/contract';

import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';
import { resolveCanvasTexture } from './canvasTestSupport';

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
