import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { BlendMode } from '@flighthq/types';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import {
  applyWgpuBlendMode,
  bindWgpuTexture,
  buildWgpuRenderTargetBindGroup,
  createWgpuTextureEntry,
  drawWgpuQuad,
  drawWgpuQuadWithTransform,
  enableWgpuBlendModeSupport,
  getWgpuRenderProxyColorTransform,
  submitWgpuQuadDraw,
  updateWgpuTextureEntry,
  warmWgpuPipelines,
} from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('applyWgpuBlendMode', () => {
  it('updates currentBlendMode on the state', async () => {
    const state = await createWgpuRenderStateForTest();
    applyWgpuBlendMode(state, BlendMode.Add);
    expect(getWgpuRenderStateRuntime(state).currentBlendMode).toBe(BlendMode.Add);
  });

  it('accepts null', async () => {
    const state = await createWgpuRenderStateForTest();
    applyWgpuBlendMode(state, null);
    expect(getWgpuRenderStateRuntime(state).currentBlendMode).toBeNull();
  });
});

describe('bindWgpuTexture', () => {
  it('creates and caches a texture entry', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const entry = bindWgpuTexture(state, canvas);
    expect(entry).toBeDefined();
    expect(entry.texture).toBeDefined();
    expect(bindWgpuTexture(state, canvas)).toBe(entry);
  });
});

describe('buildWgpuRenderTargetBindGroup', () => {
  it('returns a bind group for a view', async () => {
    const state = await createWgpuRenderStateForTest();
    const fakeView = {} as GPUTextureView;
    const bindGroup = buildWgpuRenderTargetBindGroup(state, fakeView);
    expect(bindGroup).toBeDefined();
  });
});

describe('createWgpuTextureEntry', () => {
  it('creates a texture entry from a canvas', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = createWgpuTextureEntry(state, 4, 4, canvas);
    expect(entry.texture).toBeDefined();
    expect(entry.bindGroup).toBeDefined();
  });
});

describe('drawWgpuQuad', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWgpuTexture(state, canvas);
    expect(() => drawWgpuQuad(state, renderProxy, entry, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('drawWgpuQuadWithTransform', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWgpuTexture(state, canvas);
    const t = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    expect(() => drawWgpuQuadWithTransform(state, renderProxy, t, entry, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('enableWgpuBlendModeSupport', () => {
  it('sets applyBlendMode', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuBlendModeSupport(state);
    expect(state.applyBlendMode).not.toBeNull();
  });
});

describe('getWgpuRenderProxyColorTransform', () => {
  it('returns null when the node has no color transform', () => {
    expect(getWgpuRenderProxyColorTransform({} as never)).toBeNull();
    expect(getWgpuRenderProxyColorTransform({ colorTransform: null } as never)).toBeNull();
  });

  it('returns the resolved node-level color transform trait', () => {
    const colorTransform = { redMultiplier: 0.5 };
    expect(getWgpuRenderProxyColorTransform({ colorTransform } as never)).toBe(colorTransform);
  });
});

describe('submitWgpuQuadDraw', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWgpuTexture(state, canvas);
    expect(() => submitWgpuQuadDraw(state, 0, entry.bindGroup)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('is a no-op when render pass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = bindWgpuTexture(state, canvas);
    expect(() => submitWgpuQuadDraw(state, 0, entry.bindGroup)).not.toThrow();
  });
});

describe('updateWgpuTextureEntry', () => {
  it('does not throw when called with a canvas', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = createWgpuTextureEntry(state, 4, 4, canvas);
    expect(() => updateWgpuTextureEntry(state, entry, canvas)).not.toThrow();
  });
});

describe('warmWgpuPipelines', () => {
  it('pre-populates the pipeline cache', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const before = runtime.pipelineCache.size;
    warmWgpuPipelines(state);
    expect(runtime.pipelineCache.size).toBeGreaterThanOrEqual(before);
  });
});
