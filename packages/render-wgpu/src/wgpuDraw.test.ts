import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Bitmap, CompressedImage, Image, Texture, WgpuTextureEntry } from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  BlendMode,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
} from '@flighthq/types/contract';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { registerWgpuCompressedTextureDecoder, registerWgpuCompressedTextureUpload } from './wgpuCompressedTexture';
import {
  applyWgpuBlendMode,
  bindWgpuBitmapTexture,
  bindWgpuCompressedImageTexture,
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
import { registerWgpuMipmapGeneration } from './wgpuMipmap';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

function requireTextureEntry(entry: WgpuTextureEntry | null): WgpuTextureEntry {
  if (entry === null) throw new Error('Expected a ready WebGPU texture entry');
  return entry;
}

function bitmap(size: number, version: number): Bitmap {
  return {
    alphaType: 'straight',
    colorSpace: 'srgb',
    data: new Uint8ClampedArray(size * size * 4),
    format: 'rgba8unorm',
    height: size,
    kind: BitmapTextureSourceKind,
    version,
    width: size,
  } as unknown as Bitmap;
}

function compressedBc3Image(): CompressedImage {
  return {
    compressed: {
      container: {
        depth: 1,
        faces: 1,
        format: 'bc3',
        height: 4,
        layers: 1,
        levels: [{ byteLength: 16, byteOffset: 0, height: 4, width: 4 }],
        mipLevels: 1,
        supercompression: 'None',
        width: 4,
      },
      payload: new Uint8Array(16),
    },
    height: 4,
    kind: CompressedImageTextureSourceKind,
    version: 1,
    width: 4,
  } as unknown as CompressedImage;
}

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

describe('bindWgpuBitmapTexture', () => {
  it('uploads CPU-readable pixels via writeTexture', async () => {
    const state = await createWgpuRenderStateForTest();
    const writeTexture = vi.spyOn(state.device.queue, 'writeTexture');
    const entry = bindWgpuBitmapTexture(state, bitmap(4, 1));
    expect(entry.texture).toBeDefined();
    expect(writeTexture).toHaveBeenCalled();
  });

  it('caches by resource identity and re-uploads only when the version changes', async () => {
    const state = await createWgpuRenderStateForTest();
    const image = bitmap(2, 1);
    const first = bindWgpuBitmapTexture(state, image);
    expect(bindWgpuBitmapTexture(state, image)).toBe(first);
    const createTexture = vi.spyOn(state.device, 'createTexture');
    image.version = 2;
    bindWgpuBitmapTexture(state, image);
    expect(createTexture).toHaveBeenCalled();
  });

  it('RETIRES the outgoing texture on a version bump rather than destroying it', async () => {
    const state = await createWgpuRenderStateForTest();
    const image = bitmap(2, 1);
    const outgoing = bindWgpuBitmapTexture(state, image).texture;

    image.version = 2;
    bindWgpuBitmapTexture(state, image);

    // A version bump rewrites the cached entry IN PLACE, so a bind group recorded earlier in the frame
    // still points at `outgoing`. The frame's submit is deferred; destroying a texture a recorded command
    // buffer references fails that submit and blanks the whole frame, so it has to wait for post-submit.
    // This guards a hazard with no reproduction of its own — without the test there is nothing to stop
    // the deferral being read as pointless indirection and reverted.
    expect(getWgpuRenderStateRuntime(state).retiredTextures).toContain(outgoing);
  });
});

describe('bindWgpuCompressedImageTexture', () => {
  it('routes through the registered compressed upload seam', async () => {
    const state = await createWgpuRenderStateForTest();
    const decode = vi.fn(() => new Uint8ClampedArray(4 * 4 * 4));
    registerWgpuCompressedTextureUpload(state);
    registerWgpuCompressedTextureDecoder(state, decode);
    const entry = bindWgpuCompressedImageTexture(state, compressedBc3Image());
    expect(entry?.texture).toBeDefined();
    expect(decode).toHaveBeenCalledWith('bc3', 4, 4, expect.any(Uint8Array));
  });

  it('returns null when no compressed uploader is registered', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(bindWgpuCompressedImageTexture(state, compressedBc3Image())).toBeNull();
  });
});

