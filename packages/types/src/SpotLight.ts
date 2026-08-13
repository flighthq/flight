import type { Light } from './Light';
import type { Vector3 } from './Vector3';

// Cone-restricted point light. `position`/`direction` are world-space; the cone is described by
// the precomputed cosines of its inner and outer half-angles (innerConeCos >= outerConeCos),
// so the renderer interpolates falloff between them without a per-fragment cos(). `range` is
// the distance cutoff (-1 = infinite).
//
// Shadow fields are reserved intent for a future spot-shadow pass. Current scene3d-gl and
// scene3d-wgpu render spot lighting without shadows; setting those four fields has no rendering effect.
export interface SpotLight extends Light {
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  direction: Vector3;
  innerConeCos: number;
  intensity: number;
  kind: 'SpotLight';
  normalBias: number;
  outerConeCos: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  shadowBias: number;
}

export const SpotLightKind = 'SpotLight';
