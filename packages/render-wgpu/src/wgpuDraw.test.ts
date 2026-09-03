import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  Bitmap,
  CompressedImageResource,
  ImageResource,
  Texture,
  WgpuTextureEntry,
} from '@flighthq/types/contract';
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
import { getWgpuRenderStateDeviceResources, getWgpuRenderStateRuntime } from './wgpuRenderState';
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

function compressedBc3Image(): CompressedImageResource {
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
  } as unknown as CompressedImageResource;
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

describe('bindWgpuBitmapTexture mip allocation identity', () => {
  // ★ FALSIFIER, defect 6 arm A — mip allocation is part of a resource's identity, not a sampling
  // preference. WebGPU fixes mipLevelCount at creation, so a level-0-only realization can never serve a
  // request that needs a chain. Before the complete upload key, the second call here returned the FIRST
  // caller's single-level texture and the mipmapped request silently sampled a texture with no lower
  // levels. Dropping the mipLevelCount arm from the cache check fails here.
  //
  // This asserts on the ALLOCATION rather than on rendered pixels, which is what makes it immune to the
  // three maskers that keep bitmap-perbitmap-smoothing.webgpu.ts green: it registers the mipmap
  // generator itself rather than relying on the harness, and it never samples, so neither magnification
  // nor a sampler-specific bind group can hide the wrong allocation.
  it('does not hand a no-mip realization to a request that asks for mips', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuMipmapGeneration(state);
    const image = bitmap(4, 1);

    const withoutMips = bindWgpuBitmapTexture(state, image, false);
    expect(withoutMips.mipLevelCount).toBe(1);

    const withMips = bindWgpuBitmapTexture(state, image, true);
    expect(withMips.mipLevelCount).toBeGreaterThan(1);
  });

  // The raw-element cache (bindWgpuTexture) carries the same identity rule. Nothing in-tree passes
  // generateMips through it today, so this is the test that keeps it true rather than accidentally true.
  it('applies the same mip identity rule to the raw-element cache', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuMipmapGeneration(state);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;

    expect(requireTextureEntry(bindWgpuTexture(state, canvas, false)).mipLevelCount).toBe(1);
    expect(requireTextureEntry(bindWgpuTexture(state, canvas, true)).mipLevelCount).toBeGreaterThan(1);
  });

  it('reuses one realization when the mip request matches', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuMipmapGeneration(state);
    const image = bitmap(4, 1);

    const first = bindWgpuBitmapTexture(state, image, true);
    expect(bindWgpuBitmapTexture(state, image, true)).toBe(first);
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
    } as unknown as ImageResource;
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
    } as unknown as ImageResource;
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
    } as unknown as ImageResource;
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
    const element = (getTextureSource(video) as ImageResource).source as HTMLVideoElement;
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

describe('createWgpuTextureEntry', () => {
  it('creates a texture entry from a canvas', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = requireTextureEntry(createWgpuTextureEntry(state, 4, 4, canvas));
    expect(entry.texture).toBeDefined();
    expect(entry.bindings).toBeDefined();
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
  it('follows the state smoothing policy for a null smoothing', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const entry = bindWgpuBitmapTexture(state, bitmap(4, 1));

    state.allowSmoothing = true;
    const resources = getWgpuRenderStateDeviceResources(state);
    expect(resolveWgpuSmoothingBindGroup(state, entry, null)).toBe(entry.bindings.get(resources.linearSampler));
  });

  // ★ FALSIFIER, defect 6 arm B — a cached bind group must not carry the creating state's smoothing.
  // The entry is realized under one policy and drawn under the other with NO per-bitmap override. Before
  // the resource/binding split the null arm returned a bind group captured at upload time, so this
  // returned the LINEAR group after the policy flipped to nearest: whichever caller realized a shared
  // texture first silently decided how every later sharer sampled it. Deleting the re-read to "cache the
  // default group" fails here.
  it('rebuilds for the current policy when allowSmoothing changes after the texture was realized', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);

    state.allowSmoothing = true;
    const entry = bindWgpuBitmapTexture(state, bitmap(4, 1));
    const smoothed = resolveWgpuSmoothingBindGroup(state, entry, null);

    state.allowSmoothing = false;
    const unsmoothed = resolveWgpuSmoothingBindGroup(state, entry, null);

    expect(unsmoothed).not.toBe(smoothed);
    expect(unsmoothed).toBe(entry.bindings.get(getWgpuRenderStateDeviceResources(state).nearestSampler));
    // Flipping back returns the first group rather than building a third — the policy selects a binding,
    // it does not mint one per draw.
    state.allowSmoothing = true;
    expect(resolveWgpuSmoothingBindGroup(state, entry, null)).toBe(smoothed);
  });

  it('lets a source-owned sampler override the policy, and an explicit override beat both', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const entry = bindWgpuBitmapTexture(state, bitmap(4, 1));

    // External/video sources fix their own filtering; the global policy must not override it.
    const resources = getWgpuRenderStateDeviceResources(state);
    entry.sampler = resources.nearestSampler;
    state.allowSmoothing = true;
    expect(resolveWgpuSmoothingBindGroup(state, entry, null)).toBe(entry.bindings.get(resources.nearestSampler));
    // A per-bitmap override still wins, as it always did.
    expect(resolveWgpuSmoothingBindGroup(state, entry, true)).toBe(entry.bindings.get(resources.linearSampler));
  });

  it('builds and caches distinct LINEAR and NEAREST variants for true/false', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const entry = bindWgpuBitmapTexture(state, bitmap(4, 1));
    const createBindGroup = vi.spyOn(state.device, 'createBindGroup');

    resolveWgpuSmoothingBindGroup(state, entry, true);
    expect(entry.bindings.get(getWgpuRenderStateDeviceResources(state).linearSampler)).toBeDefined();
    expect(createBindGroup).toHaveBeenCalledTimes(1);

    // Second smoothed bind reuses the cached variant — no new bind group.
    resolveWgpuSmoothingBindGroup(state, entry, true);
    expect(createBindGroup).toHaveBeenCalledTimes(1);

    // The unsmoothed variant is a separate cached bind group.
    resolveWgpuSmoothingBindGroup(state, entry, false);
    expect(entry.bindings.get(getWgpuRenderStateDeviceResources(state).nearestSampler)).toBeDefined();
    expect(createBindGroup).toHaveBeenCalledTimes(2);
  });

  it('drops the cached variants when the texture re-uploads (version bump)', async () => {
    const state = await createWgpuRenderStateForTest();
    const image = bitmap(4, 1);
    const entry = bindWgpuBitmapTexture(state, image);
    resolveWgpuSmoothingBindGroup(state, entry, true);
    resolveWgpuSmoothingBindGroup(state, entry, false);
    expect(entry.bindings.size).toBe(2);
    image.version = 2;
    bindWgpuBitmapTexture(state, image);
    expect(entry.bindings.size).toBe(0);
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
    expect(() => submitWgpuQuadDraw(state, 0, resolveWgpuSmoothingBindGroup(state, entry, null))).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('is a no-op when render pass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const entry = requireTextureEntry(bindWgpuTexture(state, canvas));
    expect(() => submitWgpuQuadDraw(state, 0, resolveWgpuSmoothingBindGroup(state, entry, null))).not.toThrow();
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
    const before = runtime.context.pipelineCache.size;
    warmWgpuPipelines(state);
    expect(runtime.context.pipelineCache.size).toBeGreaterThanOrEqual(before);
  });
});
