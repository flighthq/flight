import type { CanvasRenderRegistries } from './CanvasRenderState';

export interface CanvasPipeline {
  readonly registries: Readonly<CanvasRenderRegistries>;
}
