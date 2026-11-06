import type { ColorLutCache } from '@flighthq/adjustments/contract';
import type { Effect, EffectStateOptions } from '@flighthq/effects/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { CanvasTextureRenderTarget } from '@flighthq/scene2d-canvas/contract';
import type { HostCanvasCapability } from '@flighthq/surface/contract';
import type { CanvasRenderState } from '@flighthq/types/contract';

// What a Canvas 2D effect runner is handed: the state, the offscreen scene canvas it reads, the
// offscreen canvas it writes, and a scratch pool it borrows intermediate canvases from. `source` and
// `dest` are distinct offscreen targets the pipeline ping-pongs between stages.
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

// Retains the offscreen canvases an effect pass needs across frames. The per-frame effect list is data
// passed to endCanvasEffectPass rather than retained here.
export interface CanvasEffectState {
  readonly options: Readonly<EffectStateOptions>;
  sceneTarget: CanvasTextureRenderTarget | null;
  readonly pool: CanvasRenderTargetPool;
  readonly lutCache: ColorLutCache;
}
