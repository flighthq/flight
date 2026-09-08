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
  // Which receiver layers this light affects, as a bitmask. A light contributes to a receiver only when
  // the two masks share a bit, so a light can be scoped to a subset of the scene without moving it. All
  // bits set (-1) is "every layer", which is what an unconfigured light means — the default must not be
  // 0, which would silently light nothing.
  layerMask: number;
  // Author's ranking override for forward-budget selection, applied BEFORE contribution strength. A
  // key light with priority 1 outranks a brighter incidental light at 0, which is the whole point:
  // contribution alone drops the light the scene is *about* when something closer is briefly brighter.
  // Equal priorities fall through to contribution, so leaving every light at 0 preserves the previous
  // pure-contribution behaviour exactly.
  priority: number;
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
