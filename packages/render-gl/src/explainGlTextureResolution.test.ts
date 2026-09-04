import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
      source: (() => {
        const out = allocateEntity<unknown>();
        out.height = 1;
        out.kind = 'acme.test';
        out.version = 0;
        out.width = 1;
        return finishEntity(out) as TextureSource;
      })(),
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
