import { createRenderTexture } from '@flighthq/texture/contract';

import { createCanvasRenderState } from './canvasRenderState';
import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver';
import { resolveCanvasTexture } from './canvasTextureResolver';

describe('registerCanvasRenderTextureResolver', () => {
  it('resolves a populated render texture', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const texture = createRenderTexture({ height: 2, width: 2 });
    renderIntoCanvasRenderTexture(state, texture, () => {});
    registerCanvasRenderTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBeInstanceOf(HTMLCanvasElement);
  });
});
