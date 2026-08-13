import type { Light } from './Light';
import type { Vector3 } from './Vector3';

// Omnidirectional point light. `position` is world-space; intensity falls off with distance up
// to `range` (-1 = infinite).
//
// One exception, and it is the document stage only: inside a `Scene3DDocumentLight` this sits at the local
// origin and the document light's `transform` carries the placement, per that type's placement convention.
// Anything a renderer consumes — `Scene3DLights`, `packScene3DLightBlock` — is world-space.
//
// Shadow fields are reserved intent for a future cube-map shadow pass. Current scene3d-gl and
// scene3d-wgpu render point lighting without shadows; setting those four fields has no rendering effect.
export interface PointLight extends Light {
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
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
