import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { hasRenderFeatures } from '@flighthq/render';
import { RenderFeatures } from '@flighthq/types';

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
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);
    expect(getWebGPUShader(renderNode)).toBeUndefined();
  });
});

describe('resolveWebGPUShader', () => {
  it('returns null when no shader feature is enabled', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);
    const internal = state as unknown as WebGPURenderStateInternal;
    expect(resolveWebGPUShader(internal, renderNode)).toBeNull();
  });
});

describe('setWebGPUShader', () => {
  it('binds a shader to a display object', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const fakeShader: WebGPUBitmapShader = { pipeline: {} as never, bind: () => {} };

    setWebGPUShader(state, bitmap, fakeShader);

    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);
    expect(getWebGPUShader(renderNode)).toBe(fakeShader);
  });

  it('enables the Shaders feature flag', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const fakeShader: WebGPUBitmapShader = { pipeline: {} as never, bind: () => {} };
    setWebGPUShader(state, bitmap, fakeShader);
    expect(hasRenderFeatures(state, RenderFeatures.Shaders)).toBe(true);
  });

  it('removes the binding when shader is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    const fakeShader: WebGPUBitmapShader = { pipeline: {} as never, bind: () => {} };
    setWebGPUShader(state, bitmap, fakeShader);
    setWebGPUShader(state, bitmap, null);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);
    expect(getWebGPUShader(renderNode)).toBeUndefined();
  });
});
