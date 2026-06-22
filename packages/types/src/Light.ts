import type { CubeTexture } from './CubeTexture';
import type { Entity } from './Entity';
import type { Vector3 } from './Vector3';

// Light DATA descriptors for single-pass forward lighting. Pure data — color/intensity/range/
// cone/shadow params only; placement comes from the owning scene node's transform in a later
// pass, not from these structs. Each carries a `kind` discriminant (one of the exported *Kind
// symbols) so a packer can switch on light type.
//
// Color is packed sRgb-albedo RGBA (0xrrggbbaa); a packed 8-bit integer cannot carry HDR, so a
// light's linear radiance is unpackColorToLinear(color) × intensity (the single sRgb->linear
// seam in @flighthq/materials). `range` is the falloff cutoff distance in world units, with -1
// meaning infinite (no attenuation cutoff) for the punctual lights that support it.
//
// Shadow params, on lights that cast: `castsShadow` opts in; `shadowBias` (depth-compare bias)
// and `normalBias` (surface-offset along the normal) fight shadow acne / peter-panning;
// `pcfRadius` is the percentage-closer-filtering kernel radius in shadow-map texels.

// Uniform omnidirectional fill. No position or direction; lights every surface equally. Does
// not cast shadows.
export interface AmbientLight extends Entity {
  color: number;
  intensity: number;
  kind: symbol;
}

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light (normalized); surfaces are lit from -direction.
export interface DirectionalLight extends Entity {
  castsShadow: boolean;
  color: number;
  direction: Vector3;
  intensity: number;
  kind: symbol;
  normalBias: number;
  pcfRadius: number;
  shadowBias: number;
}

// Omnidirectional point light. `position` is world-space; intensity falls off with distance up
// to `range` (-1 = infinite).
export interface PointLight extends Entity {
  castsShadow: boolean;
  color: number;
  intensity: number;
  kind: symbol;
  normalBias: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  shadowBias: number;
}

// Cone-restricted point light. `position`/`direction` are world-space; the cone is described by
// the precomputed cosines of its inner and outer half-angles (innerConeCos >= outerConeCos),
// so the renderer interpolates falloff between them without a per-fragment cos(). `range` is
// the distance cutoff (-1 = infinite).
export interface SpotLight extends Entity {
  castsShadow: boolean;
  color: number;
  direction: Vector3;
  innerConeCos: number;
  intensity: number;
  kind: symbol;
  normalBias: number;
  outerConeCos: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  shadowBias: number;
}

// Gradient ambient: `skyColor` from above, `groundColor` from below, blended by the surface
// normal's vertical component. Does not cast shadows.
export interface HemisphereLight extends Entity {
  groundColor: number;
  intensity: number;
  kind: symbol;
  skyColor: number;
}

// Rectangular area light (LTC-shaded). `position` is the rectangle center, `direction` its
// facing normal, `right`/`up` its half-extent axes (length encodes half-width/half-height) in
// world space.
export interface AreaLight extends Entity {
  castsShadow: boolean;
  color: number;
  direction: Vector3;
  intensity: number;
  kind: symbol;
  normalBias: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  right: Vector3;
  shadowBias: number;
  up: Vector3;
}

// Image-based environment lighting + skybox source. `environment` is the radiance cubemap used
// for the skybox and as the IBL specular/irradiance source; `intensity` scales its contribution.
export interface Environment extends Entity {
  environment: CubeTexture | null;
  intensity: number;
  kind: symbol;
}

export const AmbientLightKind: unique symbol = Symbol('AmbientLight');

export const AreaLightKind: unique symbol = Symbol('AreaLight');

export const DirectionalLightKind: unique symbol = Symbol('DirectionalLight');

export const EnvironmentKind: unique symbol = Symbol('Environment');

export const HemisphereLightKind: unique symbol = Symbol('HemisphereLight');

export const PointLightKind: unique symbol = Symbol('PointLight');

export const SpotLightKind: unique symbol = Symbol('SpotLight');
