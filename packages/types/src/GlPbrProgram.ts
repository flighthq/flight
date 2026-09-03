import type { GlLitProgram } from './GlLitProgram';

// A compiled PBR uber-shader variant plus its resolved uniform locations. One of these exists per
// distinct GlPbrDefineKey (maps-present / alpha-mask + extension-lobe combination), built once and
// cached on the GlRenderState (see ensureGlPbrProgram). The vertex attribute locations are fixed by
// the shader's `layout(location = …)` qualifiers (0 position, 1 normal, 2 tangent, 3 uv0), so they
// are not stored here — the draw path binds them by constant. Extends GlLitProgram (model/normal/
// view-projection + the standard light/camera uniforms) with the full standard-block material
// uniforms. Extension uniforms remain registration-owned and are addressed through the public bind
// context rather than expanding this private base-program record.
export interface GlPbrProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locAlphaMap: WebGLUniformLocation | null;
  locBaseColor: WebGLUniformLocation | null;
  locBaseColorMap: WebGLUniformLocation | null;
  locEmissive: WebGLUniformLocation | null;
  locEmissiveMap: WebGLUniformLocation | null;
  locEmissiveStrength: WebGLUniformLocation | null;
  locMetallic: WebGLUniformLocation | null;
  locMetallicRoughnessMap: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
  locOcclusionMap: WebGLUniformLocation | null;
  locOcclusionStrength: WebGLUniformLocation | null;
  locRoughness: WebGLUniformLocation | null;
}

// The feature flags that select an uber-shader variant. Each toggles an #ifdef in the prelude and
// is hashed into the program-cache key (buildGlPbrDefineKey), so distinct flag sets compile and
// cache as distinct programs. The `has*Map` flags enable the textured paths of the standard block;
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials. Extension identity is
// appended separately from registered shader contributions, so this standard key never enumerates
// built-in or vendor extension kinds.
export interface GlPbrDefineKey {
  alphaMaskEnabled: boolean;
  hasAlphaMap: boolean;
  hasBaseColorMap: boolean;
  // Promoted post-shade color-adjustment variant, selected from draw-data presence.
  hasColorAdjustment?: boolean;
  hasColorMatrix?: boolean;
  hasEmissiveMap: boolean;
  hasInstances?: boolean;
  hasMetallicRoughnessMap: boolean;
  hasNormalMap: boolean;
  hasOcclusionMap: boolean;
  // Set by ensureGlPbrProgram from the render-state skinned-run flag, not the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  // Whether the base-color map carries a non-identity uv transform (HAS_UV_TRANSFORM); it drives the
  // shared v_uv0 every standard map samples. Set only when hasBaseColorMap is also true.
  hasUvTransform: boolean;
}
