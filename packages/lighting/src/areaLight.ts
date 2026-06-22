import { createEntity } from '@flighthq/entity';
import { cloneVector3, createVector3 } from '@flighthq/geometry';
import type { AreaLight, Vector3Like } from '@flighthq/types';
import { AreaLightKind } from '@flighthq/types';

export interface AreaLightOptions {
  castsShadow?: boolean;
  color?: number;
  direction?: Readonly<Vector3Like>;
  intensity?: number;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  // Half-extent axis along the rectangle's width; its length encodes the half-width.
  right?: Readonly<Vector3Like>;
  shadowBias?: number;
  // Half-extent axis along the rectangle's height; its length encodes the half-height.
  up?: Readonly<Vector3Like>;
}

// Independent copy of an area light's data, including fresh position/direction/right/up vectors.
export function cloneAreaLight(source: Readonly<AreaLight>): AreaLight {
  return createEntity({
    castsShadow: source.castsShadow,
    color: source.color,
    direction: cloneVector3(source.direction),
    intensity: source.intensity,
    kind: AreaLightKind,
    normalBias: source.normalBias,
    pcfRadius: source.pcfRadius,
    position: cloneVector3(source.position),
    range: source.range,
    right: cloneVector3(source.right),
    shadowBias: source.shadowBias,
    up: cloneVector3(source.up),
  });
}

// Rectangular area light (LTC-shaded). `position` is the rectangle center, `direction` its facing
// normal, `right`/`up` its half-extent axes (length encodes half-width/half-height). Color is
// packed sRgb-albedo RGBA (0xrrggbbaa); defaults to opaque white at unit intensity, at the origin
// facing down (0, -1, 0), unit-half-extent (1,0,0)/(0,0,1) rectangle, infinite range, shadows off.
export function createAreaLight(options?: Readonly<AreaLightOptions>): AreaLight {
  const position = options?.position;
  const direction = options?.direction;
  const right = options?.right;
  const up = options?.up;
  return createEntity({
    castsShadow: options?.castsShadow ?? false,
    color: options?.color ?? 0xffffffff,
    direction: direction ? cloneVector3(direction) : createVector3(0, -1, 0),
    intensity: options?.intensity ?? 1,
    kind: AreaLightKind,
    normalBias: options?.normalBias ?? 0,
    pcfRadius: options?.pcfRadius ?? 0,
    position: position ? cloneVector3(position) : createVector3(0, 0, 0),
    range: options?.range ?? -1,
    right: right ? cloneVector3(right) : createVector3(1, 0, 0),
    shadowBias: options?.shadowBias ?? 0,
    up: up ? cloneVector3(up) : createVector3(0, 0, 1),
  });
}
