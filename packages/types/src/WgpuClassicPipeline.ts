import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// One classic shading model. Lambert is diffuse-only; Phong and BlinnPhong add a specular lobe that
// differs only in the reflection geometry (reflection vector vs. half vector). The model is encoded
// first into the pipeline-cache key and selects the fragment shader's specular branch via a const flag.
export type WgpuClassicLightingModel = 'blinnphong' | 'lambert' | 'phong';

// A compiled classic pipeline variant — a WgpuMeshPipeline (pipeline + group(2) material layout).
export interface WgpuClassicPipeline extends WgpuMeshPipeline {}

// The feature flags that select a classic uber-shader variant. `lightingModel` chooses the shading
// model (and whether a specular branch exists at all); `hasDiffuseMap` / `hasSpecularMap` /
// `hasNormalMap` enable the textured paths (not yet used on wgpu — see the prelude note);
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials; `doubleSided` selects the
// cull-none pipeline and flips the normal toward the viewer on back faces.
export interface WgpuClassicDefineKey {
  alphaMaskEnabled: boolean;
  doubleSided: boolean;
  hasDiffuseMap: boolean;
  hasNormalMap: boolean;
  hasSpecularMap: boolean;
  lightingModel: WgpuClassicLightingModel;
}
