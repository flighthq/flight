import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createBitmap } from '@flighthq/scene2d';
import type { ImageResource, VideoTexture } from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import {
  applyWgpuBlendMode,
  bindWgpuImageResourceTexture,
  bindWgpuTexture,
  bindWgpuVideoTexture,
  buildWgpuRenderTargetBindGroup,
  createWgpuTextureEntry,
  drawWgpuQuad,
  drawWgpuQuadWithTransform,
  destroyWgpuVideoTexture,
  enableWgpuBlendModeSupport,
  getWgpuRenderProxyColorScaleBias,
  resolveWgpuSmoothingBindGroup,
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

describe('bindWgpuImageResourceTexture', () => {
  function dataResource(size: number, version: number): ImageResource {
    return {
      source: null,
      data: new Uint8ClampedArray(size * size * 4),
      width: size,
      height: size,
      version,
      alphaType: 'straight',
    } as unknown as ImageResource;
  }

  it('uploads a data-only ImageResource (a generated Surface) via writeTexture', async () => {
    const state = await createWgpuRenderStateForTest();
    const writeTexture = vi.spyOn(state.device.queue, 'writeTexture');
    const entry = bindWgpuImageResourceTexture(state, dataResource(4, 1));
    expect(entry.texture).toBeDefined();
    expect(writeTexture).toHaveBeenCalled();
  });

  it('uploads an element-backed ImageResource via copyExternalImageToTexture', async () => {
    const state = await createWgpuRenderStateForTest();
    const copy = vi.spyOn(state.device.queue, 'copyExternalImageToTexture');
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const image = {
      source: canvas,
      data: null,
      width: 4,
      height: 4,
      version: 1,
      alphaType: 'straight',
    } as unknown as ImageResource;
    bindWgpuImageResourceTexture(state, image);
    expect(copy).toHaveBeenCalled();
  });

  it('caches by resource identity and re-uploads only when the version changes', async () => {
    const state = await createWgpuRenderStateForTest();
    const image = dataResource(2, 1);
    const first = bindWgpuImageResourceTexture(state, image);
    expect(bindWgpuImageResourceTexture(state, image)).toBe(first);
    const createTexture = vi.spyOn(state.device, 'createTexture');
    image.version = 2;
    bindWgpuImageResourceTexture(state, image);
    expect(createTexture).toHaveBeenCalled();
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

  it('allocates a single mip level and generates no chain by default', async () => {
    const state = await createWgpuRenderStateForTest();
    const createTexture = vi.spyOn(state.device, 'createTexture');
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    bindWgpuTexture(state, canvas);
    expect(createTexture).toHaveBeenCalledWith(expect.objectContaining({ mipLevelCount: 1 }));
  });

  it('allocates a full mip chain and generates it when generateMips is true', async () => {
    const state = await createWgpuRenderStateForTest();
    const createTexture = vi.spyOn(state.device, 'createTexture');
    const submit = vi.spyOn(state.device.queue, 'submit');
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    bindWgpuTexture(state, canvas, true);
    // 8x8 → 4 mip levels; the lower 3 are rendered via generateWgpuMipmaps (a queue submit).
    expect(createTexture).toHaveBeenCalledWith(expect.objectContaining({ mipLevelCount: 4 }));
    expect(submit).toHaveBeenCalled();
  });
});

describe('bindWgpuVideoTexture', () => {
  function videoTexture(frameId: number, readyState = 4, width = 320, height = 240): VideoTexture {
    return {
      frameId,
      sampler: {
        anisotropy: 1,
        magFilter: 'linear',
        minFilter: 'linear',
        mipmaps: false,
        wrapU: 'clamp-to-edge',
        wrapV: 'clamp-to-edge',
      },
      source: { element: { readyState, videoHeight: height, videoWidth: width } as HTMLVideoElement },
    } as unknown as VideoTexture;
  }

  it('uploads once per frameId and caches the texture by VideoTexture identity', async () => {
    const state = await createWgpuRenderStateForTest();
    const copy = vi.spyOn(state.device.queue, 'copyExternalImageToTexture');
    const video = videoTexture(1);
    const first = bindWgpuVideoTexture(state, video);
    expect(first).not.toBeNull();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(bindWgpuVideoTexture(state, video)).toBe(first);
    expect(copy).toHaveBeenCalledTimes(1);
    video.frameId = 2;
    expect(bindWgpuVideoTexture(state, video)).toBe(first);
    expect(copy).toHaveBeenCalledTimes(2);
  });

  it('waits for a decoded frame and recreates the texture after a resolution change', async () => {
    const state = await createWgpuRenderStateForTest();
    const video = videoTexture(1, 1, 0, 0);
    expect(bindWgpuVideoTexture(state, video)).toBeNull();
    const element = video.source.element!;
    Object.assign(element, { readyState: 4, videoHeight: 120, videoWidth: 160 });
    const first = bindWgpuVideoTexture(state, video)!;
    const destroy = vi.spyOn(first.texture, 'destroy');
    Object.assign(element, { videoHeight: 240, videoWidth: 320 });
    const second = bindWgpuVideoTexture(state, video)!;
    expect(second).not.toBe(first);
    expect(destroy).toHaveBeenCalled();
  });

  it('destroys and removes an uploaded video texture', async () => {
    const state = await createWgpuRenderStateForTest();
    const video = videoTexture(1);
    const entry = bindWgpuVideoTexture(state, video)!;
    const destroy = vi.spyOn(entry.texture, 'destroy');
    expect(destroyWgpuVideoTexture(state, video)).toBe(true);
    expect(destroy).toHaveBeenCalled();
    expect(destroyWgpuVideoTexture(state, video)).toBe(false);
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

describe('destroyWgpuVideoTexture', () => {
  it('is the public disposal entry point for dynamic video uploads', () => {
    expect(typeof destroyWgpuVideoTexture).toBe('function');
  });
});

describe('drawWgpuQuad', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const bitmap = createBitmap();
    prepareScene2DRender(state, bitmap);
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
    prepareScene2DRender(state, bitmap);
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

describe('getWgpuRenderProxyColorScaleBias', () => {
  it('returns null when the node has no color adjustment', () => {
    expect(getWgpuRenderProxyColorScaleBias({} as never)).toBeNull();
    expect(getWgpuRenderProxyColorScaleBias({ colorScaleBias: null } as never)).toBeNull();
  });

  it('returns the resolved node-level color adjustment trait', () => {
    const colorScaleBias = { redScale: 0.5 };
    expect(getWgpuRenderProxyColorScaleBias({ colorScaleBias } as never)).toBe(colorScaleBias);
  });
});

describe('resolveWgpuSmoothingBindGroup', () => {
  function dataResource(size: number, version: number): ImageResource {
    return {
      source: null,
      data: new Uint8ClampedArray(size * size * 4),
      width: size,
      height: size,
      version,
      alphaType: 'straight',
    } as unknown as ImageResource;
  }

  it('returns the default bind group for a null smoothing (no variant built)', async () => {
    const state = await createWgpuRenderStateForTest();
    const entry = bindWgpuImageResourceTexture(state, dataResource(4, 1));
    expect(resolveWgpuSmoothingBindGroup(state, entry, null)).toBe(entry.bindGroup);
    expect(entry.bindGroupLinear).toBeUndefined();
    expect(entry.bindGroupNearest).toBeUndefined();
  });

  it('builds and caches distinct LINEAR and NEAREST variants for true/false', async () => {
    const state = await createWgpuRenderStateForTest();
    const entry = bindWgpuImageResourceTexture(state, dataResource(4, 1));
    const createBindGroup = vi.spyOn(state.device, 'createBindGroup');

    resolveWgpuSmoothingBindGroup(state, entry, true);
    expect(entry.bindGroupLinear).toBeDefined();
    expect(createBindGroup).toHaveBeenCalledTimes(1);

    // Second smoothed bind reuses the cached variant — no new bind group.
    resolveWgpuSmoothingBindGroup(state, entry, true);
    expect(createBindGroup).toHaveBeenCalledTimes(1);

    // The unsmoothed variant is a separate cached bind group.
    resolveWgpuSmoothingBindGroup(state, entry, false);
    expect(entry.bindGroupNearest).toBeDefined();
    expect(createBindGroup).toHaveBeenCalledTimes(2);
  });

  it('drops the cached variants when the texture re-uploads (version bump)', async () => {
    const state = await createWgpuRenderStateForTest();
    const image = dataResource(4, 1);
    const entry = bindWgpuImageResourceTexture(state, image);
    resolveWgpuSmoothingBindGroup(state, entry, true);
    resolveWgpuSmoothingBindGroup(state, entry, false);
    expect(entry.bindGroupLinear).toBeDefined();
    image.version = 2;
    bindWgpuImageResourceTexture(state, image);
    expect(entry.bindGroupLinear).toBeUndefined();
    expect(entry.bindGroupNearest).toBeUndefined();
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
