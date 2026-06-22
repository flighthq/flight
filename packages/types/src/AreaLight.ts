import type { Light } from './Light';
import type { Vector3 } from './Vector3';

// Rectangular area light (LTC-shaded). `position` is the rectangle center, `direction` its
// facing normal, `right`/`up` its half-extent axes (length encodes half-width/half-height) in
// world space.
export interface AreaLight extends Light {
  castsShadow: boolean;
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
