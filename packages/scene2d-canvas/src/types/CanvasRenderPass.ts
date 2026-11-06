import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { BlendMode } from '@flighthq/materials/contract';

import type { CanvasRenderState } from './CanvasRenderState.ts';
import type { CanvasRenderTarget } from './CanvasRenderTarget.ts';

// The pooled drawing bracket for one Canvas target.
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
