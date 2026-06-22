import type { Light } from './Light';
import type { Vector3 } from './Vector3';

// Omnidirectional point light. `position` is world-space; intensity falls off with distance up
// to `range` (-1 = infinite).
export interface PointLight extends Light {
  castsShadow: boolean;
  color: number;
  intensity: number;
  kind: 'PointLight';
  normalBias: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  shadowBias: number;
}

export const PointLightKind = 'PointLight';
