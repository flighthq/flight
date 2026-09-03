import { createEntity } from '@flighthq/entity/contract';
import type {
  CompressedImageResource,
  Entity,
  TextureContainer,
  TextureContainerFormat,
  TextureColorSpace,
  WgpuCompressedTextureDecoder,
  WgpuCompressedTextureSupport,
  WgpuRenderState,
  WgpuTextureEntry,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { getWgpuRenderStateDeviceResources, getWgpuRenderStateRuntime } from './wgpuRenderState';

interface WgpuCompressedFormatInfo {
  blockHeight: number;
  blockWidth: number;
  bytesPerBlock: number;
  format: GPUTextureFormat;
}

export function detectWgpuCompressedTextureSupport(device: GPUDevice): WgpuCompressedTextureSupport {
  return {
    astc: device.features.has('texture-compression-astc'),
    bc: device.features.has('texture-compression-bc'),
    etc2: device.features.has('texture-compression-etc2'),
  };
}

export function getWgpuCompressedTextureFormat(
  device: GPUDevice,
  format: TextureContainerFormat,
): GPUTextureFormat | null {
  const info = getCompressedFormatInfo(format);
  if (info === null) return null;
  const support = detectWgpuCompressedTextureSupport(device);
  if (format.startsWith('bc')) return support.bc ? info.format : null;
  if (format.startsWith('astc')) return support.astc ? info.format : null;
  return support.etc2 ? info.format : null;
}

export function hasWgpuCompressedTextureFormat(
  support: Readonly<WgpuCompressedTextureSupport>,
  format: TextureContainerFormat,
): boolean {
  if (getCompressedFormatInfo(format) === null) return false;
  if (format.startsWith('bc')) return support.bc;
  if (format.startsWith('astc')) return support.astc;
  return support.etc2;
}

export function registerWgpuCompressedTextureDecoder(
  state: WgpuRenderState,
  decode: WgpuCompressedTextureDecoder | null,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const table = runtime.registries.compressedTextureDecoder;
  runtime.registries.compressedTextureDecoder = {
    ...table,
    entry: decode === null ? null : { state: RegistryEntryState.Bound, value: decode },
  };
}

export function registerWgpuCompressedTextureUpload(state: WgpuRenderState, uploader?: null): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const table = runtime.registries.compressedTextureUpload;
  runtime.registries.compressedTextureUpload = {
    ...table,
    entry: uploader === null ? null : { state: RegistryEntryState.Bound, value: uploadWgpuCompressedImage },
  };
}

