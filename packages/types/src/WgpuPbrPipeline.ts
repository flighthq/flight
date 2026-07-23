import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// A compiled PBR uber-shader variant plus the material bind-group layout its group(2) targets — the
// WGSL mirror of GlPbrProgram. One exists per distinct (define key + color-attachment format) pair: a
// Wgpu render pipeline bakes both the feature flags and its color target format, so an HDR rgba16float
// effect target and the bgra8unorm canvas need separate variants. The shared group(0)/group(1) Frame +
// Draw layouts live on the scene runtime (see wgpuMeshPipeline), so only the material layout is carried
// here — inherited from WgpuMeshPipeline. Built once and cached via ensureWgpuPbrPipeline.
export interface WgpuPbrPipeline extends WgpuMeshPipeline {}

// The feature flags that select an uber-shader variant. Each toggles a `const … : bool` in the prelude
// and is hashed into the pipeline-cache key (buildWgpuPbrDefineKey), so distinct flag sets compile and
// cache as distinct pipelines. The `has*Map` flags enable the textured paths of the standard block;
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials; `doubleSided` flips the
// normal toward the viewer on back faces (paired with the pipeline's cull-none state). The extension
// flags (`clearcoatEnabled` … `transmissionEnabled`) each enable one extension lobe; an extension
// renderer sets exactly one. Maps inside an extension's own textures are not part of the key today —
// extension maps are not sampled on wgpu yet and the lobe reads a uniform fallback.
export interface WgpuPbrDefineKey {
  alphaMaskEnabled: boolean;
  anisotropyEnabled: boolean;
  clearcoatEnabled: boolean;
  doubleSided: boolean;
  hasBaseColorMap: boolean;
  hasEmissiveMap: boolean;
  hasMetallicRoughnessMap: boolean;
  hasNormalMap: boolean;
  hasOcclusionMap: boolean;
  iridescenceEnabled: boolean;
  sheenEnabled: boolean;
  specularEnabled: boolean;
  subsurfaceEnabled: boolean;
  transmissionEnabled: boolean;
}
