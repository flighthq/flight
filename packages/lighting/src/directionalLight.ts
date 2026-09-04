import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { cloneVector3, createVector3, setVector3 } from '@flighthq/geometry/contract';
import type { DirectionalLight, DirectionalLightOptions } from '@flighthq/types/contract';
import { DirectionalLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of a directional light's data, including a fresh `direction` vector.
export function cloneDirectionalLight(source: Readonly<DirectionalLight>): DirectionalLight {
  const out = allocateEntity<DirectionalLight>();
  out.cascadeCount = source.cascadeCount;
  out.cascadeSplits = source.cascadeSplits.slice();
  out.castsShadow = source.castsShadow;
  out.color = source.color;
  out.direction = cloneVector3(source.direction);
  out.enabled = source.enabled;
  out.intensity = source.intensity;
  out.intensityUnit = source.intensityUnit;
  out.kind = DirectionalLightKind;
  out.normalBias = source.normalBias;
  out.pcfRadius = source.pcfRadius;
  out.shadowBias = source.shadowBias;
  out.shadowFar = source.shadowFar;
  out.shadowMapSize = source.shadowMapSize;
  out.shadowNear = source.shadowNear;
  out.shadowStrength = source.shadowStrength;
  return finishEntity(out);
}

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light; surfaces are lit from -direction. Color is packed sRgb-albedo RGBA (0xrrggbbaa);
// defaults to opaque white at unit intensity, pointing straight down (0, -1, 0) with shadows off.
export function createDirectionalLight(options?: Readonly<DirectionalLightOptions>): DirectionalLight {
  const direction = options?.direction;
  const light = allocateEntity<DirectionalLight>();
  light.cascadeCount = options?.cascadeCount ?? 1;
  light.cascadeSplits = options?.cascadeSplits?.slice() ?? [1];
  light.castsShadow = options?.castsShadow ?? false;
  light.color = options?.color ?? 0xffffffff;
  light.direction = createVector3(0, -1, 0);
  light.enabled = options?.enabled ?? true;
  light.intensity = options?.intensity ?? 1;
  light.intensityUnit = options?.intensityUnit ?? UnitlessLightUnit;
  light.kind = DirectionalLightKind;
  light.normalBias = options?.normalBias ?? 0;
  light.pcfRadius = options?.pcfRadius ?? 0;
  light.shadowBias = options?.shadowBias ?? 0;
  light.shadowFar = options?.shadowFar ?? 500;
  light.shadowMapSize = options?.shadowMapSize ?? 1024;
  light.shadowNear = options?.shadowNear ?? 0.5;
  light.shadowStrength = options?.shadowStrength ?? 1;
  if (direction) setDirectionalLightDirection(light, direction.x, direction.y, direction.z);
  return light;
}

// Writes a normalized direction into `out.direction`. Normalizes the supplied x/y/z components
// before storing so the renderer can rely on a unit-length direction. Alias-safe.
export function setDirectionalLightDirection(out: DirectionalLight, x: number, y: number, z: number): void {
  // Read into locals for alias safety (out.direction may alias inputs through pooling).
  const lx = x;
  const ly = y;
  const lz = z;
  const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
  if (len > 0) {
    setVector3(out.direction, lx / len, ly / len, lz / len);
  }
}

// Writes the normalized direction from `fromX,fromY,fromZ` toward `toX,toY,toZ` into the
// light's `direction`. The direction vector is normalized before storing. Alias-safe.
export function setDirectionalLightTarget(
  out: DirectionalLight,
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len > 0) {
    setVector3(out.direction, dx / len, dy / len, dz / len);
  }
}
