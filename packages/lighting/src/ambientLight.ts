import { createEntity } from '@flighthq/entity';
import type { AmbientLight } from '@flighthq/types';
import { AmbientLightKind } from '@flighthq/types';

export interface AmbientLightOptions {
  color?: number;
  intensity?: number;
}

// Independent copy of an ambient light's data. The `kind` discriminant is carried over.
export function cloneAmbientLight(source: Readonly<AmbientLight>): AmbientLight {
  return createAmbientLight({ color: source.color, intensity: source.intensity });
}

// Uniform omnidirectional fill light. Color is packed sRgb-albedo RGBA (0xrrggbbaa); defaults to
// opaque white at unit intensity. Ambient lights do not cast shadows.
export function createAmbientLight(options?: Readonly<AmbientLightOptions>): AmbientLight {
  return createEntity({
    color: options?.color ?? 0xffffffff,
    intensity: options?.intensity ?? 1,
    kind: AmbientLightKind,
  });
}
