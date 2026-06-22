import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { WgpuBitmapShader } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { getWgpuShader, resolveWgpuShader, setWgpuShader } from './wgpuShaderBinding';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuShader', () => {
  it('returns undefined when no shader is bound', async () => {
    const state = await createWgpuRenderStateForTest();
    const bitmap = createBitmap();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(getWgpuShader(renderProxy)).toBeUndefined();
  });
});

describe('resolveWgpuShader', () => {
  it('returns null when no shader feature is enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const bitmap = createBitmap();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(resolveWgpuShader(state, renderProxy)).toBeNull();
  });
});

describe('setWgpuShader', () => {
  it('binds a shader to a display object', async () => {
    const state = await createWgpuRenderStateForTest();
    const bitmap = createBitmap();
    const fakeShader: WgpuBitmapShader = { pipeline: {} as never, bind: () => {} };

    setWgpuShader(state, bitmap, fakeShader);

    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(getWgpuShader(renderProxy)).toBe(fakeShader);
  });

  it('installs the per-node shader binding resolver', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const bitmap = createBitmap();
    const fakeShader: WgpuBitmapShader = { pipeline: {} as never, bind: () => {} };
    expect(runtime.webgpuShaderBindingResolver).toBeUndefined();
    setWgpuShader(state, bitmap, fakeShader);
    expect(runtime.webgpuShaderBindingResolver).toBe(getWgpuShader);
  });

  it('removes the binding when shader is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const bitmap = createBitmap();
    const fakeShader: WgpuBitmapShader = { pipeline: {} as never, bind: () => {} };
    setWgpuShader(state, bitmap, fakeShader);
    setWgpuShader(state, bitmap, null);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(getWgpuShader(renderProxy)).toBeUndefined();
  });
});
