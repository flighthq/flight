import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D } from '@flighthq/render';

import type { WebGPUBitmapShader } from './internal';
import type { WebGPURenderStateInternal } from './internal';
import { getWebGPUShader, resolveWebGPUShader, setWebGPUShader } from './webgpuShaderBinding';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('getWebGPUShader', () => {
  it('returns undefined when no shader is bound', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(getWebGPUShader(renderProxy)).toBeUndefined();
  });
});

describe('resolveWebGPUShader', () => {
  it('returns null when no shader feature is enabled', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    const internal = state as unknown as WebGPURenderStateInternal;
    expect(resolveWebGPUShader(internal, renderProxy)).toBeNull();
  });
});

describe('setWebGPUShader', () => {
  it('binds a shader to a display object', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const fakeShader: WebGPUBitmapShader = { pipeline: {} as never, bind: () => {} };

    setWebGPUShader(state, bitmap, fakeShader);

    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(getWebGPUShader(renderProxy)).toBe(fakeShader);
  });

  it('installs the per-node shader binding resolver', async () => {
    const state = (await createWebGPURenderStateForTest()) as WebGPURenderStateInternal;
    const bitmap = createBitmap();
    const fakeShader: WebGPUBitmapShader = { pipeline: {} as never, bind: () => {} };
    expect(state.webgpuShaderBindingResolver).toBeUndefined();
    setWebGPUShader(state, bitmap, fakeShader);
    expect(state.webgpuShaderBindingResolver).toBe(getWebGPUShader);
  });

  it('removes the binding when shader is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const fakeShader: WebGPUBitmapShader = { pipeline: {} as never, bind: () => {} };
    setWebGPUShader(state, bitmap, fakeShader);
    setWebGPUShader(state, bitmap, null);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(getWebGPUShader(renderProxy)).toBeUndefined();
  });
});
