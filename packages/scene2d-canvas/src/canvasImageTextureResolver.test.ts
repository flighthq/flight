import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasRenderState';
import { createCanvasRenderState } from './canvasRenderState';
import { resolveCanvasTexture } from './canvasTextureResolver';

describe('registerCanvasImageTextureResolver', () => {
  it('returns the host image source directly', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const source = document.createElement('img');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(source);
  });

  it('returns a host video through the same image source kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const source = document.createElement('video');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(source);
  });
});
