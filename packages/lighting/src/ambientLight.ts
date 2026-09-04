import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { AmbientLight, AmbientLightOptions, EntityConstruction } from '@flighthq/types/contract';
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

export function createAmbientLight(options?: Readonly<AmbientLightOptions>): AmbientLight {
  const out = allocateEntity<AmbientLight>();
  initializeAmbientLight(out, options);
  return finishEntity(out);
}

// Uniform omnidirectional fill light. Color is packed sRgb-albedo RGBA (0xrrggbbaa); defaults to
// opaque white at unit intensity. Ambient lights do not cast shadows.
export function initializeAmbientLight(
  out: EntityConstruction<AmbientLight>,
  options?: Readonly<AmbientLightOptions>,
): void {
  out.color = options?.color ?? 0xffffffff;
  out.enabled = options?.enabled ?? true;
  out.intensity = options?.intensity ?? 1;
  out.intensityUnit = options?.intensityUnit ?? UnitlessLightUnit;
  out.kind = AmbientLightKind;
}
