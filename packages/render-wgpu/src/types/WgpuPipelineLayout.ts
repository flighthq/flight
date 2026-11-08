import type { WgpuBindGroupLayout } from './WgpuBindGroupLayout.ts';

// Opaque: created by the device and referenced by pipelines, never inspected. On web it is the browser's
// GPUPipelineLayout; a native host supplies its own handle.
export type WgpuPipelineLayout = GPUPipelineLayout;

export interface WgpuPipelineLayoutDescriptor {
  bindGroupLayouts: readonly (WgpuBindGroupLayout | null | undefined)[];
  immediateSize?: number;
  label?: string;
}
