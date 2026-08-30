import type { CanvasRenderRegistries } from './CanvasRenderState';
import type { Entity } from './Entity';

export interface CanvasPipeline extends Entity {
  readonly registries: Readonly<CanvasRenderRegistries>;
}
