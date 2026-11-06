import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { BlendMode } from '@flighthq/materials/contract';
import type { CanvasRenderState } from '@flighthq/types/contract';

import type { CanvasRenderTarget } from './CanvasRenderTarget.ts';

// The pooled drawing bracket for one Canvas target. CanvasRenderState is the sole identity-only
// dependency selected while the contract projects close the genuine renderer/effects cycle.
export interface CanvasRenderPass extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  context: CanvasRenderingContext2D;
  saved: CanvasSavedPassState;
  state: CanvasRenderState;
  target: CanvasRenderTarget;
  viewport: CanvasRenderPassViewport;
}

export interface CanvasRenderPassViewport {
  height: number;
  width: number;
}

export interface CanvasSavedPassState {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  currentAlpha: number;
  currentBlendMode: CanvasSavedBlendMode;
  target: CanvasRenderTarget | null;
}

export type CanvasSavedBlendMode = BlendMode | null;
