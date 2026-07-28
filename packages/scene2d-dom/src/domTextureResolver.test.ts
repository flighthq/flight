import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { createDomRenderState } from './domRenderState';
import { registerDomTextureResolver, resolveDomTexture } from './domTextureResolver';

describe('registerDomTextureResolver', () => {
  it('registers and removes one state-scoped resolver', () => {
    const state = createDomRenderState(document.createElement('div'));
    const image = createImageResource(globalThis.document.createElement('img'));
    image.kind = 'acme.test';
    const texture = createTexture({ storage: { dimension: '2d', image } });
    const source = document.createElement('canvas');
    registerDomTextureResolver(state, image.kind, () => source);
    expect(resolveDomTexture(state, texture)).toBe(source);
    registerDomTextureResolver(state, image.kind, null);
    expect(resolveDomTexture(state, texture)).toBeNull();
  });
});

describe('resolveDomTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createDomRenderState(document.createElement('div'));
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(resolveDomTexture(state, createTexture({ storage: { dimension: '2d', image } }))).toBeNull();
  });
});
