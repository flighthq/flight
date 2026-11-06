import type { ColorLutCache } from '@flighthq/adjustments/contract';
import type { EffectStateOptions } from '@flighthq/effects/contract';
import type { CanvasRenderTargetPool, CanvasTextureRenderTarget } from '@flighthq/scene2d-canvas/contract';

export type {
  CanvasEffectContext,
  CanvasEffectRunner,
  CanvasRenderTargetPool,
} from '@flighthq/scene2d-canvas/contract';

export type CanvasEffectSourceMode = 'draw' | 'hide' | 'knockout';

// Retains the offscreen canvases an effect pass needs across frames. The per-frame effect list is data
// passed to endCanvasEffectPass rather than retained here.
export interface CanvasEffectState {
  readonly options: Readonly<EffectStateOptions>;
  sceneTarget: CanvasTextureRenderTarget | null;
  readonly pool: CanvasRenderTargetPool;
  readonly lutCache: ColorLutCache;
}
