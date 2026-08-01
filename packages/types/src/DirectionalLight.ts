import type { Light } from './Light';
import type { Vector3 } from './Vector3';

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light (normalized); surfaces are lit from -direction.
//
// One exception, and it is the document stage only: inside a `Scene3DDocumentLight` this vector is the
// canonical LOCAL -Z axis and the document light's `transform` carries the aim, per that type's placement
// convention. Anything a renderer consumes — `Scene3DLights`, `packScene3DLightBlock` — is world-space.
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
