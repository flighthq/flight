// The lighting-owned contracts. They import nothing from @flighthq/types, which re-exports the types
// and keeps structural copies of the literal constants for compatibility.

import type { EntityRaw, EntityRuntime, EntityWithoutRuntime, Kind } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { AabbLike, Vector3, Vector3Like } from '@flighthq/geometry/contract';
import type { Texture } from '@flighthq/texture/contract';

interface LightingEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export type LightUnit = 'Candela' | 'Lumen' | 'Lux' | 'Unitless';
export const CandelaLightUnit = 'Candela';
export const LumenLightUnit = 'Lumen';
export const LuxLightUnit = 'Lux';
export const UnitlessLightUnit = 'Unitless';

// Every receiver layer at once — the mask an unconfigured light carries, so a light that was never
// scoped lights the whole scene. All bits set rather than 0, because 0 is the mask that lights NOTHING
// and would turn "I did not configure this" into "this light is off" with no diagnostic.
export const ALL_LIGHT_LAYERS = -1;

// Light DATA descriptors for single-pass forward lighting. Pure data — enabled/color/intensity/
// range/cone/shadow params only; placement comes from the owning scene node's transform in a later
// pass, not from these structs. Each variant carries a `kind` discriminant (one of the exported
// *Kind strings) so a packer can switch on light type. Concrete emitting-light descriptors tag the
// stored intensity scalar with a LightUnit; Environment remains a unitless cubemap multiplier.
//
// Color is packed sRgb-albedo RGBA (0xrrggbbaa); a packed 8-bit integer cannot carry HDR, so a
// light's linear radiance is unpackColorToLinear(color) × intensity (the single sRgb->linear
// seam in @flighthq/materials). `range` is the falloff cutoff distance in world units, with -1
// meaning infinite (no attenuation cutoff) for the punctual lights that support it.
//
// Shadow params, on lights that cast: `castsShadow` opts in; `shadowBias` is normalized depth-compare
// bias; `normalBias` is a surface-normal offset whose units are defined by the concrete light;
// `pcfRadius` is the percentage-closer-filtering kernel radius in shadow-map texels; map size,
// clip range, and strength are authoring policy for render backends. Directional lights additionally
// carry normalized cascade splits.

// Open base contract for every light. The `kind` is the canonical PascalCase type name; concrete
// lights extend this with a literal `kind` and their own descriptor fields — no central union here.
export interface Light extends LightingEntity {
  kind: Kind;
}

// Any light descriptor that declares both a linear `intensity` and the photometric `intensityUnit` that
// intensity was authored in. Structural on purpose: every concrete light type carries these two fields,
// and the photometric accessors need nothing else, so they take the pair rather than a union of six
// descriptors that would have to grow with a seventh.
//
// The two fields only mean something together. `intensity` is the dimensionless multiplier the shaders
// consume; `intensityUnit` is the unit a human authored it in. Reading one without the other is what
// left the unit disconnected from the light in the first place.
export interface PhotometricLightLike {
  intensity: number;
  intensityUnit: LightUnit;
}

export interface SpotLightConeAngles {
  innerDegrees: number;
  outerDegrees: number;
}

// Uniform omnidirectional fill. No position or direction; lights every surface equally. Does
// not cast shadows.
export interface AmbientLight extends Light {
  // Packed sRGB RGBA (`0xRRGGBBAA`). Radiance is unpackColorToLinear(color) x intensity,
  // so alpha plays no part in lighting — it is carried for uniformity with every other SDK color.
  color: number;
  enabled: boolean;
  intensity: number;
  intensityUnit: LightUnit;
  kind: 'AmbientLight';
}

export const AmbientLightKind = 'AmbientLight';

export interface AmbientLightOptions {
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding AmbientLight.color. Default 0xffffffff.
  color?: number;
  enabled?: boolean;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
}

