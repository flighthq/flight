import { createEntity } from '@flighthq/entity/contract';
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
      source: createEntity({ height: 1, kind: 'acme.test', version: 0, width: 1 }) as TextureSource,
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
