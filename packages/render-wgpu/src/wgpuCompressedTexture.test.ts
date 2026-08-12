import type { CompressedImage, TextureContainer, WgpuCompressedTextureSupport } from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, RegistryEntryState } from '@flighthq/types/contract';

import {
  detectWgpuCompressedTextureSupport,
  getWgpuCompressedTextureFormat,
  hasWgpuCompressedTextureFormat,
  registerWgpuCompressedTextureDecoder,
  registerWgpuCompressedTextureUpload,
  uploadWgpuCompressedTextureContainer,
} from './wgpuCompressedTexture';
import { bindWgpuCompressedImageTexture } from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => installWgpuMock());

function container(overrides: Partial<TextureContainer> = {}): TextureContainer {
  return {
    depth: 1,
    faces: 1,
    format: 'bc1',
    height: 4,
    layers: 1,
    levels: [{ byteLength: 8, byteOffset: 0, height: 4, width: 4 }],
    mipLevels: 1,
    supercompression: 'None',
    width: 4,
    ...overrides,
  };
}

function compressedImage(): CompressedImage {
  return {
    compressed: { container: container(), payload: new Uint8Array(8) },
    height: 4,
    kind: CompressedImageTextureSourceKind,
    version: 1,
    width: 4,
  } as unknown as CompressedImage;
}

describe('detectWgpuCompressedTextureSupport', () => {
  it('reads the three WebGPU compression features', async () => {
    const state = await createWgpuRenderStateForTest();
    (state.device.features as Set<GPUFeatureName>).add('texture-compression-bc');
    expect(detectWgpuCompressedTextureSupport(state.device)).toEqual({ astc: false, bc: true, etc2: false });
  });
});

describe('getWgpuCompressedTextureFormat', () => {
  it('maps a format only when its family is enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuCompressedTextureFormat(state.device, 'bc1')).toBeNull();
    (state.device.features as Set<GPUFeatureName>).add('texture-compression-bc');
    expect(getWgpuCompressedTextureFormat(state.device, 'bc1')).toBe('bc1-rgba-unorm');
    expect(getWgpuCompressedTextureFormat(state.device, 'rgba8unorm')).toBeNull();
  });
});

describe('hasWgpuCompressedTextureFormat', () => {
  it('maps formats to the detected family and rejects PVRTC', () => {
    const support: WgpuCompressedTextureSupport = { astc: true, bc: false, etc2: true };
    expect(hasWgpuCompressedTextureFormat(support, 'astc8x8')).toBe(true);
    expect(hasWgpuCompressedTextureFormat(support, 'etc2Rgba')).toBe(true);
    expect(hasWgpuCompressedTextureFormat(support, 'bc7')).toBe(false);
    expect(hasWgpuCompressedTextureFormat(support, 'pvrtc4bppRgba')).toBe(false);
  });
});

describe('registerWgpuCompressedTextureDecoder', () => {
  it('replaces the decoder policy slot and clears it with null', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const before = runtime.registries.compressedTextureDecoder;
    const decoder = vi.fn(() => new Uint8ClampedArray(64));
    registerWgpuCompressedTextureDecoder(state, decoder);
    expect(runtime.registries.compressedTextureDecoder).not.toBe(before);
    expect(runtime.registries.compressedTextureDecoder.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: decoder,
    });
    registerWgpuCompressedTextureDecoder(state, null);
    expect(runtime.registries.compressedTextureDecoder.entry).toBeNull();
  });
});

describe('registerWgpuCompressedTextureUpload', () => {
  it('replaces the compressed upload policy slot and clears it with null', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const before = runtime.registries.compressedTextureUpload;
    registerWgpuCompressedTextureUpload(state);
    expect(runtime.registries.compressedTextureUpload).not.toBe(before);
    expect(runtime.registries.compressedTextureUpload.entry).toMatchObject({
      state: RegistryEntryState.Bound,
      value: expect.any(Function),
    });
    registerWgpuCompressedTextureUpload(state, null);
    expect(runtime.registries.compressedTextureUpload.entry).toBeNull();
  });

  it('lets the compressed-image binder consume its source', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuCompressedTextureUpload(state);
    registerWgpuCompressedTextureDecoder(state, (_format, width, height) => {
      return new Uint8ClampedArray(width * height * 4);
    });
    const writeTexture = vi.spyOn(state.device.queue, 'writeTexture');
    expect(bindWgpuCompressedImageTexture(state, compressedImage())?.view).toBeDefined();
    expect(writeTexture).toHaveBeenCalledTimes(1);
  });

  it('premultiplies straight-alpha decoder output before the RGBA upload', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuCompressedTextureUpload(state);
    registerWgpuCompressedTextureDecoder(state, (_format, width, height) => {
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 255;
        rgba[i + 1] = 64;
        rgba[i + 3] = 128;
      }
      return rgba;
    });
    const writeTexture = vi.spyOn(state.device.queue, 'writeTexture');

    const entry = bindWgpuCompressedImageTexture(state, compressedImage())!;

    expect(entry.straightAlpha).toBe(false);
    expect(Array.from(writeTexture.mock.calls[0][1] as Uint8ClampedArray).slice(0, 4)).toEqual([128, 32, 0, 128]);
  });

  it('marks native straight-alpha blocks for display-shader premultiplication', async () => {
    const state = await createWgpuRenderStateForTest();
    (state.device.features as Set<GPUFeatureName>).add('texture-compression-bc');
    registerWgpuCompressedTextureUpload(state);
    expect(bindWgpuCompressedImageTexture(state, compressedImage())?.straightAlpha).toBe(true);
  });
});