// Rectangular area light (LTC-shaded). `position` is the rectangle center, `direction` its
// facing normal, `right`/`up` its half-extent axes (length encodes half-width/half-height) in
// world space.
//
// Shadow fields are reserved intent for a future area-shadow pass. Current scene3d-gl and
// scene3d-wgpu render area lighting without shadows; setting them has no rendering effect.
export interface AreaLight extends Light {
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  // Distance falloff exponent. The inverse-square default is 2.
  decay: number;
  direction: Vector3;
  enabled: boolean;
  intensity: number;
  intensityUnit: LightUnit;
  kind: 'AreaLight';
  normalBias: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  right: Vector3;
  shadowBias: number;
  // Far clip distance, in world units, for the shadow camera.
  shadowFar: number;
  // Requested square shadow-map resolution.
  shadowMapSize: number;
  // Near clip distance, in world units, for the shadow camera.
  shadowNear: number;
  // Shadow opacity in [0, 1].
  shadowStrength: number;
  up: Vector3;
}

export const AreaLightKind = 'AreaLight';

// Shadow options are retained as future area-shadow intent only. Current scene3d-gl/scene3d-wgpu
// area lights do not consume them.
export interface AreaLightOptions {
  castsShadow?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding AreaLight.color. Default 0xffffffff.
  color?: number;
  // Distance falloff exponent. Defaults to the inverse-square value 2.
  decay?: number;
  direction?: Readonly<Vector3Like>;
  enabled?: boolean;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  // Half-extent axis along the rectangle's width; its length encodes the half-width.
  right?: Readonly<Vector3Like>;
  shadowBias?: number;
  shadowFar?: number;
  shadowMapSize?: number;
  shadowNear?: number;
  shadowStrength?: number;
  // Half-extent axis along the rectangle's height; its length encodes the half-height.
  up?: Readonly<Vector3Like>;
}

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light (normalized); surfaces are lit from -direction.
//
// One exception, and it is the document stage only: inside a `Scene3DDocumentLight` this vector is the
// canonical LOCAL -Z axis and the document light's `transform` carries the aim, per that type's placement
// convention. Anything a renderer consumes — `Scene3DLights`, `packScene3DLightBlock` — is world-space.
export interface DirectionalLight extends Light {
  // One cascade preserves the historical single directional shadow-map behavior.
  cascadeCount: number;
  // Normalized far split for each cascade; the default single cascade ends at 1.
  cascadeSplits: number[];
  // Enables the explicit directional shadow-map pass when this light is passed to it.
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  direction: Vector3;
  enabled: boolean;
  intensity: number;
  intensityUnit: LightUnit;
  kind: 'DirectionalLight';
  // Receiver offset along the geometric normal, measured in shadow-map texels. The renderer converts
  // it through the orthographic shadow projection, so a fitted map keeps the same relative bias as the
  // scene scale changes.
  normalBias: number;
  // Integer PCF kernel radius in shadow-map texels; see MAX_DIRECTIONAL_SHADOW_PCF_RADIUS.
  pcfRadius: number;
  // Receiver depth-compare offset in normalized shadow depth.
  shadowBias: number;
  // Far clip distance, in world units, for a renderer-authored shadow camera.
  shadowFar: number;
  // Requested square shadow-map resolution.
  shadowMapSize: number;
  // Near clip distance, in world units, for a renderer-authored shadow camera.
  shadowNear: number;
  // Shadow opacity in [0, 1].
  shadowStrength: number;
}

export const DirectionalLightKind = 'DirectionalLight';

// Both GPU backends allocate directional shadow maps at this square resolution. Keeping the resource
// dimension in the shared contract makes the depth pass, receiver-bias conversion, and cross-backend
// raster witnesses agree from one source of truth.
export const DIRECTIONAL_SHADOW_MAP_SIZE = 1024;

// Directional PCF uses a square (2r+1)^2 comparison kernel. Renderers truncate authored radii to an
// integer and clamp them to this cap, keeping the worst case at 25 comparisons on both GL and WGPU.
// Radius 0 is one comparison tap; radius 1 is a 3x3 kernel; radius 2 is a 5x5 kernel.
export const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS = 2;