// Creates and fills a WebGPU texture from a parsed block-compressed container. Native uploads cover
// 2D, cubemap, and 2D-array shapes; the RGBA fallback intentionally covers plain 2D only, matching GL.
// A still-supercompressed payload, volume, cubemap-array, missing feature without decoder, or malformed
// level list returns null without creating a texture.
export function uploadWgpuCompressedTextureContainer(
  state: WgpuRenderState,
  container: Readonly<TextureContainer>,
  payload: Readonly<Uint8Array>,
  decode?: WgpuCompressedTextureDecoder,
  colorSpace?: TextureColorSpace,
): GPUTexture | null {
  if (
    container.supercompression !== 'None' ||
    container.depth !== 1 ||
    container.layers < 1 ||
    !Number.isInteger(container.layers) ||
    (container.faces !== 1 && !(container.faces === 6 && container.layers === 1)) ||
    container.levels.length !== container.mipLevels * container.layers * container.faces
  ) {
    return null;
  }

  const native = getWgpuCompressedTextureFormatForColorSpace(state.device, container.format, colorSpace);
  if (native !== null) {
    const info = getCompressedFormatInfo(container.format)!;
    const texture = state.device.createTexture({
      size: [container.width, container.height, container.layers * container.faces],
      format: native,
      mipLevelCount: container.mipLevels,
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    for (let flat = 0; flat < container.levels.length; flat++) {
      const level = container.levels[flat];
      const mipLevel = flat % container.mipLevels;
      const slice = Math.floor(flat / container.mipLevels);
      const bytes = payload.subarray(level.byteOffset, level.byteOffset + level.byteLength);
      // TextureContainer accepts a readonly Uint8Array whose backing store may be shared, while
      // WebGPU writeTexture deliberately accepts ArrayBuffer-backed views only. Copy this upload-sized
      // subresource into an ordinary ArrayBuffer view at the API boundary.
      const uploadBytes = new Uint8Array(bytes);
      const blockRows = Math.ceil(level.height / info.blockHeight);
      state.device.queue.writeTexture(
        { texture, mipLevel, origin: [0, 0, slice] },
        uploadBytes,
        {
          bytesPerRow: Math.ceil(level.width / info.blockWidth) * info.bytesPerBlock,
          rowsPerImage: blockRows,
        },
        [level.width, level.height, 1],
      );
    }
    return texture;
  }

  if (decode === undefined || container.faces !== 1 || container.layers !== 1) return null;
  const decoded: Uint8ClampedArray<ArrayBuffer>[] = [];
  for (const level of container.levels) {
    const bytes = payload.subarray(level.byteOffset, level.byteOffset + level.byteLength);
    const rgba = decode(container.format, level.width, level.height, bytes);
    if (rgba === null || rgba.byteLength !== level.width * level.height * 4) return null;
    decoded.push(rgba);
  }
  const texture = state.device.createTexture({
    size: [container.width, container.height, 1],
    format: colorSpace === 'srgb' ? 'rgba8unorm-srgb' : 'rgba8unorm',
    mipLevelCount: container.mipLevels,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });
  for (let mipLevel = 0; mipLevel < container.levels.length; mipLevel++) {
    const level = container.levels[mipLevel];
    state.device.queue.writeTexture(
      { texture, mipLevel },
      decoded[mipLevel],
      { bytesPerRow: level.width * 4, rowsPerImage: level.height },
      [level.width, level.height, 1],
    );
  }
  return texture;
}

function uploadWgpuCompressedImage(
  state: WgpuRenderState,
  image: Readonly<CompressedImageResource>,
  decode: WgpuCompressedTextureDecoder | null,
  colorSpace: TextureColorSpace = 'linear',
): WgpuTextureEntry | null {
  const compressed = image.compressed;
  const container = compressed.container;
  if (container.depth !== 1 || container.faces !== 1 || container.layers !== 1) return null;
  const native = getWgpuCompressedTextureFormatForColorSpace(state.device, container.format, colorSpace) !== null;
  const fallback =
    decode === null
      ? undefined
      : (format: TextureContainerFormat, width: number, height: number, data: Readonly<Uint8Array>) => {
          const rgba = decode(format, width, height, data);
          return rgba !== null ? premultiplyRgba8(rgba) : null;
        };
  const texture = uploadWgpuCompressedTextureContainer(state, container, compressed.payload, fallback, colorSpace);
  if (texture === null) return null;
  const view = texture.createView();
  const resources = getWgpuRenderStateDeviceResources(state);
  const sampler = state.allowSmoothing ? resources.linearSampler : resources.nearestSampler;
  return createEntity<Omit<WgpuTextureEntry, keyof Entity>>({
    bindings: new Map(),
    mipLevelCount: container.mipLevels,
    sampler,
    straightAlpha: native,
    texture,
    view,
  });
}

function premultiplyRgba8(data: Readonly<Uint8ClampedArray<ArrayBuffer>>): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    out[i] = (data[i] * alpha) / 255;
    out[i + 1] = (data[i + 1] * alpha) / 255;
    out[i + 2] = (data[i + 2] * alpha) / 255;
    out[i + 3] = alpha;
  }
  return out;
}

function getCompressedFormatInfo(format: TextureContainerFormat): WgpuCompressedFormatInfo | null {
  const fixed = FIXED_FORMATS[format];
  if (fixed !== undefined) return fixed;
  if (!format.startsWith('astc')) return null;
  const match = /^astc(\d+)x(\d+)$/.exec(format);
  if (match === null) return null;
  return {
    blockWidth: Number(match[1]),
    blockHeight: Number(match[2]),
    bytesPerBlock: 16,
    format: `astc-${match[1]}x${match[2]}-unorm` as GPUTextureFormat,
  };
}

