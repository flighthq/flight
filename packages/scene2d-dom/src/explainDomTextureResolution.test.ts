import { createEntity } from '@flighthq/entity/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { createDomRenderState } from './domRenderState';
import { registerDomTextureResolver } from './domTextureResolver';
import { explainDomTextureResolution } from './explainDomTextureResolution';

describe('explainDomTextureResolution', () => {
  it('distinguishes missing kinds, missing resolvers, and registered resolvers', () => {
    const state = createDomRenderState(document.createElement('div'));
    const texture = createTexture({
      dimension: '2d',
      source: createEntity({ height: 1, kind: 'acme.test', version: 0, width: 1 }) as TextureSource,
    });

    expect(explainDomTextureResolution(state, createTexture())).toEqual({
      kind: null,
      status: 'missing-kind',
    });
    expect(explainDomTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'missing-resolver',
    });

    registerDomTextureResolver(state, 'acme.test', () => null);
    expect(explainDomTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'registered',
    });
  });
});
