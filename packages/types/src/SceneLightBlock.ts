// The packed, GPU-ready lighting environment for one drawScene call. prepareSceneRender resolves
// the scene's light DATA descriptors (DirectionalLight/AmbientLight/...) into this flat block once
// per frame; every GlMeshMaterialRenderer/WgpuMeshMaterialRenderer then binds the same block as the
// shared light uniform. Pure CPU-side data — no GPU handles — so it is backend-agnostic; each
// backend uploads `data` into its own uniform/storage buffer.
//
// `data` is a tightly-packed float layout matching the shader's std140/std430 light block (radiance
// is linear, premultiplied: unpackColorToLinear(color) * intensity, packed at pack time so the
// shader never sees sRgb). It carries one directional + one ambient term at the head, then fixed-
// stride arrays of up to MAX_FORWARD_LIGHTS point, spot, and hemisphere lights (see the SCENE_LIGHT_*
// offset/stride constants below). `directionalCount`/`ambientCount` are 0 or 1; `pointCount`/
// `spotCount`/`hemisphereCount` range 0..MAX_FORWARD_LIGHTS, so a shader can loop each array by count.
//
// `version` bumps whenever `data` or the counts change so a backend can skip re-uploading an
// unchanged block across frames.
export interface SceneLightBlock {
  ambientCount: number;
  data: Float32Array<ArrayBuffer>;
  directionalCount: number;
  hemisphereCount: number;
  pointCount: number;
  spotCount: number;
  version: number;
}

// The forward-lighting cap: the maximum number of each punctual light type (point/spot/hemisphere)
// a single drawScene applies in one pass. A spec constant, NOT an inlined literal: it sizes both the
// SceneLightBlock.data layout below (CPU packer) AND the shader's `#define MAX_FORWARD_LIGHTS` + fixed
// uniform-array declarations, which must agree byte-for-byte. Excess lights beyond the cap are
// dropped at pack time. Clustered Forward+ (a later phase) raises the effective count behind the same
// constant. Four each is a deliberate forward-renderer budget; grow here and both sides follow.
export const MAX_FORWARD_LIGHTS = 4;

// std140 float offsets/strides within SceneLightBlock.data. Each record is vec4-aligned (4-float
// lanes). The CPU packer (packSceneLightBlock) and every backend shader/binder read the same layout
// from these constants so the two never drift. Head block (directional + ambient) = 12 floats:
//   directional { direction.xyz @0, _pad, radiance.rgb @4, _pad }  (8 floats)
//   ambient     { radiance.rgb @8, _pad }                          (4 floats)
export const SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET = 0;
export const SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET = 4;
export const SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET = 8;
export const SCENE_LIGHT_HEAD_FLOATS = 12;

// point[i]: { position.xyz, range }, { radiance.rgb, invSqrRange } — 2 vec4 = 8 floats. `invSqrRange`
// is 1/range^2 (0 for infinite range) driving the smooth inverse-square range cutoff in the shader.
export const SCENE_LIGHT_POINT_OFFSET = SCENE_LIGHT_HEAD_FLOATS;
export const SCENE_LIGHT_POINT_STRIDE = 8;

// spot[i]: point's two vec4 + { direction.xyz, _pad } + { cosInner, cosOuter, _pad, _pad } — 4 vec4
// = 16 floats. The cone falloff smoothsteps between the precomputed inner/outer cosines.
export const SCENE_LIGHT_SPOT_OFFSET = SCENE_LIGHT_POINT_OFFSET + SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
export const SCENE_LIGHT_SPOT_STRIDE = 16;

// hemisphere[i]: { skyRadiance.rgb, _pad }, { groundRadiance.rgb, _pad }, { up.xyz, _pad } — 3 vec4
// = 12 floats. `up` is packed world-up (0,1,0); the shader blends sky/ground by dot(normal, up).
export const SCENE_LIGHT_HEMISPHERE_OFFSET = SCENE_LIGHT_SPOT_OFFSET + SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
export const SCENE_LIGHT_HEMISPHERE_STRIDE = 12;

// Total float length of a SceneLightBlock.data buffer sized for MAX_FORWARD_LIGHTS of every type.
export const SCENE_LIGHT_BLOCK_FLOATS =
  SCENE_LIGHT_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;