export interface DirectionalLightOptions {
  cascadeCount?: number;
  cascadeSplits?: readonly number[];
  // Enables the explicit directional shadow-map pass when this light is passed to it.
  castsShadow?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding DirectionalLight.color. Default 0xffffffff.
  color?: number;
  direction?: Readonly<Vector3Like>;
  enabled?: boolean;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  // Receiver offset along the geometric normal in shadow-map texels. Renderers convert this through
  // the orthographic shadow projection so the relative offset follows a fitted map's scene scale.
  normalBias?: number;
  // Integer PCF kernel radius in shadow-map texels: 0 = one tap, 1 = 3x3. Renderers truncate and clamp
  // to MAX_DIRECTIONAL_SHADOW_PCF_RADIUS.
  pcfRadius?: number;
  // Receiver depth-compare offset in normalized shadow depth.
  shadowBias?: number;
  shadowFar?: number;
  shadowMapSize?: number;
  shadowNear?: number;
  shadowStrength?: number;
}

// Gradient ambient: `skyColor` from above, `groundColor` from below, blended by the surface
// normal's vertical component. Does not cast shadows.
export interface HemisphereLight extends Light {
  enabled: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), the lower hemisphere's radiance before intensity.
  groundColor: number;
  intensity: number;
  intensityUnit: LightUnit;
  kind: 'HemisphereLight';
  // Packed sRGB RGBA (`0xRRGGBBAA`), the upper hemisphere's radiance before intensity.
  skyColor: number;
}

export const HemisphereLightKind = 'HemisphereLight';

export interface HemisphereLightOptions {
  enabled?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding HemisphereLight.groundColor.
  groundColor?: number;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding HemisphereLight.skyColor.
  skyColor?: number;
}

// Omnidirectional point light. `position` is world-space; intensity falls off with distance up
// to `range` (-1 = infinite).
//
// One exception, and it is the document stage only: inside a `Scene3DDocumentLight` this sits at the local
// origin and the document light's `transform` carries the placement, per that type's placement convention.
// Anything a renderer consumes — `Scene3DLights`, `packScene3DLightBlock` — is world-space.
//
// Shadow fields are reserved intent for a future six-face cube-map shadow pass. Current scene3d-gl
// and scene3d-wgpu render point lighting without shadows; setting them has no rendering effect.
export interface PointLight extends Light {
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  // Distance falloff exponent. The inverse-square default is 2.
  decay: number;
  enabled: boolean;
  intensity: number;
  intensityUnit: LightUnit;
  // Which receiver layers this light affects, as a bitmask. A light contributes to a receiver only when
  // the two masks share a bit, so a light can be scoped to a subset of the scene without moving it. All
  // bits set (-1) is "every layer", which is what an unconfigured light means — the default must not be
  // 0, which would silently light nothing.
  layerMask: number;
  // Author's ranking override for forward-budget selection, applied BEFORE contribution strength. A
  // key light with priority 1 outranks a brighter incidental light at 0, which is the whole point:
  // contribution alone drops the light the scene is *about* when something closer is briefly brighter.
  // Equal priorities fall through to contribution, so leaving every light at 0 preserves the previous
  // pure-contribution behaviour exactly.
  priority: number;
  kind: 'PointLight';
  normalBias: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  shadowBias: number;
  // Far clip distance, in world units, for each cube face.
  shadowFar: number;
  // Requested square resolution of each of the six cube faces.
  shadowMapSize: number;
  // Near clip distance, in world units, for each cube face.
  shadowNear: number;
  // Shadow opacity in [0, 1].
  shadowStrength: number;
}

export const PointLightKind = 'PointLight';

// Shadow options are retained as future point-shadow intent only. Current scene3d-gl/scene3d-wgpu
// point lights do not consume them.
export interface PointLightOptions {
  castsShadow?: boolean;
  // Receiver layers this light affects. Default -1 (every layer).
  layerMask?: number;
  // Forward-budget ranking override, applied before contribution strength. Default 0.
  priority?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding PointLight.color. Default 0xffffffff.
  color?: number;
  // Distance falloff exponent. Defaults to the inverse-square value 2.
  decay?: number;
  enabled?: boolean;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
  shadowFar?: number;
  shadowMapSize?: number;
  shadowNear?: number;
  shadowStrength?: number;
}

