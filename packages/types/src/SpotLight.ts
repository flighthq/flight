import type { Light } from './Light';
import type { LightUnit } from './LightUnit';
import type { Vector3 } from './Vector3';

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
