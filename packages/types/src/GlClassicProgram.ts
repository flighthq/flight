import type { GlLitProgram } from './GlLitProgram';

// One classic shading model. Lambert is diffuse-only; Phong and BlinnPhong add a specular lobe that
// differs only in the reflection geometry (reflection vector vs. half vector). The model is encoded
// into the program-cache key and selects the fragment shader's specular branch via a #define.
export type GlClassicLightingModel = 'blinnphong' | 'lambert' | 'phong';

// The feature flags that select a classic uber-shader variant. `lightingModel` chooses the shading
// model (and whether a specular branch exists at all); `hasDiffuseMap` / `hasSpecularMap` /
// `hasNormalMap` enable the textured paths; `alphaMaskEnabled` enables the alpha-cutoff discard for
// 'mask' materials. Lambert never sets `hasSpecularMap` or `hasNormalMap` (it has no such fields).
export interface GlClassicDefineKey {
  alphaMaskEnabled: boolean;
  hasDiffuseMap: boolean;
  hasNormalMap: boolean;
  // Whether this variant deforms the vertex by a bone palette (HAS_SKIN). Set by ensureGlClassicProgram
  // from the render-state skinned-run flag, not by the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  hasSpecularMap: boolean;
  // Whether the diffuse map carries a non-identity uv transform (HAS_UV_TRANSFORM); it drives the
  // shared v_uv0 that the diffuse/specular/normal maps sample. Set only when hasDiffuseMap is also true.
  hasUvTransform: boolean;
  lightingModel: GlClassicLightingModel;
}

// A compiled classic uber-shader variant plus its resolved uniform locations. One exists per distinct
// GlClassicDefineKey, cached on the GlRenderState under the `classic:` program-cache namespace.
// Extends GlLitProgram (model/normal/view-projection + the standard light/camera uniforms) with the
// classic material uniforms. Lambert leaves locSpecular / locShininess / locSpecularMap / locNormalMap
// / locNormalScale null (those uniforms are compiled out of its variant), so the renderers guard each
// upload on the location being non-null.
export interface GlClassicProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locDiffuse: WebGLUniformLocation | null;
  locDiffuseMap: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
  locShininess: WebGLUniformLocation | null;
  locSpecular: WebGLUniformLocation | null;
  locSpecularMap: WebGLUniformLocation | null;
}
