import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

describe('resolveCanvasTextureWindowSource', () => {
  it('returns an identity-window host source directly', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const source = document.createElement('canvas');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    expect(resolveCanvasTextureWindowSource(getCanvasRenderStateTextureResolvers(state), texture)).toBe(source);
  });
});
