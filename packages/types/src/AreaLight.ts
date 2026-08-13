import type { Light } from './Light';
import type { Vector3 } from './Vector3';

// Rectangular area light (LTC-shaded). `position` is the rectangle center, `direction` its
// facing normal, `right`/`up` its half-extent axes (length encodes half-width/half-height) in
// world space.
//
// Shadow fields are reserved intent for a future area-shadow pass. Current scene3d-gl and
// scene3d-wgpu render area lighting without shadows; setting those four fields has no rendering effect.
export interface AreaLight extends Light {
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  direction: Vector3;
  intensity: number;
  kind: 'AreaLight';
  normalBias: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  right: Vector3;
  shadowBias: number;
  up: Vector3;
}

export const AreaLightKind = 'AreaLight';
