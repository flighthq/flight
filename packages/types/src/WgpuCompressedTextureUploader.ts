import type { CompressedImage } from './CompressedImage';
import type { TextureColorSpace } from './Texture';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder';
import type { WgpuRenderState, WgpuTextureEntry } from './WgpuRenderState';

// Opt-in bridge from a CompressedImage to a sampleable WebGPU texture entry.
export type WgpuCompressedTextureUploader = (
  state: WgpuRenderState,
  image: Readonly<CompressedImage>,
  decode: WgpuCompressedTextureDecoder | null,
  colorSpace?: TextureColorSpace,
) => WgpuTextureEntry | null;
