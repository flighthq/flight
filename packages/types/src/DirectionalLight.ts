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

// Directional PCF uses a square (2r+1)^2 comparison kernel. Renderers truncate authored radii to an
// integer and clamp them to this cap, keeping the per-fragment cost bounded and identical on GL/WGPU.
// Radius 0 is one comparison tap; radius 1 is a 3x3 kernel.
export const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS = 4;
