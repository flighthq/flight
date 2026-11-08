import type { WgpuTextureAspect } from './WgpuTexture.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';

// Opaque: created from a texture and bound or attached, never inspected. On web it is the browser's
// GPUTextureView; a native host supplies its own handle.
export type WgpuTextureView = GPUTextureView;

export interface WgpuTextureViewDescriptor {
  arrayLayerCount?: number;
  aspect?: WgpuTextureAspect;
  baseArrayLayer?: number;
  baseMipLevel?: number;
  dimension?: WgpuTextureViewDimension;
  format?: WgpuTextureFormat;
  label?: string;
  mipLevelCount?: number;
  usage?: number;
}

export type WgpuTextureViewDimension = '1d' | '2d' | '2d-array' | '3d' | 'cube' | 'cube-array';
