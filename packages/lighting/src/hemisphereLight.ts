import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HemisphereLight, HemisphereLightOptions, EntityConstruction } from '@flighthq/types/contract';
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

export function createHemisphereLight(options?: Readonly<HemisphereLightOptions>): HemisphereLight {
  const out = allocateEntity<HemisphereLight>();
  initializeHemisphereLight(out, options);
  return finishEntity(out);
}

// Gradient ambient: `skyColor` from above, `groundColor` from below, blended by the surface
// normal's vertical component. Colors are packed sRgb-albedo RGBA (0xrrggbbaa); both default to
// opaque white at unit intensity. Hemisphere lights do not cast shadows.
export function initializeHemisphereLight(
  out: EntityConstruction<HemisphereLight>,
  options?: Readonly<HemisphereLightOptions>,
): void {
  out.enabled = options?.enabled ?? true;
  out.groundColor = options?.groundColor ?? 0xffffffff;
  out.intensity = options?.intensity ?? 1;
  out.intensityUnit = options?.intensityUnit ?? UnitlessLightUnit;
  out.kind = HemisphereLightKind;
  out.skyColor = options?.skyColor ?? 0xffffffff;
}
