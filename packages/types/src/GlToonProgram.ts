import type { GlLitProgram } from './GlLitProgram';

// The feature flags that select a Toon uber-shader variant. Each toggles an #ifdef in the prelude
// and is hashed into the program-cache key (buildGlToonDefineKey), so distinct flag sets compile and
// cache as distinct programs. `hasBaseColorMap` enables the sampled albedo tint; `hasRamp` switches
// the quantizer from stepped floor to a 1D ramp lookup; `alphaMaskEnabled` enables the alpha-cutoff
// discard for 'mask' materials.
export interface GlToonDefineKey {
  alphaMaskEnabled: boolean;
  hasBaseColorMap: boolean;
  hasRamp: boolean;
  // Set by ensureGlToonProgram from the render-state skinned-run flag, not the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  // Whether the base-color map carries a non-identity uv transform (HAS_UV_TRANSFORM). Set only when
  // hasBaseColorMap is also true, since the transform applies to the sampled albedo tint.
  hasUvTransform: boolean;
}

// A compiled Toon uber-shader variant plus its resolved uniform locations. One exists per distinct
// GlToonDefineKey, cached on the GlRenderState under the `toon:` program-cache namespace. Extends
// GlLitProgram (model/normal/view-projection + the standard light/camera uniforms) with the Toon
// material uniforms. Vertex attribute locations are fixed by the shader's `layout(location = …)`
// qualifiers (0 position, 1 normal, 3 uv0), so they are not stored here.
export interface GlToonProgram extends GlLitProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locBaseColor: WebGLUniformLocation | null;
  locBaseColorMap: WebGLUniformLocation | null;
  locRamp: WebGLUniformLocation | null;
  locSteps: WebGLUniformLocation | null;
}
