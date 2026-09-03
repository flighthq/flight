import { createEntity } from '@flighthq/entity/contract';
import type { AmbientLight, AmbientLightOptions } from '@flighthq/types/contract';
import { AmbientLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of an ambient light's data. The `kind` discriminant is carried over.
export function cloneAmbientLight(source: Readonly<AmbientLight>): AmbientLight {
  return createAmbientLight({
    color: source.color,
    enabled: source.enabled,
    intensity: source.intensity,
    intensityUnit: source.intensityUnit,
  });
}

// Uniform omnidirectional fill light. Color is packed sRgb-albedo RGBA (0xrrggbbaa); defaults to
// opaque white at unit intensity. Ambient lights do not cast shadows.
export function createAmbientLight(options?: Readonly<AmbientLightOptions>): AmbientLight {
  return createEntity({
    color: options?.color ?? 0xffffffff,
    enabled: options?.enabled ?? true,
    intensity: options?.intensity ?? 1,
    intensityUnit: options?.intensityUnit ?? UnitlessLightUnit,
    kind: AmbientLightKind,
  });
}
