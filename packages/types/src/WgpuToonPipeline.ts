import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// The feature flags that select a Toon uber-shader variant. Each toggles a `const … : bool` in the
// prelude and is hashed into the pipeline-cache key (buildWgpuToonDefineKey), so distinct flag sets
// compile and cache as distinct pipelines. `hasBaseColorMap` enables the sampled albedo tint and
// `hasRamp` switches the quantizer to a 1D ramp lookup — both stay false on the wgpu renderer until
// texture upload lands (see the maps note above); `alphaMaskEnabled` enables the alpha-cutoff discard
// for 'mask' materials; `doubleSided` selects the cull-none pipeline and flips the back-face normal.
export interface WgpuToonDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasBaseColorMap: boolean;
  hasRamp: boolean;
}

// A compiled Toon pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuToonPipeline extends WgpuMeshPipeline {}
