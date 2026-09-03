import { createEntity } from '@flighthq/entity/contract';
import { cloneVector3, createVector3, setVector3 } from '@flighthq/geometry/contract';
import type { DirectionalLight, DirectionalLightOptions } from '@flighthq/types/contract';
import { DirectionalLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of a directional light's data, including a fresh `direction` vector.
export function cloneDirectionalLight(source: Readonly<DirectionalLight>): DirectionalLight {
  return createEntity({
    cascadeCount: source.cascadeCount,
    cascadeSplits: source.cascadeSplits.slice(),
    castsShadow: source.castsShadow,
    color: source.color,
    direction: cloneVector3(source.direction),
    enabled: source.enabled,
    intensity: source.intensity,
    intensityUnit: source.intensityUnit,
    kind: DirectionalLightKind,
    normalBias: source.normalBias,
    pcfRadius: source.pcfRadius,
    shadowBias: source.shadowBias,
    shadowFar: source.shadowFar,
    shadowMapSize: source.shadowMapSize,
    shadowNear: source.shadowNear,
    shadowStrength: source.shadowStrength,
  });
}

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light; surfaces are lit from -direction. Color is packed sRgb-albedo RGBA (0xrrggbbaa);
// defaults to opaque white at unit intensity, pointing straight down (0, -1, 0) with shadows off.
export function createDirectionalLight(options?: Readonly<DirectionalLightOptions>): DirectionalLight {
  const direction = options?.direction;
  const light: DirectionalLight = createEntity({
    cascadeCount: options?.cascadeCount ?? 1,
    cascadeSplits: options?.cascadeSplits?.slice() ?? [1],
    castsShadow: options?.castsShadow ?? false,
    color: options?.color ?? 0xffffffff,
    direction: createVector3(0, -1, 0),
    enabled: options?.enabled ?? true,
    intensity: options?.intensity ?? 1,
    intensityUnit: options?.intensityUnit ?? UnitlessLightUnit,
    kind: DirectionalLightKind,
    normalBias: options?.normalBias ?? 0,
    pcfRadius: options?.pcfRadius ?? 0,
    shadowBias: options?.shadowBias ?? 0,
    shadowFar: options?.shadowFar ?? 500,
    shadowMapSize: options?.shadowMapSize ?? 1024,
    shadowNear: options?.shadowNear ?? 0.5,
    shadowStrength: options?.shadowStrength ?? 1,
  });
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
