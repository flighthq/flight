import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerDomImageTextureResolver } from './domImageTextureResolver';
import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';

describe('registerDomImageTextureResolver', () => {
  it('returns the host image source directly', () => {
    const state = createDomRenderState(document.createElement('div'));
    const source = document.createElement('img');
    const texture = createTexture({ storage: { dimension: '2d', image: createImageResource(source) } });
    registerDomImageTextureResolver(state);
    expect(resolveDomTexture(state, texture)).toBe(source);
  });
});
