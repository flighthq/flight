import type { GlMeshProgram } from './GlMeshProgram';

// The feature flags that select an unlit variant. `vertexColor` reads the mesh's color0 attribute and
// multiplies it in (the VertexColor material); `hasColorMap` enables the sampled base/emissive map;
// `alphaMaskEnabled` enables the alpha-cutoff discard for 'mask' materials.
export interface GlUnlitDefineKey {
  alphaMaskEnabled: boolean;
  hasColorMap: boolean;
  // Whether this variant deforms the vertex by a bone palette (HAS_SKIN). Set by ensureGlUnlitProgram
  // from the render-state skinned-run flag, not the material renderer — skinning keys off geometry.
  hasSkin?: boolean;
  // Whether the color map carries a non-identity uv transform (HAS_UV_TRANSFORM). Set only when
  // hasColorMap is also true, since the transform applies to the sampled map's coordinates.
  hasUvTransform: boolean;
  vertexColor: boolean;
}

// A compiled unlit variant plus its resolved uniform locations. Extends GlMeshProgram with the unlit
// fragment uniforms; `locNormalMatrix` is null (unlit has no normals). One exists per distinct
// GlUnlitDefineKey, cached on the GlRenderState under the `unlit:` program-cache namespace.
export interface GlUnlitProgram extends GlMeshProgram {
  locAlphaCutoff: WebGLUniformLocation | null;
  locColor: WebGLUniformLocation | null;
  locColorMap: WebGLUniformLocation | null;
  locIntensity: WebGLUniformLocation | null;
}
