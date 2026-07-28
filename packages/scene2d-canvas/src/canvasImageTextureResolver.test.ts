import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { createCanvasRenderState } from './canvasRenderState';
import { resolveCanvasTexture } from './canvasTextureResolver';

describe('registerCanvasImageTextureResolver', () => {
  it('returns the host image source directly', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const source = document.createElement('img');
    const texture = createTexture({ storage: { dimension: '2d', image: createImageResource(source) } });
    registerCanvasImageTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBe(source);
  });
});
