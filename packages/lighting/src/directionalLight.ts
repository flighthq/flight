import { createEntity } from '@flighthq/entity';
import { cloneVector3, createVector3, setVector3 } from '@flighthq/geometry';
import type { DirectionalLight, DirectionalLightOptions } from '@flighthq/types';
import { DirectionalLightKind } from '@flighthq/types';

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
