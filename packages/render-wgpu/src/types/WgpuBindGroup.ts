import type { WgpuBindGroupLayout } from './WgpuBindGroupLayout.ts';
import type { WgpuBuffer } from './WgpuBuffer.ts';
import type { WgpuExternalTexture } from './WgpuExternalImageSource.ts';
import type { WgpuSampler } from './WgpuSampler.ts';
import type { WgpuTexture } from './WgpuTexture.ts';
import type { WgpuTextureView } from './WgpuTextureView.ts';

// Opaque: created by the device and set on a pass, never inspected. On web it is the browser's
// GPUBindGroup; a native host supplies its own handle.
export type WgpuBindGroup = GPUBindGroup;

export interface WgpuBindGroupDescriptor {
  entries: readonly Readonly<WgpuBindGroupEntry>[];
  label?: string;
  layout: WgpuBindGroupLayout;
}

export interface WgpuBindGroupEntry {
  binding: number;
  resource: WgpuBindingResource;
}

export type WgpuBindingResource =
  | Readonly<WgpuBufferBinding>
  | WgpuBuffer
  | WgpuExternalTexture
  | WgpuSampler
  | WgpuTexture
  | WgpuTextureView;

export interface WgpuBufferBinding {
  buffer: WgpuBuffer;
  offset?: number;
  size?: number;
}
