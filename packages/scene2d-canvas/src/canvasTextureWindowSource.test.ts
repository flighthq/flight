import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

describe('resolveCanvasTextureWindowSource', () => {
  it('returns an identity-window host source directly', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const source = document.createElement('canvas');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    expect(resolveCanvasTextureWindowSource(getCanvasRenderStateTextureResolvers(state), texture)).toBe(source);
  });
});
