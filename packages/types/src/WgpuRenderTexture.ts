import type { WgpuRenderTarget } from './WgpuRenderTarget';

export type WgpuRenderTextureStatus = 'ready' | 'unrendered' | 'writing';

// Runtime-owned realization of one produced Texture for one WgpuRenderState.
export interface WgpuRenderTextureEntry {
  status: WgpuRenderTextureStatus;
  target: WgpuRenderTarget;
}
