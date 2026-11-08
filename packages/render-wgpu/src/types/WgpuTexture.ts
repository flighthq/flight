import type { WgpuBuffer } from './WgpuBuffer.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';
import type { WgpuTextureView, WgpuTextureViewDescriptor, WgpuTextureViewDimension } from './WgpuTextureView.ts';

export type WgpuExtent3D = readonly number[] | Readonly<WgpuExtent3DDict>;

export interface WgpuExtent3DDict {
  depthOrArrayLayers?: number;
  height?: number;
  width: number;
}

export type WgpuOrigin3D = readonly number[] | Readonly<WgpuOrigin3DDict>;

export interface WgpuOrigin3DDict {
  x?: number;
  y?: number;
  z?: number;
}

export interface WgpuTexelCopyBufferInfo extends WgpuTexelCopyBufferLayout {
  buffer: WgpuBuffer;
}

export interface WgpuTexelCopyBufferLayout {
  bytesPerRow?: number;
  offset?: number;
  rowsPerImage?: number;
}

export interface WgpuTexelCopyTextureInfo {
  aspect?: WgpuTextureAspect;
  mipLevel?: number;
  origin?: WgpuOrigin3D;
  texture: WgpuTexture;
}

export interface WgpuTexture {
  readonly dimension: WgpuTextureDimension;
  readonly format: WgpuTextureFormat;
  readonly height: number;
  readonly width: number;
  createView(descriptor?: Readonly<WgpuTextureViewDescriptor>): WgpuTextureView;
  destroy(): void;
}

export type WgpuTextureAspect = 'all' | 'depth-only' | 'stencil-only';

export interface WgpuTextureDescriptor {
  dimension?: WgpuTextureDimension;
  format: WgpuTextureFormat;
  label?: string;
  mipLevelCount?: number;
  sampleCount?: number;
  size: WgpuExtent3D;
  textureBindingViewDimension?: WgpuTextureViewDimension;
  usage: number;
  viewFormats?: readonly WgpuTextureFormat[];
}

export type WgpuTextureDimension = '1d' | '2d' | '3d';

// Usage flags a texture is created with, combined with `|`. The numeric values are WGPU's own.
export const WgpuTextureUsage = {
  COPY_DST: 0x02,
  COPY_SRC: 0x01,
  RENDER_ATTACHMENT: 0x10,
  STORAGE_BINDING: 0x08,
  TEXTURE_BINDING: 0x04,
} as const;
