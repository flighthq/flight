import { createEntity } from '@flighthq/entity';
import { cloneVector3, createVector3 } from '@flighthq/geometry';
import type { PointLight, Vector3Like } from '@flighthq/types';
import { PointLightKind } from '@flighthq/types';

export interface PointLightOptions {
  castsShadow?: boolean;
  color?: number;
  intensity?: number;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
}

// Independent copy of a point light's data, including a fresh `position` vector.
export function clonePointLight(source: Readonly<PointLight>): PointLight {
  return createEntity({
    castsShadow: source.castsShadow,
    color: source.color,
    intensity: source.intensity,
    kind: PointLightKind,
    normalBias: source.normalBias,
    pcfRadius: source.pcfRadius,
    position: cloneVector3(source.position),
    range: source.range,
    shadowBias: source.shadowBias,
  });
}

// Omnidirectional point light. `position` is world-space; intensity falls off with distance up
// to `range` (-1 = infinite). Color is packed sRgb-albedo RGBA (0xrrggbbaa); defaults to opaque
// white at unit intensity, at the origin, infinite range, shadows off.
export function createPointLight(options?: Readonly<PointLightOptions>): PointLight {
  const position = options?.position;
  return createEntity({
    castsShadow: options?.castsShadow ?? false,
    color: options?.color ?? 0xffffffff,
    intensity: options?.intensity ?? 1,
    kind: PointLightKind,
    normalBias: options?.normalBias ?? 0,
    pcfRadius: options?.pcfRadius ?? 0,
    position: position ? cloneVector3(position) : createVector3(0, 0, 0),
    range: options?.range ?? -1,
    shadowBias: options?.shadowBias ?? 0,
  });
}
