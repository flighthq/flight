import type { TextureContainerFormat } from './TextureContainerFormat';

// Optional CPU fallback for a block-compressed WebGPU texture whose family was not enabled on the
// device. The returned bytes are tightly-packed RGBA8 pixels for one mip level, or null when the
// decoder does not support the format.
export type WgpuCompressedTextureDecoder = (
  format: TextureContainerFormat,
  width: number,
  height: number,
  data: Readonly<Uint8Array>,
) => Uint8ClampedArray<ArrayBuffer> | null;
