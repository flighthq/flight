import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerDomImageTextureResolver } from './domImageTextureResolver';
import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

describe('registerDomImageTextureResolver', () => {
  it('returns the host image source directly', () => {
    const state = createDomRenderState(document.createElement('div'));
    const source = document.createElement('img');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    registerDomImageTextureResolver(state);
    expect(resolveDomTexture(state, texture)).toBe(source);
  });

  it('returns a host video through the same image source kind', () => {
    const state = createDomRenderState(document.createElement('div'));
    const source = document.createElement('video');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    registerDomImageTextureResolver(state);
    expect(resolveDomTexture(state, texture)).toBe(source);
  });
});
