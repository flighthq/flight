import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import { createDomRenderState } from './domRenderState';
import { registerDomTextureResolver } from './domTextureResolver';
import { explainDomTextureResolution } from './explainDomTextureResolution';

describe('explainDomTextureResolution', () => {
  it('distinguishes missing kinds, missing resolvers, and registered resolvers', () => {
    const state = createDomRenderState(document.createElement('div'));
    const texture = createTexture({
      storage: { dimension: '2d', image: { kind: 'acme.test' } as ImageResource },
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
