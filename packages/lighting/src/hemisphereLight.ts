import { createEntity } from '@flighthq/entity/contract';
import type { HemisphereLight, HemisphereLightOptions } from '@flighthq/types/contract';
import { HemisphereLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of a hemisphere light's data. The `kind` discriminant is carried over.
export function cloneHemisphereLight(source: Readonly<HemisphereLight>): HemisphereLight {
  return createHemisphereLight({
    enabled: source.enabled,
    groundColor: source.groundColor,
    intensity: source.intensity,
    intensityUnit: source.intensityUnit,
    skyColor: source.skyColor,
  });
}

// Gradient ambient: `skyColor` from above, `groundColor` from below, blended by the surface
// normal's vertical component. Colors are packed sRgb-albedo RGBA (0xrrggbbaa); both default to
// opaque white at unit intensity. Hemisphere lights do not cast shadows.
export function createHemisphereLight(options?: Readonly<HemisphereLightOptions>): HemisphereLight {
  return createEntity({
    enabled: options?.enabled ?? true,
    groundColor: options?.groundColor ?? 0xffffffff,
    intensity: options?.intensity ?? 1,
    intensityUnit: options?.intensityUnit ?? UnitlessLightUnit,
    kind: HemisphereLightKind,
    skyColor: options?.skyColor ?? 0xffffffff,
  });
}
