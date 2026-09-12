import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';
import { resolveCanvasTexture } from './canvasTestSupport';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

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
