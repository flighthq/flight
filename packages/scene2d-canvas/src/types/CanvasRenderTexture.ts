import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { RenderTexture } from '@flighthq/render/contract';

import type { CanvasRenderTargetPool } from './CanvasEffect.ts';
import type { CanvasRenderState } from './CanvasRenderState.ts';
import type { CanvasTextureRenderTarget } from './CanvasRenderTarget.ts';

export type CanvasRenderTextureStatus = 'ready' | 'released' | 'unrendered' | 'writing';

export interface CanvasRenderTextureExplanation {
  readonly height: number;
  readonly status: CanvasRenderTextureStatus;
  readonly width: number;
}

export interface CanvasRenderTextureEntry {
  status: CanvasRenderTextureStatus;
  target: CanvasTextureRenderTarget;
}

// App-level lease pool. Canvas render-texture realizations belong to one screen state; its derived
// offscreen states resolve to the same owner. Effect recipes borrow raw targets internally.
export interface CanvasRenderTexturePool extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  destroyed: boolean;
  readonly effectTargets: CanvasRenderTargetPool;
  readonly free: RenderTexture[];
  readonly leased: Set<RenderTexture>;
  owner: CanvasRenderState | null;
}
