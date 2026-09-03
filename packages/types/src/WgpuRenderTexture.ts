import type { Entity } from './Entity';
import type { RenderTexture } from './RenderTexture';
import type { WgpuRenderState } from './WgpuRenderState';
import type { WgpuRenderTarget } from './WgpuRenderTarget';
import type { WgpuRenderTargetPool } from './WgpuRenderTarget';

export type WgpuRenderTextureStatus = 'ready' | 'released' | 'unrendered' | 'writing';

export interface WgpuRenderTextureExplanation {
  readonly height: number;
  readonly status: WgpuRenderTextureStatus;
  readonly width: number;
}

// Runtime-owned realization of one render Texture for one WgpuRenderState.
export interface WgpuRenderTextureEntry {
  status: WgpuRenderTextureStatus;
  target: WgpuRenderTarget;
}

// App-level lease pool. Handles and raw effect targets are locked to the first GPUDevice that uses
// the pool; RenderTexture remains the public currency while recipes consume effectTargets internally.
export interface WgpuRenderTexturePool extends Entity {
  device: GPUDevice | null;
  destroyed: boolean;
  readonly effectTargets: WgpuRenderTargetPool;
  readonly free: RenderTexture[];
  readonly leased: Set<RenderTexture>;
}

export type WgpuRenderTextureGuard = (
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
  explanation: Readonly<WgpuRenderTextureExplanation>,
) => void;
