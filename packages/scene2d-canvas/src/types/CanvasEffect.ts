import type { Effect } from '@flighthq/effects/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { HostCanvasCapability } from '@flighthq/surface/contract';

import type { CanvasRenderState } from './CanvasRenderState.ts';
import type { CanvasTextureRenderTarget } from './CanvasRenderTarget.ts';

// The Canvas renderer's effect extension seam. Effects-canvas supplies the built-in runner
// implementations, while the renderer owns the context and registry contract they plug into.
export interface CanvasEffectContext {
  readonly state: CanvasRenderState;
  readonly source: Readonly<CanvasTextureRenderTarget>;
  readonly dest: Readonly<CanvasTextureRenderTarget>;
  readonly pool: CanvasRenderTargetPool;
}

export type CanvasEffectRunner = (ctx: Readonly<CanvasEffectContext>, effect: Readonly<Effect>) => void;

export interface CanvasRenderTargetPool extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly canvasHost: Readonly<HostCanvasCapability>;
  free: CanvasTextureRenderTarget[];
  inUse: CanvasTextureRenderTarget[];
}
