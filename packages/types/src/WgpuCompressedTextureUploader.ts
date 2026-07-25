import type { ImageResource } from './ImageResource';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder';
import type { WgpuRenderState, WgpuTextureEntry } from './WgpuRenderState';

// Opt-in bridge from a compressed-only ImageResource to a sampleable WebGPU texture entry.
export type WgpuCompressedTextureUploader = (
  state: WgpuRenderState,
  image: Readonly<ImageResource>,
  decode: WgpuCompressedTextureDecoder | null,
) => WgpuTextureEntry | null;
