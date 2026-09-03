import { createEntity } from '@flighthq/entity/contract';
import { cloneVector3, createVector3, setVector3 } from '@flighthq/geometry/contract';
import type { SpotLight, SpotLightConeAngles, SpotLightOptions } from '@flighthq/types/contract';
import { SpotLightKind, UnitlessLightUnit } from '@flighthq/types/contract';

// Independent copy of a spot light's data, including fresh `position`/`direction` vectors.
export function cloneSpotLight(source: Readonly<SpotLight>): SpotLight {
  return createEntity({
    castsShadow: source.castsShadow,
    color: source.color,
    decay: source.decay,
    direction: cloneVector3(source.direction),
    enabled: source.enabled,
    innerConeCos: source.innerConeCos,
    intensity: source.intensity,
    intensityUnit: source.intensityUnit,
    kind: SpotLightKind,
    normalBias: source.normalBias,
    outerConeCos: source.outerConeCos,
    pcfRadius: source.pcfRadius,
    position: cloneVector3(source.position),
    range: source.range,
    shadowBias: source.shadowBias,
    shadowFar: source.shadowFar,
    shadowMapSize: source.shadowMapSize,
    shadowNear: source.shadowNear,
    shadowStrength: source.shadowStrength,
    spotBlend: source.spotBlend,
  });
}

// Cone-restricted point light. `position`/`direction` are world-space; the cone is stored as the
// precomputed cosines of its inner and outer half-angles (innerConeCos >= outerConeCos). Color is
// packed sRgb-albedo RGBA (0xrrggbbaa); defaults to opaque white at unit intensity, at the origin
// facing down (0, -1, 0), 0-degree inner / 45-degree outer cone, infinite range, shadows off.
export function createSpotLight(options?: Readonly<SpotLightOptions>): SpotLight {
  const position = options?.position;
  const direction = options?.direction;
  const light: SpotLight = createEntity({
    castsShadow: options?.castsShadow ?? false,
    color: options?.color ?? 0xffffffff,
    decay: options?.decay ?? 2,
    direction: direction ? cloneVector3(direction) : createVector3(0, -1, 0),
    enabled: options?.enabled ?? true,
    innerConeCos: 1,
    intensity: options?.intensity ?? 1,
    intensityUnit: options?.intensityUnit ?? UnitlessLightUnit,
    kind: SpotLightKind,
    normalBias: options?.normalBias ?? 0,
    outerConeCos: 1,
    pcfRadius: options?.pcfRadius ?? 0,
    position: position ? cloneVector3(position) : createVector3(0, 0, 0),
    range: options?.range ?? -1,
    shadowBias: options?.shadowBias ?? 0,
    shadowFar: options?.shadowFar ?? 500,
    shadowMapSize: options?.shadowMapSize ?? 1024,
    shadowNear: options?.shadowNear ?? 0.5,
    shadowStrength: options?.shadowStrength ?? 1,
    spotBlend: 0,
  });
  setSpotLightCone(light, options?.innerConeDegrees ?? 0, options?.outerConeDegrees ?? 45);
  setSpotLightBlend(light, options?.spotBlend ?? 0);
  return light;
}

// Reads the inner and outer cone half-angles from precomputed cosines and writes them as degrees
// into `out`. Provides the round-trip for `createSpotLight` which accepts degrees but stores
// cosines. The `out` object is a plain `{ innerDegrees, outerDegrees }` struct.
export function getSpotLightConeDegrees(out: SpotLightConeAngles, source: Readonly<SpotLight>): void {
  out.innerDegrees = (Math.acos(source.innerConeCos) * 180) / Math.PI;
  out.outerDegrees = (Math.acos(source.outerConeCos) * 180) / Math.PI;
}

// Writes a normalized penumbra blend. Values outside [0, 1] are clamped rather than rejected so
// inspector and animation inputs remain safe to apply directly.
export function setSpotLightBlend(out: SpotLight, blend: number): void {
  out.spotBlend = Math.max(0, Math.min(1, blend));
}

// Writes the precomputed cone cosines from inner/outer half-angles given in degrees. A larger
// half-angle yields a smaller cosine, so the stored invariant innerConeCos >= outerConeCos holds
// exactly when innerDegrees <= outerDegrees; callers are responsible for ordering their inputs.
export function setSpotLightCone(out: SpotLight, innerDegrees: number, outerDegrees: number): void {
  out.innerConeCos = Math.cos((innerDegrees * Math.PI) / 180);
  out.outerConeCos = Math.cos((outerDegrees * Math.PI) / 180);
}

// Writes a normalized direction into `out.direction`. Normalizes x/y/z before storing.
// Alias-safe: scalar arguments cannot alias the output vector.
export function setSpotLightDirection(out: SpotLight, x: number, y: number, z: number): void {
  const lx = x;
  const ly = y;
  const lz = z;
  const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
  if (len > 0) {
    setVector3(out.direction, lx / len, ly / len, lz / len);
  }
}

// Writes the normalized direction from `out.position` toward `targetX,targetY,targetZ` into
// `out.direction`. Derives `direction` from a target point — the most common authoring gesture.
// If `out.position` equals the target (zero-length direction), `direction` is left unchanged.
export function setSpotLightTarget(out: SpotLight, targetX: number, targetY: number, targetZ: number): void {
  // Read position into locals before writing direction for alias safety.
  const px = out.position.x;
  const py = out.position.y;
  const pz = out.position.z;
  const dx = targetX - px;
  const dy = targetY - py;
  const dz = targetZ - pz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len > 0) {
    setVector3(out.direction, dx / len, dy / len, dz / len);
  }
}
