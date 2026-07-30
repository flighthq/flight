import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import { explainGlTextureResolution } from './explainGlTextureResolution';
import { createGlState } from './glTestHelper';
import { registerGlTextureResolver } from './glTextureResolver';

describe('explainGlTextureResolution', () => {
  it('distinguishes missing kinds, missing resolvers, and registered resolvers', () => {
    const { state } = createGlState();
    const texture = createTexture({
      storage: { dimension: '2d', image: { kind: 'acme.test' } as ImageResource },
    });

    expect(explainGlTextureResolution(state, createTexture())).toEqual({
      kind: null,
      status: 'missing-kind',
    });
    expect(explainGlTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'missing-resolver',
    });

    registerGlTextureResolver(state, 'acme.test', () => null);
    expect(explainGlTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'registered',
    });
  });
});
