import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { cloneVector3, createVector3, normalizeVector3, setVector3 } from '@flighthq/geometry/contract';
import type { AreaLight, AreaLightOptions, EntityConstruction, Vector3Like } from '@flighthq/types/contract';
import { AreaLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of an area light's data, including fresh position/direction/right/up vectors.
export function cloneAreaLight(source: Readonly<AreaLight>): AreaLight {
  const out = allocateEntity<AreaLight>();
  out.castsShadow = source.castsShadow;
  out.color = source.color;
  out.decay = source.decay;
  out.direction = cloneVector3(source.direction);
  out.enabled = source.enabled;
  out.intensity = source.intensity;
  out.intensityUnit = source.intensityUnit;
  out.kind = AreaLightKind;
  out.normalBias = source.normalBias;
  out.pcfRadius = source.pcfRadius;
  out.position = cloneVector3(source.position);
  out.range = source.range;
  out.right = cloneVector3(source.right);
  out.shadowBias = source.shadowBias;
  out.shadowFar = source.shadowFar;
  out.shadowMapSize = source.shadowMapSize;
  out.shadowNear = source.shadowNear;
  out.shadowStrength = source.shadowStrength;
  out.up = cloneVector3(source.up);
  return finishEntity(out);
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
  const out = allocateEntity<AreaLight>();
  out.castsShadow = options?.castsShadow ?? false;
  out.color = options?.color ?? 0xffffffff;
  out.decay = options?.decay ?? 2;
  out.direction = direction ? cloneVector3(direction) : createVector3(0, -1, 0);
  out.enabled = options?.enabled ?? true;
  out.intensity = options?.intensity ?? 1;
  out.intensityUnit = options?.intensityUnit ?? UnitlessLightUnit;
  out.kind = AreaLightKind;
  out.normalBias = options?.normalBias ?? 0;
  out.pcfRadius = options?.pcfRadius ?? 0;
  out.position = position ? cloneVector3(position) : createVector3(0, 0, 0);
  out.range = options?.range ?? -1;
  out.right = right ? cloneVector3(right) : createVector3(1, 0, 0);
  out.shadowBias = options?.shadowBias ?? 0;
  out.shadowFar = options?.shadowFar ?? 500;
  out.shadowMapSize = options?.shadowMapSize ?? 1024;
  out.shadowNear = options?.shadowNear ?? 0.5;
  out.shadowStrength = options?.shadowStrength ?? 1;
  out.up = up ? cloneVector3(up) : createVector3(0, 0, 1);
  return finishEntity(out);
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
