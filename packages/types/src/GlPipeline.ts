import type { Entity } from './Entity';
import type { GlRenderRegistries } from './GlRenderState';

export interface GlPipeline extends Entity {
  readonly registries: Readonly<GlRenderRegistries>;
}
