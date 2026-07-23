import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// The feature flags that select a debug variant. `mode` picks the depth vs normal fragment branch;
// `hasNormalMap` enables the sampled tangent-space normal-map perturbation (normal mode only — depth
// ignores it; not yet wired on wgpu, see the prelude note). Distinct keys compile and cache as distinct
// pipelines.
export interface WgpuDebugDefineKey {
  hasNormalMap: boolean;
  mode: 'depth' | 'normal';
}

// A compiled debug pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuDebugPipeline extends WgpuMeshPipeline {}
