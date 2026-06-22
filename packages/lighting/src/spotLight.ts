import { createEntity } from '@flighthq/entity';
import { cloneVector3, createVector3 } from '@flighthq/geometry';
import type { SpotLight, Vector3Like } from '@flighthq/types';
import { SpotLightKind } from '@flighthq/types';

export interface SpotLightOptions {
  castsShadow?: boolean;
  color?: number;
  direction?: Readonly<Vector3Like>;
  // Inner cone half-angle in degrees; full intensity inside it. Defaults to 0 (a sharp center).
  innerConeDegrees?: number;
  intensity?: number;
  normalBias?: number;
  // Outer cone half-angle in degrees; intensity reaches zero at it. Defaults to 45.
  outerConeDegrees?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
}

// Independent copy of a spot light's data, including fresh `position`/`direction` vectors.
export function cloneSpotLight(source: Readonly<SpotLight>): SpotLight {
  return createEntity({
    castsShadow: source.castsShadow,
    color: source.color,
    direction: cloneVector3(source.direction),
    innerConeCos: source.innerConeCos,
    intensity: source.intensity,
    kind: SpotLightKind,
    normalBias: source.normalBias,
    outerConeCos: source.outerConeCos,
    pcfRadius: source.pcfRadius,
    position: cloneVector3(source.position),
    range: source.range,
    shadowBias: source.shadowBias,
  });
}

// Cone-restricted point light. `position`/`direction` are world-space; the cone is stored as the
// precomputed cosines of its inner and outer half-angles (innerConeCos >= outerConeCos). Color is
// packed sRgb-albedo RGBA (0xrrggbbaa); defaults to opaque white at unit intensity, at the origin
// facing down (0, -1, 0), 0-degree inner / 45-degree outer cone, infinite range, shadows off.
export function createSpotLight(options?: Readonly<SpotLightOptions>): SpotLight {
  const position = options?.position;
  const direction = options?.direction;
  const light: SpotLight = createEntity({
    castsShadow: options?.castsShadow ?? false,
    color: options?.color ?? 0xffffffff,
    direction: direction ? cloneVector3(direction) : createVector3(0, -1, 0),
    innerConeCos: 1,
    intensity: options?.intensity ?? 1,
    kind: SpotLightKind,
    normalBias: options?.normalBias ?? 0,
    outerConeCos: 1,
    pcfRadius: options?.pcfRadius ?? 0,
    position: position ? cloneVector3(position) : createVector3(0, 0, 0),
    range: options?.range ?? -1,
    shadowBias: options?.shadowBias ?? 0,
  });
  setSpotLightCone(light, options?.innerConeDegrees ?? 0, options?.outerConeDegrees ?? 45);
  return light;
}

// Writes the precomputed cone cosines from inner/outer half-angles given in degrees. A larger
// half-angle yields a smaller cosine, so the stored invariant innerConeCos >= outerConeCos holds
// exactly when innerDegrees <= outerDegrees; callers are responsible for ordering their inputs.
export function setSpotLightCone(out: SpotLight, innerDegrees: number, outerDegrees: number): void {
  out.innerConeCos = Math.cos((innerDegrees * Math.PI) / 180);
  out.outerConeCos = Math.cos((outerDegrees * Math.PI) / 180);
}
