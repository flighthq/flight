import type { CompressedImageResource } from './CompressedImageResource';
import type { TextureColorSpace } from './Texture';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder';
import type { WgpuRenderState, WgpuTextureEntry } from './WgpuRenderState';

// Opt-in bridge from a CompressedImageResource to a sampleable WebGPU texture entry.
export type WgpuCompressedTextureUploader = (
  state: WgpuRenderState,
  image: Readonly<CompressedImageResource>,
  decode: WgpuCompressedTextureDecoder | null,
  colorSpace?: TextureColorSpace,
) => WgpuTextureEntry | null;
