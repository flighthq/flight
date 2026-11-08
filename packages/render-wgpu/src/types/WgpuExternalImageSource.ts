import type { WgpuTexelCopyTextureInfo } from './WgpuTexture.ts';

export interface WgpuCopyExternalImageDestInfo extends WgpuTexelCopyTextureInfo {
  colorSpace?: PredefinedColorSpace;
  premultipliedAlpha?: boolean;
}

export interface WgpuCopyExternalImageSourceInfo {
  flipY?: boolean;
  origin?: WgpuOrigin2D;
  source: WgpuExternalImageSource;
}

export type WgpuOrigin2D = readonly number[] | Readonly<WgpuOrigin2DDict>;

export interface WgpuOrigin2DDict {
  x?: number;
  y?: number;
}

// The host image a queue copies into a texture. This is the one WGPU seam still shaped by the web: on web
// it is any browser image source (bitmap, canvas, video, frame), and a native host has no equivalent
// object, so it uploads decoded bytes through writeTexture instead.
export type WgpuExternalImageSource = GPUCopyExternalImageSource;

// Opaque: imported from a video source and bound, never inspected.
export type WgpuExternalTexture = GPUExternalTexture;
