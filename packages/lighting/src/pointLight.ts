import { createEntity } from '@flighthq/entity/contract';
import { cloneVector3, createVector3 } from '@flighthq/geometry/contract';
import type { PointLight, PointLightOptions } from '@flighthq/types/contract';
import { PointLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of a point light's data, including a fresh `position` vector.
export function clonePointLight(source: Readonly<PointLight>): PointLight {
  return createEntity({
    castsShadow: source.castsShadow,
    color: source.color,
    decay: source.decay,
    enabled: source.enabled,
    intensity: source.intensity,
    intensityUnit: source.intensityUnit,
    kind: PointLightKind,
    normalBias: source.normalBias,
    pcfRadius: source.pcfRadius,
    position: cloneVector3(source.position),
    range: source.range,
    shadowBias: source.shadowBias,
    shadowFar: source.shadowFar,
    shadowMapSize: source.shadowMapSize,
    shadowNear: source.shadowNear,
    shadowStrength: source.shadowStrength,
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
    decay: options?.decay ?? 2,
    enabled: options?.enabled ?? true,
    intensity: options?.intensity ?? 1,
    intensityUnit: options?.intensityUnit ?? UnitlessLightUnit,
    kind: PointLightKind,
    normalBias: options?.normalBias ?? 0,
    pcfRadius: options?.pcfRadius ?? 0,
    position: position ? cloneVector3(position) : createVector3(0, 0, 0),
    range: options?.range ?? -1,
    shadowBias: options?.shadowBias ?? 0,
    shadowFar: options?.shadowFar ?? 500,
    shadowMapSize: options?.shadowMapSize ?? 1024,
    shadowNear: options?.shadowNear ?? 0.5,
    shadowStrength: options?.shadowStrength ?? 1,
  });
}
