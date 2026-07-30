import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

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
      storage: { dimension: '2d', image: { kind: 'acme.test' } as ImageResource },
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
