// The packed, GPU-ready lighting environment for one drawScene call. prepareSceneRender resolves
// the scene's light DATA descriptors (DirectionalLight/AmbientLight/...) into this flat block once
// per frame; every GlMeshMaterialRenderer/WgpuMeshMaterialRenderer then binds the same block as the
// shared light uniform. Pure CPU-side data — no GPU handles — so it is backend-agnostic; each
// backend uploads `data` into its own uniform/storage buffer.
//
// `data` is a tightly-packed float layout matching the shader's std140/std430 light block (radiance
// is linear, premultiplied: unpackColorToLinear(color) * intensity, packed at pack time so the
// shader never sees sRgb). This proving slice carries exactly one directional + one ambient term;
// `directionalCount` is 0 or 1 and `ambientCount` is 0 or 1 so a shader can branch on presence. The
// layout grows to MAX_FORWARD_LIGHTS punctual lights (point/spot) behind feature defines in later
// passes without changing this type's shape — only `data`'s length and the counts.
//
// `version` bumps whenever `data` or the counts change so a backend can skip re-uploading an
// unchanged block across frames.
export interface SceneLightBlock {
  ambientCount: number;
  data: Float32Array<ArrayBuffer>;
  directionalCount: number;
  // Punctual/area light counts. Zero until the forward punctual-light passes wire them; renderers
  // zero-fill them today so the block shape stays stable as lighting grows to MAX_FORWARD_LIGHTS.
  hemisphereCount: number;
  pointCount: number;
  spotCount: number;
  version: number;
}
