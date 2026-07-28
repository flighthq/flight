import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { createCanvasRenderState } from './canvasRenderState';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

describe('resolveCanvasTextureWindowSource', () => {
  it('returns an identity-window host source directly', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const source = document.createElement('canvas');
    const texture = createTexture({ storage: { dimension: '2d', image: createImageResource(source) } });
    registerCanvasImageTextureResolver(state);
    expect(resolveCanvasTextureWindowSource(state, texture)).toBe(source);
  });
});