describe('uploadWgpuCompressedTextureContainer', () => {
  it('uploads native blocks with their block-row layout', async () => {
    const state = await createWgpuRenderStateForTest();
    (state.device.features as Set<GPUFeatureName>).add('texture-compression-bc');
    const createTexture = vi.spyOn(state.device, 'createTexture');
    const writeTexture = vi.spyOn(state.device.queue, 'writeTexture');
    expect(uploadWgpuCompressedTextureContainer(state, container(), new Uint8Array(8))).not.toBeNull();
    expect(createTexture).toHaveBeenCalledWith(expect.objectContaining({ format: 'bc1-rgba-unorm', mipLevelCount: 1 }));
    expect(writeTexture).toHaveBeenCalledWith(
      expect.objectContaining({ mipLevel: 0 }),
      expect.any(Uint8Array),
      { bytesPerRow: 8, rowsPerImage: 1 },
      [4, 4, 1],
    );
  });

  it('decodes plain 2D levels to RGBA when native support is absent', async () => {
    const state = await createWgpuRenderStateForTest();
    const decoder = vi.fn(() => new Uint8ClampedArray(64));
    const createTexture = vi.spyOn(state.device, 'createTexture');
    expect(uploadWgpuCompressedTextureContainer(state, container(), new Uint8Array(8), decoder)).not.toBeNull();
    expect(decoder).toHaveBeenCalledWith('bc1', 4, 4, expect.any(Uint8Array));
    expect(createTexture).toHaveBeenCalledWith(expect.objectContaining({ format: 'rgba8unorm' }));
  });

  it('maps canonical multi-mip cubemap entries to the right mip and face slice', async () => {
    const state = await createWgpuRenderStateForTest();
    const levels = Array.from({ length: 6 }, (_, face) => [
      { byteLength: 32, byteOffset: face * 40, height: 8, width: 8 },
      { byteLength: 8, byteOffset: face * 40 + 32, height: 4, width: 4 },
    ]).flat();
    const cube = container({ faces: 6, height: 8, levels, mipLevels: 2, width: 8 });
    expect(
      uploadWgpuCompressedTextureContainer(state, cube, new Uint8Array(240), () => new Uint8ClampedArray(64)),
    ).toBeNull();
    (state.device.features as Set<GPUFeatureName>).add('texture-compression-bc');
    const writeTexture = vi.spyOn(state.device.queue, 'writeTexture');
    expect(uploadWgpuCompressedTextureContainer(state, cube, new Uint8Array(240))).not.toBeNull();
    expect(writeTexture).toHaveBeenCalledTimes(12);
    expect(writeTexture.mock.calls[1][0]).toEqual(expect.objectContaining({ mipLevel: 1, origin: [0, 0, 0] }));
    expect(writeTexture.mock.calls[2][0]).toEqual(expect.objectContaining({ mipLevel: 0, origin: [0, 0, 1] }));
  });

  it('maps canonical multi-mip array entries to the right mip and layer slice', async () => {
    const state = await createWgpuRenderStateForTest();
    (state.device.features as Set<GPUFeatureName>).add('texture-compression-bc');
    const array = container({
      height: 8,
      layers: 2,
      levels: [
        { byteLength: 32, byteOffset: 0, height: 8, width: 8 },
        { byteLength: 8, byteOffset: 32, height: 4, width: 4 },
        { byteLength: 32, byteOffset: 40, height: 8, width: 8 },
        { byteLength: 8, byteOffset: 72, height: 4, width: 4 },
      ],
      mipLevels: 2,
      width: 8,
    });
    const writeTexture = vi.spyOn(state.device.queue, 'writeTexture');
    expect(uploadWgpuCompressedTextureContainer(state, array, new Uint8Array(80))).not.toBeNull();
    expect(writeTexture.mock.calls[1][0]).toEqual(expect.objectContaining({ mipLevel: 1, origin: [0, 0, 0] }));
    expect(writeTexture.mock.calls[2][0]).toEqual(expect.objectContaining({ mipLevel: 0, origin: [0, 0, 1] }));
  });

  it('rejects supercompressed, volume, cubemap-array, and unavailable payloads', async () => {
    const state = await createWgpuRenderStateForTest();
    const payload = new Uint8Array(8);
    expect(uploadWgpuCompressedTextureContainer(state, container({ supercompression: 'Zstd' }), payload)).toBeNull();
    expect(uploadWgpuCompressedTextureContainer(state, container({ depth: 2 }), payload)).toBeNull();
    expect(uploadWgpuCompressedTextureContainer(state, container({ faces: 6, layers: 2 }), payload)).toBeNull();
    expect(uploadWgpuCompressedTextureContainer(state, container(), payload)).toBeNull();
  });
});
