import { createEntity } from '@flighthq/entity/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { explainGlTextureResolution } from './explainGlTextureResolution';
import { createGlState } from './glTestHelper';
import { registerGlTextureResolver } from './glTextureResolver';

describe('explainGlTextureResolution', () => {
  it('distinguishes missing kinds, missing resolvers, and registered resolvers', () => {
    const { state } = createGlState();
    const texture = createTexture({
      dimension: '2d',
      source: createEntity({ height: 1, kind: 'acme.test', version: 0, width: 1 }) as TextureSource,
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
