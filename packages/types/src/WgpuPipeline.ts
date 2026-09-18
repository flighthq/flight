import type { WgpuRenderRegistries } from './WgpuRenderState';

export interface WgpuPipeline {
  readonly registries: Readonly<WgpuRenderRegistries>;
}
