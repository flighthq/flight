import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';
import type { WgpuTextureViewDimension } from './WgpuTextureView.ts';

// Opaque: created by the device and referenced by bind groups and pipeline layouts, never inspected. On
// web it is the browser's GPUBindGroupLayout; a native host supplies its own handle.
export type WgpuBindGroupLayout = GPUBindGroupLayout;

export interface WgpuBindGroupLayoutDescriptor {
  entries: readonly Readonly<WgpuBindGroupLayoutEntry>[];
  label?: string;
}

export interface WgpuBindGroupLayoutEntry {
  binding: number;
  buffer?: Readonly<WgpuBufferBindingLayout>;
  externalTexture?: Readonly<WgpuExternalTextureBindingLayout>;
  sampler?: Readonly<WgpuSamplerBindingLayout>;
  storageTexture?: Readonly<WgpuStorageTextureBindingLayout>;
  texture?: Readonly<WgpuTextureBindingLayout>;
  visibility: number;
}

export interface WgpuBufferBindingLayout {
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
  type?: WgpuBufferBindingType;
}

export type WgpuBufferBindingType = 'read-only-storage' | 'storage' | 'uniform';

// An external-texture binding takes no options; the entry's presence is the whole declaration.
export type WgpuExternalTextureBindingLayout = object;

export interface WgpuSamplerBindingLayout {
  type?: WgpuSamplerBindingType;
}

export type WgpuSamplerBindingType = 'comparison' | 'filtering' | 'non-filtering';

// Shader stages a binding is visible to, combined with `|`. The numeric values are WGPU's own.
export const WgpuShaderStage = {
  COMPUTE: 0x4,
  FRAGMENT: 0x2,
  VERTEX: 0x1,
} as const;

export type WgpuStorageTextureAccess = 'read-only' | 'read-write' | 'write-only';

export interface WgpuStorageTextureBindingLayout {
  access?: WgpuStorageTextureAccess;
  format: WgpuTextureFormat;
  viewDimension?: WgpuTextureViewDimension;
}

export interface WgpuTextureBindingLayout {
  multisampled?: boolean;
  sampleType?: WgpuTextureSampleType;
  viewDimension?: WgpuTextureViewDimension;
}

export type WgpuTextureSampleType = 'depth' | 'float' | 'sint' | 'uint' | 'unfilterable-float';
