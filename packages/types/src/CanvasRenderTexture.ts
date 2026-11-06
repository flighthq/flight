import type { RenderTexture } from '@flighthq/render/contract';

import type { CanvasRenderTargetPool } from './CanvasEffectState.ts';
import type { CanvasRenderState } from './CanvasRenderState.ts';
import type { Entity } from './Entity.ts';

/** @deprecated Import Canvas render-texture contracts from `@flighthq/scene2d-canvas/contract`. */
export type {
  CanvasRenderTextureEntry,
  CanvasRenderTextureExplanation,
  CanvasRenderTextureStatus,
} from '@flighthq/scene2d-canvas/contract';

// App-level lease pool. Canvas render-texture realizations belong to one screen state; its derived
// offscreen states resolve to the same owner. Effect recipes borrow raw targets internally.
export interface CanvasRenderTexturePool extends Entity {
  destroyed: boolean;
  readonly effectTargets: CanvasRenderTargetPool;
  readonly free: RenderTexture[];
  readonly leased: Set<RenderTexture>;
  owner: CanvasRenderState | null;
}
