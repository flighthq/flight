// Owned by `@flighthq/lighting`. These deprecated re-exports keep existing `@flighthq/types` imports
// compiling until consumers import the owning package.

/** @deprecated Import from `@flighthq/lighting/contract`. */
export type { Scene3DLightBlock } from '@flighthq/lighting/contract';

// Deprecated structural copies of lighting's literal constants (core may cross into an owner only
// with type-only edges); the values are identical literals.
// The forward-lighting cap: the maximum number of each punctual light type (point/spot/hemisphere)
// a single drawScene3D applies in one pass. A spec constant, NOT an inlined literal: it sizes both the
// Scene3DLightBlock.data layout below (CPU packer) AND the shader's `#define MAX_FORWARD_LIGHTS` + fixed
// uniform-array declarations, which must agree byte-for-byte. Excess lights beyond the cap are
// dropped at pack time. Clustered Forward+ (a later phase) raises the effective count behind the same
// constant. Four each is a deliberate forward-renderer budget; grow here and both sides follow.
export const MAX_FORWARD_LIGHTS = 4;

// std140 float offsets/strides within Scene3DLightBlock.data. Each record is vec4-aligned (4-float
// lanes). The CPU packer (packScene3DLightBlock) and every backend shader/binder read the same layout
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

// Total float length of a Scene3DLightBlock.data buffer sized for MAX_FORWARD_LIGHTS of every type.
export const SCENE_LIGHT_BLOCK_FLOATS =
  SCENE_LIGHT_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;