// Cone-restricted point light. `position`/`direction` are world-space; the cone is described by
// the precomputed cosines of its inner and outer half-angles (innerConeCos >= outerConeCos),
// so the renderer interpolates falloff between them without a per-fragment cos(). `range` is
// the distance cutoff (-1 = infinite).
//
// Shadow fields are reserved intent for a future spot-shadow pass. Current scene3d-gl and
// scene3d-wgpu render spot lighting without shadows; setting them has no rendering effect.
export interface SpotLight extends Light {
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  // Distance falloff exponent. The inverse-square default is 2.
  decay: number;
  direction: Vector3;
  enabled: boolean;
  innerConeCos: number;
  intensity: number;
  intensityUnit: LightUnit;
  // Which receiver layers this light affects, as a bitmask. A light contributes to a receiver only when
  // the two masks share a bit, so a light can be scoped to a subset of the scene without moving it. All
  // bits set (-1) is "every layer", which is what an unconfigured light means — the default must not be
  // 0, which would silently light nothing.
  layerMask: number;
  // Author's ranking override for forward-budget selection, applied BEFORE contribution strength. A
  // key light with priority 1 outranks a brighter incidental light at 0, which is the whole point:
  // contribution alone drops the light the scene is *about* when something closer is briefly brighter.
  // Equal priorities fall through to contribution, so leaving every light at 0 preserves the previous
  // pure-contribution behaviour exactly.
  priority: number;
  kind: 'SpotLight';
  normalBias: number;
  outerConeCos: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  shadowBias: number;
  // Far clip distance, in world units, for the shadow camera.
  shadowFar: number;
  // Requested square shadow-map resolution.
  shadowMapSize: number;
  // Near clip distance, in world units, for the shadow camera.
  shadowNear: number;
  // Shadow opacity in [0, 1].
  shadowStrength: number;
  // Normalized penumbra blend authoring value in [0, 1].
  spotBlend: number;
}

export const SpotLightKind = 'SpotLight';

// Shadow options are retained as future spot-shadow intent only. Current scene3d-gl/scene3d-wgpu
// spot lights do not consume them.
export interface SpotLightOptions {
  castsShadow?: boolean;
  // Receiver layers this light affects. Default -1 (every layer).
  layerMask?: number;
  // Forward-budget ranking override, applied before contribution strength. Default 0.
  priority?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding SpotLight.color. Default 0xffffffff.
  color?: number;
  // Distance falloff exponent. Defaults to the inverse-square value 2.
  decay?: number;
  direction?: Readonly<Vector3Like>;
  enabled?: boolean;
  // Inner cone half-angle in degrees; full intensity inside it. Defaults to 0 (a sharp center).
  innerConeDegrees?: number;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  normalBias?: number;
  // Outer cone half-angle in degrees; intensity reaches zero at it. Defaults to 45.
  outerConeDegrees?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
  shadowFar?: number;
  shadowMapSize?: number;
  shadowNear?: number;
  shadowStrength?: number;
  // Normalized penumbra blend in [0, 1]. Defaults to 0.
  spotBlend?: number;
}

// Image-based environment lighting + skybox source. `environment` is the radiance cubemap used
// for the skybox and as the IBL specular/irradiance source; `intensity` scales its contribution.
export interface Environment extends Light {
  enabled: boolean;
  environment: Texture | null;
  intensity: number;
  kind: 'Environment';
}

export const EnvironmentKind = 'Environment';

export interface EnvironmentOptions {
  enabled?: boolean;
  environment?: Texture | null;
  intensity?: number;
}

// The number of floats in a probe's `shCoefficients`: 9 L2 spherical-harmonic coefficients, each an
// RGB triplet. Exported because callers allocating their own scratch buffer for `sampleLightProbeGrid`
// need the exact length, and a wrong-sized buffer is otherwise a silent partial write.
export const LIGHT_PROBE_SH_FLOATS = 27;

/**
 * One spherical-harmonic radiance sample at a point in space — the unit a probe grid interpolates
 * between. A probe stores what light arrives at its position from every direction, compressed to the
 * nine L2 SH coefficients that capture the low-frequency part of that sphere.
 *
 * `shCoefficients` is exactly `LIGHT_PROBE_SH_FLOATS` floats: nine consecutive RGB triplets, one per
 * coefficient, ordered by band — index 0 is l=0 (m=0), indices 1..3 are l=1 (m=-1,0,1), indices 4..8
 * are l=2 (m=-2..2). Within a triplet the order is R, G, B. Values are LINEAR radiance, not packed
 * sRgb: nine 8-bit colors could not carry the high dynamic range a probe exists to record, which is
 * why this is the one lighting descriptor whose color is floats rather than a packed RGBA integer.
 *
 * The coefficients are a projection of radiance. Turning them into diffuse irradiance requires a
 * cosine convolution that `evaluateLightProbeSh` does NOT apply — see that function.
 */
