import type { Entity } from './Entity';
import type { WgpuRenderRegistries } from './WgpuRenderState';

export interface WgpuPipeline extends Entity {
  readonly registries: Readonly<WgpuRenderRegistries>;
}
