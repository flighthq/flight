import type { AabbLike } from './Aabb';
import type { Entity } from './Entity';
import type { Vector3, Vector3Like } from './Vector3';

// The number of floats in a probe's `shCoefficients`: 9 L2 spherical-harmonic coefficients, each an
// RGB triplet. Exported because callers allocating their own scratch buffer for `sampleLightProbeGrid`
// need the exact length, and a wrong-sized buffer is otherwise a silent partial write.
export const LIGHT_PROBE_SH_FLOATS = 27;

/**
 * One spherical-harmonic radiance sample at a point in space — the unit a probe grid interpolates
 * between. A probe stores what light arrives at its position from every direction, compressed to the
 * nine L2 SH coefficients that capture the low-frequency part of that sphere.
 *
 * `shCoefficients` is exactly `LIGHT_PROBE_SH_FLOATS` floats: nine consecutive RGB triplets, one per
 * coefficient, ordered by band — index 0 is l=0 (m=0), indices 1..3 are l=1 (m=-1,0,1), indices 4..8
 * are l=2 (m=-2..2). Within a triplet the order is R, G, B. Values are LINEAR radiance, not packed
 * sRgb: nine 8-bit colors could not carry the high dynamic range a probe exists to record, which is
 * why this is the one lighting descriptor whose color is floats rather than a packed RGBA integer.
 *
 * The coefficients are a projection of radiance. Turning them into diffuse irradiance requires a
 * cosine convolution that `evaluateLightProbeSh` does NOT apply — see that function.
 */
export interface LightProbe extends Entity {
  enabled: boolean;
  position: Vector3;
  shCoefficients: Float32Array;
}

/**
 * A regular 3D lattice of probes covering an axis-aligned box — the simplest spatial structure for
 * "what light reaches this point", and what `sampleLightProbeGrid` interpolates.
 *
 * `probes` is indexed X-fastest then Y then Z: `index = x + y * resolution.x + z * resolution.x *
 * resolution.y`, and its length must equal `resolution.x * resolution.y * resolution.z`. Probes sit ON
 * the bounds, not at cell centres: along each axis the first probe is at `bounds.min` and the last at
 * `bounds.max`, so an axis with resolution 1 places its single probe at `bounds.min` and covers the
 * whole extent uniformly.
 */
export interface LightProbeGrid extends Entity {
  bounds: AabbLike;
  enabled: boolean;
  probes: readonly LightProbe[];
  resolution: Vector3Like;
}
