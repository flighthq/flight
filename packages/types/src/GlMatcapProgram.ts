import type { GlMeshProgram } from './GlMeshProgram';

// The feature flags that select a matcap variant. `hasMatcap` enables the sampled matcap texture
// (when absent the shader outputs the tint alone); `alphaMaskEnabled` enables the alpha-cutoff
// discard for 'mask' materials.
export interface GlMatcapDefineKey {
  alphaMaskEnabled: boolean;
  hasMatcap: boolean;
}

// A compiled matcap variant plus its resolved uniform locations. Extends GlMeshProgram with the
// matcap fragment/vertex uniforms: `locView` (the camera view matrix, used to rotate the world-space
// normal into view space) and `locNormalMatrix` (resolved from u_normalMatrix — matcap needs the
// normal, unlike the unlit family). One exists per distinct GlMatcapDefineKey, cached on the
// GlRenderState under the `matcap:` program-cache namespace.
export interface GlMatcapProgram extends GlMeshProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locMatcap: WebGLUniformLocation | null;
  locTint: WebGLUniformLocation | null;
  locView: WebGLUniformLocation | null;
}
