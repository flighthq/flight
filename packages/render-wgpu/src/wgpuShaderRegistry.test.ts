import type { WgpuBitmapShader } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState.ts';
import { registerWgpuBitmapShader } from './wgpuShaderRegistry.ts';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper.ts';

beforeAll(() => {
  installWgpuMock();
});

describe('registerWgpuBitmapShader', () => {
  it('sets the shader as the state default', async () => {
    const state = await createWgpuRenderStateForTest();
    const fakeShader = {
      pipeline: {},
      bind: () => {},
    } as unknown as WgpuBitmapShader;
    registerWgpuBitmapShader(state, fakeShader);
    expect(getWgpuRenderStateRuntime(state).defaultBitmapShader).toBe(fakeShader);
  });

  it('replaces a previously registered shader', async () => {
    const state = await createWgpuRenderStateForTest();
    const shader1 = { pipeline: {}, bind: () => {} } as unknown as WgpuBitmapShader;
    const shader2 = { pipeline: {}, bind: () => {} } as unknown as WgpuBitmapShader;
    registerWgpuBitmapShader(state, shader1);
    registerWgpuBitmapShader(state, shader2);
    expect(getWgpuRenderStateRuntime(state).defaultBitmapShader).toBe(shader2);
  });
});
