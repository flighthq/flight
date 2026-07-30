import { createEntity } from '@flighthq/entity/contract';
import { createImageResource } from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { createDomRenderState } from './domRenderState';
import { registerDomTextureResolver, resolveDomTexture } from './domTextureResolver';

describe('registerDomTextureResolver', () => {
  it('registers and removes one state-scoped resolver', () => {
    const state = createDomRenderState(document.createElement('div'));
    const textureSource = createEntity({ height: 1, kind: 'acme.test', version: 0, width: 1 }) as TextureSource;
    const texture = createTexture({ dimension: '2d', source: textureSource });
    const canvas = document.createElement('canvas');
    registerDomTextureResolver(state, 'acme.test', () => canvas);
    expect(resolveDomTexture(state, texture)).toBe(canvas);
    registerDomTextureResolver(state, 'acme.test', null);
    expect(resolveDomTexture(state, texture)).toBeNull();
  });
});

describe('resolveDomTexture', () => {
  it('returns null without a matching resolver', () => {
    const state = createDomRenderState(document.createElement('div'));
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(resolveDomTexture(state, createTexture({ dimension: '2d', source: image }))).toBeNull();
  });
});
