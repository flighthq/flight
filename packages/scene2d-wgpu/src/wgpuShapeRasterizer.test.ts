import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { createRenderState, enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { getWgpuShapeRasterizer, registerWgpuShapeRasterizer } from './wgpuShapeRasterizer';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuShapeRasterizer', () => {
  it('reports none until one is registered', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuShapeRasterizer(state)).toBeNull();
  });
});

describe('registerWgpuShapeRasterizer', () => {
  it('installs the rasterizer the shape path draws non-solid fills through', async () => {
    const state = await createWgpuRenderStateForTest();
    const rasterizer = (): void => {};

    registerWgpuShapeRasterizer(state, rasterizer);

    expect(getWgpuShapeRasterizer(state)).toBe(rasterizer);
  });

  it('removes one again, so a state can drop back to tessellation only', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuShapeRasterizer(state, (): void => {});

    registerWgpuShapeRasterizer(state, null);

    expect(getWgpuShapeRasterizer(state)).toBeNull();
  });
});
