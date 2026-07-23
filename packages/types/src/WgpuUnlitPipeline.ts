import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// The feature flags that select an unlit variant. `hasColorMap` enables the sampled color map (not yet
// used on wgpu — see note); `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials;
// `doubleSided` selects the cull-none pipeline.
export interface WgpuUnlitDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasColorMap: boolean;
}

// A compiled unlit pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuUnlitPipeline extends WgpuMeshPipeline {}
