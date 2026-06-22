import { createEntity } from '@flighthq/entity';
import { cloneVector3, createVector3 } from '@flighthq/geometry';
import type { DirectionalLight, Vector3Like } from '@flighthq/types';
import { DirectionalLightKind } from '@flighthq/types';

export interface DirectionalLightOptions {
  castsShadow?: boolean;
  color?: number;
  direction?: Readonly<Vector3Like>;
  intensity?: number;
  normalBias?: number;
  pcfRadius?: number;
  shadowBias?: number;
}

// Independent copy of a directional light's data, including a fresh `direction` vector.
export function cloneDirectionalLight(source: Readonly<DirectionalLight>): DirectionalLight {
  return createEntity({
    castsShadow: source.castsShadow,
    color: source.color,
    direction: cloneVector3(source.direction),
    intensity: source.intensity,
    kind: DirectionalLightKind,
    normalBias: source.normalBias,
    pcfRadius: source.pcfRadius,
    shadowBias: source.shadowBias,
  });
}

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light; surfaces are lit from -direction. Color is packed sRgb-albedo RGBA (0xrrggbbaa);
// defaults to opaque white at unit intensity, pointing straight down (0, -1, 0) with shadows off.
export function createDirectionalLight(options?: Readonly<DirectionalLightOptions>): DirectionalLight {
  const direction = options?.direction;
  return createEntity({
    castsShadow: options?.castsShadow ?? false,
    color: options?.color ?? 0xffffffff,
    direction: direction ? cloneVector3(direction) : createVector3(0, -1, 0),
    intensity: options?.intensity ?? 1,
    kind: DirectionalLightKind,
    normalBias: options?.normalBias ?? 0,
    pcfRadius: options?.pcfRadius ?? 0,
    shadowBias: options?.shadowBias ?? 0,
  });
}
