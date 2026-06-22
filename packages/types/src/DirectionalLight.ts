import type { Light } from './Light';
import type { Vector3 } from './Vector3';

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light (normalized); surfaces are lit from -direction.
export interface DirectionalLight extends Light {
  castsShadow: boolean;
  color: number;
  direction: Vector3;
  intensity: number;
  kind: 'DirectionalLight';
  normalBias: number;
  pcfRadius: number;
  shadowBias: number;
}

export const DirectionalLightKind = 'DirectionalLight';
