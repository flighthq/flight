import { createRenderTexture } from '@flighthq/texture/contract';

import { getCanvasRenderStateTextureResolvers } from './canvasRenderState';
import { createCanvasRenderState } from './canvasRenderState';
import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver';
import { resolveCanvasTexture } from './canvasTextureResolver';

describe('registerCanvasRenderTextureResolver', () => {
  it('resolves a populated render texture', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 2, width: 2 });
    renderIntoCanvasRenderTexture(state, texture, () => {});
    registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });
});