describe('bindWgpuImageResourceTexture', () => {
  it('uploads a host-backed image via copyExternalImageToTexture', async () => {
    const state = await createWgpuRenderStateForTest();
    const copy = vi.spyOn(state.device.queue, 'copyExternalImageToTexture');
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const image = {
      source: canvas,
      width: 4,
      height: 4,
      kind: ImageTextureSourceKind,
      version: 1,
    } as unknown as Image;
    bindWgpuImageResourceTexture(state, image);
    expect(copy).toHaveBeenCalled();
  });

  it('skips an initial upload when the canvas has no pixels', async () => {
    const state = await createWgpuRenderStateForTest();
    const copy = vi.spyOn(state.device.queue, 'copyExternalImageToTexture');
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 4;
    const image = {
      source: canvas,
      width: 0,
      height: 4,
      kind: ImageTextureSourceKind,
      version: 1,
    } as unknown as Image;
    expect(bindWgpuImageResourceTexture(state, image)).toBeNull();
    expect(copy).not.toHaveBeenCalled();
  });

  it('keeps the previous upload when the browser cannot snapshot the current source', async () => {
    const state = await createWgpuRenderStateForTest();
    const copy = vi.spyOn(state.device.queue, 'copyExternalImageToTexture');
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const image = {
      source: canvas,
      width: 4,
      height: 4,
      kind: ImageTextureSourceKind,
      version: 1,
    } as unknown as Image;
    const entry = requireTextureEntry(bindWgpuImageResourceTexture(state, image));
    copy.mockImplementation(() => {
      throw new TypeError('Failed to copy content from external image.');
    });
    image.version = 2;
    expect(bindWgpuImageResourceTexture(state, image)).toBe(entry);
    expect(copy).toHaveBeenCalledTimes(2);
  });
});

describe('bindWgpuTexture', () => {
  it('creates and caches a texture entry', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const entry = requireTextureEntry(bindWgpuTexture(state, canvas));
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
    registerWgpuMipmapGeneration(state);
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

  it('degrades to a single mip level when generateMips is true but no generator is registered', async () => {
    const state = await createWgpuRenderStateForTest();
    const createTexture = vi.spyOn(state.device, 'createTexture');
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    bindWgpuTexture(state, canvas, true);
    expect(createTexture).toHaveBeenCalledWith(expect.objectContaining({ mipLevelCount: 1 }));
  });

  it('invokes the mipmapDegradedGuard when degrading', async () => {
    const state = await createWgpuRenderStateForTest();
    const guard = vi.fn();
    getWgpuRenderStateRuntime(state).mipmapDegradedGuard = guard;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    bindWgpuTexture(state, canvas, true);
    expect(guard).toHaveBeenCalledWith(state);
  });

  it('does not invoke the mipmapDegradedGuard when the generator is registered', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuMipmapGeneration(state);
    const guard = vi.fn();
    getWgpuRenderStateRuntime(state).mipmapDegradedGuard = guard;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    bindWgpuTexture(state, canvas, true);
    expect(guard).not.toHaveBeenCalled();
  });
});

