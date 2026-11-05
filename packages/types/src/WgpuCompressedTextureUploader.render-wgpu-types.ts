import type { CompressedImageResource } from './CompressedImageResource.ts';
import type { TextureColorSpace } from './Texture.ts';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder.ts';
import type { WgpuRenderState, WgpuTextureEntry } from './WgpuRenderState.ts';

// Opt-in bridge from a CompressedImageResource to a sampleable WebGPU texture entry.
export type WgpuCompressedTextureUploader = (
  state: WgpuRenderState,
  image: Readonly<CompressedImageResource>,
  decode: WgpuCompressedTextureDecoder | null,
  colorSpace?: TextureColorSpace,
) => WgpuTextureEntry | null;
