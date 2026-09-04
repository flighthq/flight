import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { explainWgpuTextureResolution } from './explainWgpuTextureResolution';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import { registerWgpuTextureResolver } from './wgpuTextureResolver';

beforeAll(() => {
  installWgpuMock();
});

describe('explainWgpuTextureResolution', () => {
  it('distinguishes missing kinds, missing resolvers, and registered resolvers', async () => {
    const state = await createWgpuRenderStateForTest();
    const texture = createTexture({
      dimension: '2d',
      source: (() => {
        const out = allocateEntity<any>();
        out.height = 1;
        out.kind = 'acme.test';
        out.version = 0;
        out.width = 1;
        return finishEntity(out) as TextureSource;
      })(),
    });

    expect(explainWgpuTextureResolution(state, createTexture())).toEqual({
      kind: null,
      status: 'missing-kind',
    });
    expect(explainWgpuTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'missing-resolver',
    });

    registerWgpuTextureResolver(state, 'acme.test', () => null);
    expect(explainWgpuTextureResolution(state, texture)).toEqual({
      kind: 'acme.test',
      status: 'registered',
    });
  });
});
