import type { GlLitProgram } from './GlLitProgram';

// The base-material feature flags that select a ShadedMaterial uber-shader variant, independent of
// the modifier stack. Mirrors the classic BlinnPhong flags: which optional maps are present and
// whether alpha-mask cutoff is active. The full program identity is this base key PLUS the modifier
// stack's define-key (see buildGlShadedCacheKey) — the base shades the diffuse + half-vector specular
// surface, the modifiers inject at the slot hooks.
export interface GlShadedDefineKey {
  alphaMaskEnabled: boolean;
  hasDiffuseMap: boolean;
  hasNormalMap: boolean;
  // Set by ensureGlShadedProgram from the render-state skinned-run flag, not the material renderer —
  // skinning keys off geometry.
  hasSkin?: boolean;
  hasSpecularMap: boolean;
  // Whether the diffuse map carries a non-identity uv transform (HAS_UV_TRANSFORM); it drives the
  // shared v_uv0 the diffuse/specular/normal maps and modifier snippets sample. Set only when
  // hasDiffuseMap is also true.
  hasUvTransform: boolean;
}

// A compiled ShadedMaterial program plus its resolved uniform locations. Extends GlLitProgram (the
// shared light-block/camera/shadow uniforms + the vertex model/normal/view-projection) with the base
// material uniforms and the per-frame `u_time`. Per-modifier uniforms are NOT resolved here — each
// snippet's `bind` looks its own suffixed uniforms up on `program`, so the program shape stays fixed
// while the modifier set varies. One exists per distinct (base key + modifier define-key), cached
// under the `shaded:` program-cache namespace.
export interface GlShadedProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locDiffuse: WebGLUniformLocation | null;
  locDiffuseMap: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
  locShininess: WebGLUniformLocation | null;
  locSpecular: WebGLUniformLocation | null;
  locSpecularMap: WebGLUniformLocation | null;
  locTime: WebGLUniformLocation | null;
}
