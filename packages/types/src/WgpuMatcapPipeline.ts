import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// The feature flags that select a matcap variant. `hasMatcap` enables the sampled matcap texture (not
// yet used on wgpu — see prelude note; when false the shader outputs the tint alone); `alphaMaskEnabled`
// enables the alpha-cutoff discard for 'mask' materials; `doubleSided` selects the cull-none pipeline.
export interface WgpuMatcapDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasMatcap: boolean;
}

// A compiled matcap pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuMatcapPipeline extends WgpuMeshPipeline {}