export interface LightProbe extends LightingEntity {
  enabled: boolean;
  position: Vector3;
  shCoefficients: Float32Array;
}

/**
 * A regular 3D lattice of probes covering an axis-aligned box — the simplest spatial structure for
 * "what light reaches this point", and what `sampleLightProbeGrid` interpolates.
 *
 * `probes` is indexed X-fastest then Y then Z: `index = x + y * resolution.x + z * resolution.x *
 * resolution.y`, and its length must equal `resolution.x * resolution.y * resolution.z`. Probes sit ON
 * the bounds, not at cell centres: along each axis the first probe is at `bounds.min` and the last at
 * `bounds.max`, so an axis with resolution 1 places its single probe at `bounds.min` and covers the
 * whole extent uniformly.
 */
export interface LightProbeGrid extends LightingEntity {
  bounds: AabbLike;
  enabled: boolean;
  probes: readonly LightProbe[];
  resolution: Vector3Like;
}

// The punctual lights selected for one object's forward-light budget. `point` and `spot` are mutable
// output arrays owned by the caller; selectScene3DForwardLights overwrites their live lengths without
// allocating. Each array independently contains at most MAX_FORWARD_LIGHTS, matching the shader's
// separate point/spot budgets. Directional, ambient, and hemisphere lights remain scene-global and
// therefore do not appear in this per-object selection.
export interface Scene3DForwardLightSelection {
  // Contribution-ranked family-local input indices used as a stable deduplication key. Point indices
  // are non-negative; spot indices use their bitwise complement (negative), preventing cross-family
  // collisions without object hashing.
  indices: number[];
  point: Readonly<PointLight>[];
  spot: Readonly<SpotLight>[];
}

// Plain diagnostic data explaining whether a scene's punctual-light arrays need an explicit
// per-object forward-light selection pass before a draw. Both 3D backends report the same lighting
// fact, so the contract lives beside the selection it describes rather than in either backend.
export interface Scene3DForwardLightSelectionExplanation {
  pointLightCount: number;
  reason: 'selection-prepared' | 'selection-required' | 'within-budget';
  selectionPrepared: boolean;
  spotLightCount: number;
}

// The set of light DATA descriptors passed to one drawScene3D call as a draw-argument (lights are
// not scene members: `scene` = what exists, `camera`/`lights` = what we render now). It carries at
// most one directional + one ambient term (either null when absent) plus arrays of point, spot, and
// hemisphere lights. prepareScene3DRender resolves this into the packed Scene3DLightBlock (sRgb->linear
// at pack time), packing at most MAX_FORWARD_LIGHTS of each punctual type and dropping any excess.
//
// The punctual arrays are optional: an omitted array reads as none, so a caller with only a sun +
// ambient writes just those two fields. (The single directional/ambient stay required-nullable —
// "one or none"; the arrays are "zero or more", hence optional-empty rather than nullable.)
export interface Scene3DLights extends LightingEntity {
  ambient: Readonly<AmbientLight> | null;
  directional: Readonly<DirectionalLight> | null;
  hemisphere?: readonly Readonly<HemisphereLight>[];
  point?: readonly Readonly<PointLight>[];
  spot?: readonly Readonly<SpotLight>[];
}

// Structural input accepted by light packing/draw operations. The createScene3DLights product itself is
// Entity-backed; callers that already own a plain descriptor can still pass it as input without
// manufacturing identity solely for one draw.
export type Scene3DLightsLike = EntityWithoutRuntime<Scene3DLights>;

// The packed, GPU-ready lighting environment for one drawScene3D call. prepareScene3DRender resolves
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
export interface Scene3DLightBlock {
  ambientCount: number;
  data: Float32Array<ArrayBuffer>;
  directionalCount: number;
  hemisphereCount: number;
  pointCount: number;
  spotCount: number;
  version: number;
}

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
