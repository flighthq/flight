import { createEntity } from '@flighthq/entity/contract';
import { cloneVector3, createVector3, normalizeVector3, setVector3 } from '@flighthq/geometry/contract';
import type { AreaLight, AreaLightOptions, Vector3Like } from '@flighthq/types/contract';
import { AreaLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of an area light's data, including fresh position/direction/right/up vectors.
export function cloneAreaLight(source: Readonly<AreaLight>): AreaLight {
  return createEntity({
    castsShadow: source.castsShadow,
    color: source.color,
    decay: source.decay,
    direction: cloneVector3(source.direction),
    enabled: source.enabled,
    intensity: source.intensity,
    intensityUnit: source.intensityUnit,
    kind: AreaLightKind,
    normalBias: source.normalBias,
    pcfRadius: source.pcfRadius,
    position: cloneVector3(source.position),
    range: source.range,
    right: cloneVector3(source.right),
    shadowBias: source.shadowBias,
    shadowFar: source.shadowFar,
    shadowMapSize: source.shadowMapSize,
    shadowNear: source.shadowNear,
    shadowStrength: source.shadowStrength,
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
    decay: options?.decay ?? 2,
    direction: direction ? cloneVector3(direction) : createVector3(0, -1, 0),
    enabled: options?.enabled ?? true,
    intensity: options?.intensity ?? 1,
    intensityUnit: options?.intensityUnit ?? UnitlessLightUnit,
    kind: AreaLightKind,
    normalBias: options?.normalBias ?? 0,
    pcfRadius: options?.pcfRadius ?? 0,
    position: position ? cloneVector3(position) : createVector3(0, 0, 0),
    range: options?.range ?? -1,
    right: right ? cloneVector3(right) : createVector3(1, 0, 0),
    shadowBias: options?.shadowBias ?? 0,
    shadowFar: options?.shadowFar ?? 500,
    shadowMapSize: options?.shadowMapSize ?? 1024,
    shadowNear: options?.shadowNear ?? 0.5,
    shadowStrength: options?.shadowStrength ?? 1,
    up: up ? cloneVector3(up) : createVector3(0, 0, 1),
  });
}

// Sets the orientation of a rectangular area light by writing normalized `direction`, `right`,
// and `up` vectors. `direction` is the facing normal; `right`/`up` carry their existing lengths
// as half-extents (they are not renormalized here — only the directions are updated). The input
// direction, right, and up vectors are normalized before storing; zero-length inputs are ignored.
// Alias-safe: all inputs are read into locals before writing.
export function setAreaLightOrientation(
  out: AreaLight,
  direction: Readonly<Vector3Like>,
  right: Readonly<Vector3Like>,
  up: Readonly<Vector3Like>,
): void {
  // Read all extents and direction components into locals before writing.
  const rightLen = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
  const upLen = Math.sqrt(up.x * up.x + up.y * up.y + up.z * up.z);
  const dirLen = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
  // Preserve existing half-extent lengths; only update the directions.
  const existingRightLen = Math.sqrt(out.right.x * out.right.x + out.right.y * out.right.y + out.right.z * out.right.z);
  const existingUpLen = Math.sqrt(out.up.x * out.up.x + out.up.y * out.up.y + out.up.z * out.up.z);
  if (dirLen > 0) {
    normalizeVector3(out.direction, direction);
  }
  if (rightLen > 0) {
    // Normalize direction, then scale back to original half-extent.
    setVector3(out.right, right.x / rightLen, right.y / rightLen, right.z / rightLen);
    if (existingRightLen > 0) {
      setVector3(
        out.right,
        out.right.x * existingRightLen,
        out.right.y * existingRightLen,
        out.right.z * existingRightLen,
      );
    }
  }
  if (upLen > 0) {
    setVector3(out.up, up.x / upLen, up.y / upLen, up.z / upLen);
    if (existingUpLen > 0) {
      setVector3(out.up, out.up.x * existingUpLen, out.up.y * existingUpLen, out.up.z * existingUpLen);
    }
  }
}
