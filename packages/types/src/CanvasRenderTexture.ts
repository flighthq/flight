import type { CanvasRenderTargetPool } from './CanvasRenderEffectPipeline';
import type { CanvasRenderState } from './CanvasRenderState';
import type { CanvasRenderTarget } from './CanvasRenderTarget';
import type { Entity } from './Entity';
import type { RenderTexture } from './RenderTexture';

export type CanvasRenderTextureStatus = 'ready' | 'released' | 'unrendered' | 'writing';

export interface CanvasRenderTextureExplanation {
  readonly height: number;
  readonly status: CanvasRenderTextureStatus;
  readonly width: number;
}

export interface CanvasRenderTextureEntry {
  status: CanvasRenderTextureStatus;
  target: CanvasRenderTarget;
}

// App-level lease pool. Canvas render-texture realizations belong to one screen state; its derived
// offscreen states resolve to the same owner. Effect recipes borrow raw targets internally.
export interface CanvasRenderTexturePool extends Entity {
  destroyed: boolean;
  readonly effectTargets: CanvasRenderTargetPool;
  readonly free: RenderTexture[];
  readonly leased: Set<RenderTexture>;
  owner: CanvasRenderState | null;
}
