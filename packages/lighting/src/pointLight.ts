import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { cloneVector3, createVector3 } from '@flighthq/geometry/contract';
import type { PointLight, PointLightOptions } from '@flighthq/types/contract';
import { PointLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of a point light's data, including a fresh `position` vector.
export function clonePointLight(source: Readonly<PointLight>): PointLight {
  const out = allocateEntity<PointLight>();
  out.castsShadow = source.castsShadow;
  out.color = source.color;
  out.decay = source.decay;
  out.enabled = source.enabled;
  out.intensity = source.intensity;
  out.intensityUnit = source.intensityUnit;
  out.kind = PointLightKind;
  out.normalBias = source.normalBias;
  out.pcfRadius = source.pcfRadius;
  out.position = cloneVector3(source.position);
  out.range = source.range;
  out.shadowBias = source.shadowBias;
  out.shadowFar = source.shadowFar;
  out.shadowMapSize = source.shadowMapSize;
  out.shadowNear = source.shadowNear;
  out.shadowStrength = source.shadowStrength;
  return finishEntity(out);
}

// Omnidirectional point light. `position` is world-space; intensity falls off with distance up
// to `range` (-1 = infinite). Color is packed sRgb-albedo RGBA (0xrrggbbaa); defaults to opaque
// white at unit intensity, at the origin, infinite range, shadows off.
export function createPointLight(options?: Readonly<PointLightOptions>): PointLight {
  const position = options?.position;
  const out = allocateEntity<PointLight>();
  out.castsShadow = options?.castsShadow ?? false;
  out.color = options?.color ?? 0xffffffff;
  out.decay = options?.decay ?? 2;
  out.enabled = options?.enabled ?? true;
  out.intensity = options?.intensity ?? 1;
  out.intensityUnit = options?.intensityUnit ?? UnitlessLightUnit;
  out.kind = PointLightKind;
  out.normalBias = options?.normalBias ?? 0;
  out.pcfRadius = options?.pcfRadius ?? 0;
  out.position = position ? cloneVector3(position) : createVector3(0, 0, 0);
  out.range = options?.range ?? -1;
  out.shadowBias = options?.shadowBias ?? 0;
  out.shadowFar = options?.shadowFar ?? 500;
  out.shadowMapSize = options?.shadowMapSize ?? 1024;
  out.shadowNear = options?.shadowNear ?? 0.5;
  out.shadowStrength = options?.shadowStrength ?? 1;
  return finishEntity(out);
}
