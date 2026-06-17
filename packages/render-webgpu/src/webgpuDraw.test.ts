import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderNode2D, prepareDisplayObjectRender } from '@flighthq/render';
import { hasRenderFeatures } from '@flighthq/render';
import { BlendMode, RenderFeatures } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
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
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('applyWebGPUBlendMode', () => {
  it('updates currentBlendMode on the state', async () => {
    const state = await createWebGPURenderStateForTest();
    applyWebGPUBlendMode(state, BlendMode.Add);
    expect(state.currentBlendMode).toBe(BlendMode.Add);
  });

  it('accepts null', async () => {
    const state = await createWebGPURenderStateForTest();
    applyWebGPUBlendMode(state, null);
    expect(state.currentBlendMode).toBeNull();
  });
});

describe('bindWebGPUTexture', () => {
  it('creates and caches a texture entry', async () => {
    const state = await createWebGPURenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const internal = state as unknown as WebGPURenderStateInternal;
    const entry = bindWebGPUTexture(internal, canvas);
    expect(entry).toBeDefined();
    expect(entry.texture).toBeDefined();
    expect(bindWebGPUTexture(internal, canvas)).toBe(entry);
  });
});

describe('buildWebGPURenderTargetBindGroup', () => {
  it('returns a bind group for a view', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as unknown as WebGPURenderStateInternal;
    const fakeView = {} as GPUTextureView;
    const bindGroup = buildWebGPURenderTargetBindGroup(internal, fakeView);
    expect(bindGroup).toBeDefined();
  });
});

describe('createWebGPUTextureEntry', () => {
  it('creates a texture entry from a canvas', async () => {
    const state = await createWebGPURenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const internal = state as unknown as WebGPURenderStateInternal;
    const entry = createWebGPUTextureEntry(internal, 4, 4, canvas);
    expect(entry.texture).toBeDefined();
    expect(entry.bindGroup).toBeDefined();
  });
});

describe('drawWebGPUQuad', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderNode = getOrCreateRenderNode2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWebGPUTexture(internal, canvas);
    expect(() => drawWebGPUQuad(internal, renderNode, entry, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('drawWebGPUQuadWithTransform', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderNode = getOrCreateRenderNode2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWebGPUTexture(internal, canvas);
    const t = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    expect(() => drawWebGPUQuadWithTransform(internal, renderNode, t, entry, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('enableWebGPUBlendModeSupport', () => {
  it('sets applyBlendMode and enables the feature flag', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPUBlendModeSupport(state);
    expect(state.applyBlendMode).not.toBeNull();
    expect(hasRenderFeatures(state, RenderFeatures.BlendMode)).toBe(true);
  });
});

describe('updateWebGPUTextureEntry', () => {
  it('does not throw when called with a canvas', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as unknown as WebGPURenderStateInternal;
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = createWebGPUTextureEntry(internal, 4, 4, canvas);
    expect(() => updateWebGPUTextureEntry(internal, entry, canvas)).not.toThrow();
  });
});

describe('warmWebGPUPipelines', () => {
  it('pre-populates the pipeline cache', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as unknown as WebGPURenderStateInternal;
    const before = internal.pipelineCache.size;
    warmWebGPUPipelines(internal);
    expect(internal.pipelineCache.size).toBeGreaterThanOrEqual(before);
  });
});
