import type { WgpuAdapter, WgpuRequestAdapterOptions } from './WgpuAdapter.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';

// The WGPU entry point: the part of `navigator.gpu` Flight calls. The browser object satisfies it
// directly; a native host presents its instance through the same two members.
export interface WgpuGpu {
  getPreferredCanvasFormat(): WgpuTextureFormat;
  requestAdapter(options?: Readonly<WgpuRequestAdapterOptions>): Promise<WgpuAdapter | null>;
}
