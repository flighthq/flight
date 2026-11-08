import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { RenderTexture } from '@flighthq/render/contract';

import type { WgpuDevice } from './WgpuDevice.ts';
import type { WgpuRenderState } from './WgpuRenderState.ts';
import type { WgpuRenderTargetPool, WgpuTextureRenderTarget } from './WgpuRenderTarget.ts';

export type WgpuRenderTextureStatus = 'ready' | 'released' | 'unrendered' | 'writing';

export interface WgpuRenderTextureExplanation {
  height: number;
  status: WgpuRenderTextureStatus;
  width: number;
}

// Runtime-owned realization of one render Texture for one WgpuRenderState.
export interface WgpuRenderTextureEntry {
  status: WgpuRenderTextureStatus;
  target: WgpuTextureRenderTarget;
}

// App-level lease pool. Handles and raw effect targets are locked to the first GPUDevice that uses
// the pool; RenderTexture remains the public currency while recipes consume effectTargets internally.
export interface WgpuRenderTexturePool extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  device: WgpuDevice | null;
  destroyed: boolean;
  effectTargets: WgpuRenderTargetPool;
  free: RenderTexture[];
  leased: Set<RenderTexture>;
}

export type WgpuRenderTextureGuard = (
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
  explanation: Readonly<WgpuRenderTextureExplanation>,
) => void;