function getWgpuCompressedTextureFormatForColorSpace(
  device: GPUDevice,
  format: TextureContainerFormat,
  colorSpace: TextureColorSpace | undefined,
): GPUTextureFormat | null {
  const resolved = colorSpace === undefined ? format : getTextureContainerFormatForColorSpace(format, colorSpace);
  const native = getWgpuCompressedTextureFormat(device, resolved);
  if (native !== null && colorSpace === 'srgb' && format.startsWith('astc')) {
    return `${native}-srgb` as GPUTextureFormat;
  }
  return native;
}

function getTextureContainerFormatForColorSpace(
  format: TextureContainerFormat,
  colorSpace: TextureColorSpace,
): TextureContainerFormat {
  const pair = SRGB_FORMAT_PAIRS[format];
  if (pair === undefined) return format;
  return colorSpace === 'srgb' ? pair[1] : pair[0];
}

const fixed = (
  format: GPUTextureFormat,
  bytesPerBlock: number,
  blockWidth = 4,
  blockHeight = 4,
): WgpuCompressedFormatInfo => ({ blockHeight, blockWidth, bytesPerBlock, format });

const FIXED_FORMATS: Partial<Record<TextureContainerFormat, WgpuCompressedFormatInfo>> = {
  bc1: fixed('bc1-rgba-unorm', 8),
  bc1Srgb: fixed('bc1-rgba-unorm-srgb', 8),
  bc2: fixed('bc2-rgba-unorm', 16),
  bc2Srgb: fixed('bc2-rgba-unorm-srgb', 16),
  bc3: fixed('bc3-rgba-unorm', 16),
  bc3Srgb: fixed('bc3-rgba-unorm-srgb', 16),
  bc4: fixed('bc4-r-unorm', 8),
  bc4Snorm: fixed('bc4-r-snorm', 8),
  bc5: fixed('bc5-rg-unorm', 16),
  bc5Snorm: fixed('bc5-rg-snorm', 16),
  bc6hUfloat: fixed('bc6h-rgb-ufloat', 16),
  bc6hSfloat: fixed('bc6h-rgb-float', 16),
  bc7: fixed('bc7-rgba-unorm', 16),
  bc7Srgb: fixed('bc7-rgba-unorm-srgb', 16),
  etc1: fixed('etc2-rgb8unorm', 8),
  etc2Rgb: fixed('etc2-rgb8unorm', 8),
  etc2RgbSrgb: fixed('etc2-rgb8unorm-srgb', 8),
  etc2Rgba: fixed('etc2-rgba8unorm', 16),
  etc2RgbaSrgb: fixed('etc2-rgba8unorm-srgb', 16),
  etc2RgbA1: fixed('etc2-rgb8a1unorm', 8),
  etc2RgbA1Srgb: fixed('etc2-rgb8a1unorm-srgb', 8),
  eacR11: fixed('eac-r11unorm', 8),
  eacR11Snorm: fixed('eac-r11snorm', 8),
  eacRg11: fixed('eac-rg11unorm', 16),
  eacRg11Snorm: fixed('eac-rg11snorm', 16),
};

const SRGB_FORMAT_PAIRS: Partial<
  Record<TextureContainerFormat, readonly [TextureContainerFormat, TextureContainerFormat]>
> = {
  bc1: ['bc1', 'bc1Srgb'],
  bc1Srgb: ['bc1', 'bc1Srgb'],
  bc2: ['bc2', 'bc2Srgb'],
  bc2Srgb: ['bc2', 'bc2Srgb'],
  bc3: ['bc3', 'bc3Srgb'],
  bc3Srgb: ['bc3', 'bc3Srgb'],
  bc7: ['bc7', 'bc7Srgb'],
  bc7Srgb: ['bc7', 'bc7Srgb'],
  etc1: ['etc1', 'etc2RgbSrgb'],
  etc2Rgb: ['etc2Rgb', 'etc2RgbSrgb'],
  etc2RgbSrgb: ['etc2Rgb', 'etc2RgbSrgb'],
  etc2RgbA1: ['etc2RgbA1', 'etc2RgbA1Srgb'],
  etc2RgbA1Srgb: ['etc2RgbA1', 'etc2RgbA1Srgb'],
  etc2Rgba: ['etc2Rgba', 'etc2RgbaSrgb'],
  etc2RgbaSrgb: ['etc2Rgba', 'etc2RgbaSrgb'],
};
