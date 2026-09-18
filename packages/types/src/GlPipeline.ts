import type { GlRenderRegistries } from './GlRenderState';

export interface GlPipeline {
  readonly registries: Readonly<GlRenderRegistries>;
}
