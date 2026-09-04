import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
      source: (() => {
        const out = allocateEntity<unknown>();
        out.height = 1;
        out.kind = 'acme.test';
        out.version = 0;
        out.width = 1;
        return finishEntity(out) as TextureSource;
      })(),
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
