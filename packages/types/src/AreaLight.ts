import type { Light } from './Light';
import type { LightUnit } from './LightUnit';
import type { Vector3 } from './Vector3';

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
