import { getColorLuminance } from '@flighthq/color/contract';
import type {
  AmbientLight,
  AreaLight,
  BoundingSphereLike,
  DirectionalLight,
  HemisphereLight,
  Light,
  PointLight,
  SpotLight,
} from '@flighthq/types/contract';
import {
  AmbientLightKind,
  AreaLightKind,
  DirectionalLightKind,
  EnvironmentKind,
  HemisphereLightKind,
  PointLightKind,
  SpotLightKind,
} from '@flighthq/types/contract';

// Estimates the radiance contribution of one punctual light at a world-space bounding sphere.
// Distance uses the nearest sphere surface (`centerDistance - radius`) so large objects receive
// radius slack instead of being ranked only at their centre. The attenuation matches the forward
// shaders at the default decay: distance^decay falloff multiplied by the squared glTF/UE4 range
// window; spot lights also apply the same smoothstep cone at the sphere centre. Multiplying by
// getLightLuminance makes the result suitable for deterministic forward-budget ranking rather than
// material-specific shading. Disabled lights contribute zero.
export function getLightContributionAtBoundingSphere(
  light: Readonly<PointLight | SpotLight>,
  bounds: Readonly<BoundingSphereLike>,
): number {
  if (!isLightEnabled(light) || bounds.radius < 0) return 0;

  const centerDx = bounds.center.x - light.position.x;
  const centerDy = bounds.center.y - light.position.y;
  const centerDz = bounds.center.z - light.position.z;
  const centerDistance = Math.hypot(centerDx, centerDy, centerDz);
  const distance = Math.max(centerDistance - bounds.radius, 0);
  const distanceSquared = distance * distance;

  let window = 1;
  if (light.range > 0) {
    const factor = distanceSquared / (light.range * light.range);
    const windowed = Math.max(0, Math.min(1, 1 - factor * factor));
    window = windowed * windowed;
  }
  const attenuation = Math.max(distance, 0.01) ** light.decay;
  let contribution = (getLightLuminance(light) * window) / attenuation;

  if (light.kind === SpotLightKind) {
    const spot = light as Readonly<SpotLight>;
    const directionLength = Math.hypot(spot.direction.x, spot.direction.y, spot.direction.z);
    const inverseRayLength = centerDistance > 0 ? 1 / centerDistance : 0;
    const inverseDirectionLength = directionLength > 0 ? 1 / directionLength : 0;
    const cosine =
      (spot.direction.x * centerDx + spot.direction.y * centerDy + spot.direction.z * centerDz) *
      inverseRayLength *
      inverseDirectionLength;
    contribution *= smoothstep(spot.outerConeCos, spot.innerConeCos, centerDistance > 0 ? cosine : 1);
  }

  return contribution;
}

// Writes the world-space influence bounding sphere of a light into `out`. The sphere bounds the
// region the light can illuminate. Lights with a finite `range` produce a sphere centered at
// `position` with `radius = range`. Non-spatial lights (ambient, hemisphere, environment) and
// infinite-range spatial lights produce a sentinel sphere with `radius = -1` (unlimited reach).
// Disabled lights write a zero-radius bound at the origin; culling queries reject them explicitly.
export function getLightInfluenceBounds(out: BoundingSphereLike, light: Readonly<Light>): void {
  if (!isLightEnabled(light)) {
    out.center.x = 0;
    out.center.y = 0;
    out.center.z = 0;
    out.radius = 0;
    return;
  }
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

// Returns the linear-light luminance of a built-in light's color × stored intensity. Packed sRGB
// channels are gamma-decoded through the shared color primitive before applying the Rec. 709
// weights, matching the radiance that packScene3DLightBlock sends to the shader. Hemisphere lights
// use the mean of their sky/ground luminances; Environment and open custom kinds return zero.
// Disabled lights also return zero.
export function getLightLuminance(light: Readonly<Light>): number {
  if (!isLightEnabled(light)) return 0;

  switch (light.kind) {
    case AmbientLightKind: {
      const ambient = light as Readonly<AmbientLight>;
      return getColorLuminance(ambient.color) * ambient.intensity;
    }
    case AreaLightKind: {
      const area = light as Readonly<AreaLight>;
      return getColorLuminance(area.color) * area.intensity;
    }
    case DirectionalLightKind: {
      const directional = light as Readonly<DirectionalLight>;
      return getColorLuminance(directional.color) * directional.intensity;
    }
    case EnvironmentKind:
      return 0;
    case HemisphereLightKind: {
      const hemisphere = light as Readonly<HemisphereLight>;
      const meanColorLuminance =
        (getColorLuminance(hemisphere.groundColor) + getColorLuminance(hemisphere.skyColor)) * 0.5;
      return meanColorLuminance * hemisphere.intensity;
    }
    case PointLightKind: {
      const point = light as Readonly<PointLight>;
      return getColorLuminance(point.color) * point.intensity;
    }
    case SpotLightKind: {
      const spot = light as Readonly<SpotLight>;
      return getColorLuminance(spot.color) * spot.intensity;
    }
    default:
      return 0;
  }
}

// Returns true when an enabled `light` could influence a point within `bounds`. Non-spatial lights (ambient,
// hemisphere, directional, environment) and infinite-range lights always return true. For spatial
// lights with a finite range, tests whether the influence sphere intersects `bounds` using a
// sphere-sphere overlap test. An empty `bounds` (radius < 0) is treated as no overlap.
export function hasLightInfluenceOnBounds(light: Readonly<Light>, bounds: Readonly<BoundingSphereLike>): boolean {
  if (!isLightEnabled(light)) return false;
  const kind = light.kind;
  if (
    kind === AmbientLightKind ||
    kind === HemisphereLightKind ||
    kind === EnvironmentKind ||
    kind === DirectionalLightKind
  ) {
    return true;
  }

  // Preserve getLightInfluenceBounds' open-kind sentinel: an unknown/non-spatial light is unlimited
  // rather than silently culled.
  if (kind !== PointLightKind && kind !== SpotLightKind && kind !== AreaLightKind) return true;

  const spatial = light as Readonly<PointLight>;
  if (spatial.range < 0) return true;
  // Empty bounds — treat as no overlap.
  if (bounds.radius < 0) return false;
  // Sphere-sphere overlap: distance between centers <= sum of radii.
  const dx = spatial.position.x - bounds.center.x;
  const dy = spatial.position.y - bounds.center.y;
  const dz = spatial.position.z - bounds.center.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const radSum = spatial.range + bounds.radius;
  return distSq <= radSum * radSum;
}

// Returns true when the enabled light is configured to cast shadows. Non-shadow-capable light types
// (AmbientLight, HemisphereLight, Environment) always return false.
//
// `Light` declares only `kind`, so the shadow-capable field is not on the base type and a custom light
// kind may legitimately omit it. The `in` check narrows without asserting a shape the value may not
// have, and comparing against `true` keeps the declared return type honest for a custom kind whose
// `castsShadow` is absent or is not a boolean at all.
export function isLightCastingShadow(light: Readonly<Light>): boolean {
  if (!isLightEnabled(light)) return false;
  const kind = light.kind;
  if (kind === AmbientLightKind || kind === HemisphereLightKind || kind === EnvironmentKind) {
    return false;
  }
  return 'castsShadow' in light && light.castsShadow === true;
}

// Built-in descriptors always carry `enabled`; an open custom kind may omit it and keeps the
// historical enabled-by-default behavior. A custom kind may still opt into the same gate.
function isLightEnabled(light: Readonly<Light>): boolean {
  return !('enabled' in light) || light.enabled !== false;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
