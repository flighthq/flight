import type { Light } from './Light';
import type { LightUnit } from './LightUnit';
import type { Vector3 } from './Vector3';

// Cone-restricted point light. `position`/`direction` are world-space; the cone is described by
// the precomputed cosines of its inner and outer half-angles (innerConeCos >= outerConeCos),
// so the renderer interpolates falloff between them without a per-fragment cos(). `range` is
// the distance cutoff (-1 = infinite).
//
// Shadow fields are reserved intent for a future spot-shadow pass. Current scene3d-gl and
// scene3d-wgpu render spot lighting without shadows; setting them has no rendering effect.
export interface SpotLight extends Light {
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  // Distance falloff exponent. The inverse-square default is 2.
  decay: number;
  direction: Vector3;
  enabled: boolean;
  innerConeCos: number;
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
  kind: 'SpotLight';
  normalBias: number;
  outerConeCos: number;
  pcfRadius: number;
  position: Vector3;
  range: number;
  shadowBias: number;
  // Far clip distance, in world units, for the shadow camera.
  shadowFar: number;
  // Requested square shadow-map resolution.
  shadowMapSize: number;
  // Near clip distance, in world units, for the shadow camera.
  shadowNear: number;
  // Shadow opacity in [0, 1].
  shadowStrength: number;
  // Normalized penumbra blend authoring value in [0, 1].
  spotBlend: number;
}

export const SpotLightKind = 'SpotLight';
