import type { GlLitProgram } from './GlLitProgram';

// A compiled PBR uber-shader variant plus its resolved uniform locations. One of these exists per
// distinct GlPbrDefineKey (maps-present / alpha-mask + extension-lobe combination), built once and
// cached on the GlRenderState (see ensureGlPbrProgram). The vertex attribute locations are fixed by
// the shader's `layout(location = …)` qualifiers (0 position, 1 normal, 2 tangent, 3 uv0), so they
// are not stored here — the draw path binds them by constant. Extends GlLitProgram (model/normal/
// view-projection + the standard light/camera uniforms) with the full standard-block material
// uniforms plus the extension-lobe uniforms (each resolves to null in variants that omit its
// define, which is harmless — its renderer only runs when the define is set).
export interface GlPbrProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locAnisotropyRotation: WebGLUniformLocation | null;
  locAnisotropyStrength: WebGLUniformLocation | null;
  locAttenuationColor: WebGLUniformLocation | null;
  locBaseColor: WebGLUniformLocation | null;
  locBaseColorMap: WebGLUniformLocation | null;
  locClearcoat: WebGLUniformLocation | null;
  locClearcoatRoughness: WebGLUniformLocation | null;
  locEmissive: WebGLUniformLocation | null;
  locEmissiveMap: WebGLUniformLocation | null;
  locEmissiveStrength: WebGLUniformLocation | null;
  locIridescence: WebGLUniformLocation | null;
  locIridescenceIor: WebGLUniformLocation | null;
  locIridescenceThickness: WebGLUniformLocation | null;
  locMetallic: WebGLUniformLocation | null;
  locMetallicRoughnessMap: WebGLUniformLocation | null;
  locNormalMap: WebGLUniformLocation | null;
  locNormalScale: WebGLUniformLocation | null;
  locOcclusionMap: WebGLUniformLocation | null;
  locOcclusionStrength: WebGLUniformLocation | null;
  locRoughness: WebGLUniformLocation | null;
  locSheenColor: WebGLUniformLocation | null;
  locSheenRoughness: WebGLUniformLocation | null;
  locSpecular: WebGLUniformLocation | null;
  locSpecularColor: WebGLUniformLocation | null;
  locSubsurface: WebGLUniformLocation | null;
  locSubsurfaceColor: WebGLUniformLocation | null;
  locThickness: WebGLUniformLocation | null;
  locTransmission: WebGLUniformLocation | null;
}

// The feature flags that select an uber-shader variant. Each toggles an #ifdef in the prelude and
// is hashed into the program-cache key (buildGlPbrDefineKey), so distinct flag sets compile and
// cache as distinct programs. The `has*Map` flags enable the textured paths of the standard block;
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials. The extension flags
// (`clearcoatEnabled` … `transmissionEnabled`) each enable one extension lobe; an extension
// renderer sets exactly one. Map flags inside an extension's own textures are not part of the key
// today — extension maps are bound when present and the lobe reads a uniform fallback otherwise.
export interface GlPbrDefineKey {
  alphaMaskEnabled: boolean;
  anisotropyEnabled: boolean;
  clearcoatEnabled: boolean;
  hasBaseColorMap: boolean;
  hasEmissiveMap: boolean;
  hasMetallicRoughnessMap: boolean;
  hasNormalMap: boolean;
  hasOcclusionMap: boolean;
  // Set by ensureGlPbrProgram from the render-state skinned-run flag, not the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  // Whether the base-color map carries a non-identity uv transform (HAS_UV_TRANSFORM); it drives the
  // shared v_uv0 every standard map samples. Set only when hasBaseColorMap is also true.
  hasUvTransform: boolean;
  iridescenceEnabled: boolean;
  sheenEnabled: boolean;
  specularEnabled: boolean;
  subsurfaceEnabled: boolean;
  transmissionEnabled: boolean;
}
