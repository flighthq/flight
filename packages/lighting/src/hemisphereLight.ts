import { createEntity } from '@flighthq/entity';
import type { HemisphereLight } from '@flighthq/types';
import { HemisphereLightKind } from '@flighthq/types';

export interface HemisphereLightOptions {
  groundColor?: number;
  intensity?: number;
  skyColor?: number;
}

// Independent copy of a hemisphere light's data. The `kind` discriminant is carried over.
export function cloneHemisphereLight(source: Readonly<HemisphereLight>): HemisphereLight {
  return createHemisphereLight({
    groundColor: source.groundColor,
    intensity: source.intensity,
    skyColor: source.skyColor,
  });
}

// Gradient ambient: `skyColor` from above, `groundColor` from below, blended by the surface
// normal's vertical component. Colors are packed sRgb-albedo RGBA (0xrrggbbaa); both default to
// opaque white at unit intensity. Hemisphere lights do not cast shadows.
export function createHemisphereLight(options?: Readonly<HemisphereLightOptions>): HemisphereLight {
  return createEntity({
    groundColor: options?.groundColor ?? 0xffffffff,
    intensity: options?.intensity ?? 1,
    kind: HemisphereLightKind,
    skyColor: options?.skyColor ?? 0xffffffff,
  });
}
