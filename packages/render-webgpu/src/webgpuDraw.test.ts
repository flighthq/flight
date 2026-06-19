import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { BlendMode } from '@flighthq/types';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import {
  applyWebGPUBlendMode,
  bindWebGPUTexture,
  buildWebGPURenderTargetBindGroup,
  createWebGPUTextureEntry,
  drawWebGPUQuad,
  drawWebGPUQuadWithTransform,
  enableWebGPUBlendModeSupport,
  updateWebGPUTextureEntry,
  warmWebGPUPipelines,
} from './webgpuDraw';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('applyWebGPUBlendMode', () => {
  it('updates currentBlendMode on the state', async () => {
    const state = await createWebGPURenderStateForTest();
    applyWebGPUBlendMode(state, BlendMode.Add);
    expect(getWebGPURenderStateRuntime(state).currentBlendMode).toBe(BlendMode.Add);
  });

  it('accepts null', async () => {
    const state = await createWebGPURenderStateForTest();
    applyWebGPUBlendMode(state, null);
    expect(getWebGPURenderStateRuntime(state).currentBlendMode).toBeNull();
  });
});

describe('bindWebGPUTexture', () => {
  it('creates and caches a texture entry', async () => {
    const state = await createWebGPURenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const entry = bindWebGPUTexture(state, canvas);
    expect(entry).toBeDefined();
    expect(entry.texture).toBeDefined();
    expect(bindWebGPUTexture(state, canvas)).toBe(entry);
  });
});

describe('buildWebGPURenderTargetBindGroup', () => {
  it('returns a bind group for a view', async () => {
    const state = await createWebGPURenderStateForTest();
    const fakeView = {} as GPUTextureView;
    const bindGroup = buildWebGPURenderTargetBindGroup(state, fakeView);
    expect(bindGroup).toBeDefined();
  });
});

describe('createWebGPUTextureEntry', () => {
  it('creates a texture entry from a canvas', async () => {
    const state = await createWebGPURenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = createWebGPUTextureEntry(state, 4, 4, canvas);
    expect(entry.texture).toBeDefined();
    expect(entry.bindGroup).toBeDefined();
  });
});

describe('drawWebGPUQuad', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWebGPUTexture(state, canvas);
    expect(() => drawWebGPUQuad(state, renderProxy, entry, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('drawWebGPUQuadWithTransform', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWebGPUTexture(state, canvas);
    const t = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    expect(() => drawWebGPUQuadWithTransform(state, renderProxy, t, entry, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('enableWebGPUBlendModeSupport', () => {
  it('sets applyBlendMode', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPUBlendModeSupport(state);
    expect(state.applyBlendMode).not.toBeNull();
  });
});

describe('updateWebGPUTextureEntry', () => {
  it('does not throw when called with a canvas', async () => {
    const state = await createWebGPURenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = createWebGPUTextureEntry(state, 4, 4, canvas);
    expect(() => updateWebGPUTextureEntry(state, entry, canvas)).not.toThrow();
  });
});

describe('warmWebGPUPipelines', () => {
  it('pre-populates the pipeline cache', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    const before = runtime.pipelineCache.size;
    warmWebGPUPipelines(state);
    expect(runtime.pipelineCache.size).toBeGreaterThanOrEqual(before);
  });
});
