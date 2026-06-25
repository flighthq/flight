import { createBoundingSphere } from '@flighthq/geometry';
import type { BoundingSphereLike, Light, PointLight } from '@flighthq/types';
import {
  AmbientLightKind,
  AreaLightKind,
  DirectionalLightKind,
  EnvironmentKind,
  HemisphereLightKind,
  PointLightKind,
  SpotLightKind,
} from '@flighthq/types';

// Writes the world-space influence bounding sphere of a light into `out`. The sphere bounds the
// region the light can illuminate. Lights with a finite `range` produce a sphere centered at
// `position` with `radius = range`. Non-spatial lights (ambient, hemisphere, environment) and
// infinite-range spatial lights produce a sentinel sphere with `radius = -1` (unlimited reach).
export function getLightInfluenceBounds(out: BoundingSphereLike, light: Readonly<Light>): void {
  const kind = light.kind;
  if (
    kind === AmbientLightKind ||
    kind === HemisphereLightKind ||
    kind === EnvironmentKind ||
    kind === DirectionalLightKind
  ) {
    // Non-spatial or infinite-reach lights — sentinel radius.
    out.center.x = 0;
    out.center.y = 0;
    out.center.z = 0;
    out.radius = -1;
    return;
  }
  if (kind === PointLightKind || kind === SpotLightKind || kind === AreaLightKind) {
    const spatial = light as Readonly<PointLight>;
    const range = spatial.range;
    if (range < 0) {
      // Infinite range — sentinel.
      out.center.x = 0;
      out.center.y = 0;
      out.center.z = 0;
      out.radius = -1;
      return;
    }
    out.center.x = spatial.position.x;
    out.center.y = spatial.position.y;
    out.center.z = spatial.position.z;
    out.radius = range;
    return;
  }
  // Unknown light kind — sentinel.
  out.center.x = 0;
  out.center.y = 0;
  out.center.z = 0;
  out.radius = -1;
}

// Returns the perceptual luminance of a light's color × intensity. The luminance is computed
// from the packed sRgb-albedo RGBA color using the standard ITU-R BT.709 coefficients, then
// scaled by `intensity`. Useful for ranking lights by visual importance when prioritizing a
// forward-light budget.
export function getLightLuminance(light: Readonly<Light>): number {
  const colored = light as Readonly<{ color?: number; intensity?: number }>;
  const color = colored.color;
  if (color === undefined) return 0;
  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const intensity = colored.intensity ?? 1;
  return luma * intensity;
}

// Returns true when `light` could influence a point within `bounds`. Non-spatial lights (ambient,
// hemisphere, directional, environment) and infinite-range lights always return true. For spatial
// lights with a finite range, tests whether the influence sphere intersects `bounds` using a
// sphere-sphere overlap test. An empty `bounds` (radius < 0) is treated as no overlap.
export function hasLightInfluenceOnBounds(light: Readonly<Light>, bounds: Readonly<BoundingSphereLike>): boolean {
  // Use module-level scratch to avoid per-call allocation.
  getLightInfluenceBounds(scratchSphere, light);
  // Sentinel radius (-1) = unlimited reach.
  if (scratchSphere.radius < 0) return true;
  // Empty bounds — treat as no overlap.
  if (bounds.radius < 0) return false;
  // Sphere-sphere overlap: distance between centers <= sum of radii.
  const dx = scratchSphere.center.x - bounds.center.x;
  const dy = scratchSphere.center.y - bounds.center.y;
  const dz = scratchSphere.center.z - bounds.center.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const radSum = scratchSphere.radius + bounds.radius;
  return distSq <= radSum * radSum;
}

// Returns true when the light is configured to cast shadows. Non-shadow-capable light types
// (AmbientLight, HemisphereLight, Environment) always return false.
export function isLightShadowCasting(light: Readonly<Light>): boolean {
  const kind = light.kind;
  if (kind === AmbientLightKind || kind === HemisphereLightKind || kind === EnvironmentKind) {
    return false;
  }
  return (light as unknown as Readonly<{ castsShadow: boolean }>).castsShadow;
}

// Scratch sphere used by hasLightInfluenceOnBounds to avoid per-call allocation.
const scratchSphere = createBoundingSphere(0, 0, 0, -1);
