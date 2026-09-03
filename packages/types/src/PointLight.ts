import type { Light } from './Light';
import type { LightUnit } from './LightUnit';
import type { Vector3 } from './Vector3';

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