describe('bindWgpuVideoTexture', () => {
  function videoTexture(version: number, readyState = 4, width = 320, height = 240): Texture {
    const source = document.createElement('video');
    Object.defineProperties(source, {
      readyState: { configurable: true, value: readyState, writable: true },
      videoHeight: { configurable: true, value: height, writable: true },
      videoWidth: { configurable: true, value: width, writable: true },
    });
    return {
      colorSpace: 'srgb',
      sampler: {
        anisotropy: 1,
        magFilter: 'linear',
        minFilter: 'linear',
        mipmaps: false,
        wrapU: 'clamp-to-edge',
        wrapV: 'clamp-to-edge',
      },
      dimension: '2d',
      source: {
        source,
        version,
      },
      version,
    } as unknown as Texture;
  }

  it('uploads once per source version and caches the texture by source identity', async () => {
    const state = await createWgpuRenderStateForTest();
    const copy = vi.spyOn(state.device.queue, 'copyExternalImageToTexture');
    const video = videoTexture(1);
    const first = bindWgpuVideoTexture(state, video);
    expect(first).not.toBeNull();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(bindWgpuVideoTexture(state, video)).toBe(first);
    expect(copy).toHaveBeenCalledTimes(1);
    getTextureSource(video)!.version = 2;
    expect(bindWgpuVideoTexture(state, video)).toBe(first);
    expect(copy).toHaveBeenCalledTimes(2);
  });

  it('waits for a decoded frame and recreates the texture after a resolution change', async () => {
    const state = await createWgpuRenderStateForTest();
    const video = videoTexture(1, 1, 0, 0);
    expect(bindWgpuVideoTexture(state, video)).toBeNull();
    const element = (getTextureSource(video) as Image).source as HTMLVideoElement;
    Object.assign(element, { readyState: 4, videoHeight: 120, videoWidth: 160 });
    const first = bindWgpuVideoTexture(state, video)!;
    const destroy = vi.spyOn(first.texture, 'destroy');
    Object.assign(element, { videoHeight: 240, videoWidth: 320 });
    const second = bindWgpuVideoTexture(state, video)!;
    expect(second).not.toBe(first);
    expect(destroy).toHaveBeenCalled();
  });

  it('realizes distinct linear and sRGB textures for one video source', async () => {
    const state = await createWgpuRenderStateForTest();
    const createTexture = vi.spyOn(state.device, 'createTexture');
    const video = videoTexture(1);
    const srgb = bindWgpuVideoTexture(state, video);
    expect(createTexture).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'rgba8unorm-srgb' }));
    video.colorSpace = 'linear';
    const linear = bindWgpuVideoTexture(state, video);
    expect(linear).not.toBe(srgb);
    expect(createTexture).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'rgba8unorm' }));
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
    const entry = requireTextureEntry(createWgpuTextureEntry(state, 4, 4, canvas));
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
    const bitmap = createSprite();
    prepareScene2DRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = requireTextureEntry(bindWgpuTexture(state, canvas));
    expect(() => drawWgpuQuad(state, renderProxy, entry, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('drawWgpuQuadWithTransform', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const bitmap = createSprite();
    prepareScene2DRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = requireTextureEntry(bindWgpuTexture(state, canvas));
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
  it('returns the default bind group for a null smoothing (no variant built)', async () => {
    const state = await createWgpuRenderStateForTest();
    const entry = bindWgpuBitmapTexture(state, bitmap(4, 1));
    expect(resolveWgpuSmoothingBindGroup(state, entry, null)).toBe(entry.bindGroup);
    expect(entry.bindGroupLinear).toBeUndefined();
    expect(entry.bindGroupNearest).toBeUndefined();
  });

  it('builds and caches distinct LINEAR and NEAREST variants for true/false', async () => {
    const state = await createWgpuRenderStateForTest();
    const entry = bindWgpuBitmapTexture(state, bitmap(4, 1));
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
    const image = bitmap(4, 1);
    const entry = bindWgpuBitmapTexture(state, image);
    resolveWgpuSmoothingBindGroup(state, entry, true);
    resolveWgpuSmoothingBindGroup(state, entry, false);
    expect(entry.bindGroupLinear).toBeDefined();
    image.version = 2;
    bindWgpuBitmapTexture(state, image);
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
    const entry = requireTextureEntry(bindWgpuTexture(state, canvas));
    expect(() => submitWgpuQuadDraw(state, 0, entry.bindGroup)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('is a no-op when render pass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = requireTextureEntry(bindWgpuTexture(state, canvas));
    expect(() => submitWgpuQuadDraw(state, 0, entry.bindGroup)).not.toThrow();
  });
});

describe('updateWgpuTextureEntry', () => {
  it('does not throw when called with a canvas', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = requireTextureEntry(createWgpuTextureEntry(state, 4, 4, canvas));
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
