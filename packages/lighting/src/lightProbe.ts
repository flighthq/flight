import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createVector3 } from '@flighthq/geometry/contract';
import type { AabbLike, EntityConstruction, LightProbe, LightProbeGrid, Vector3Like } from '@flighthq/types/contract';
import { LIGHT_PROBE_SH_FLOATS } from '@flighthq/types/contract';

/**
 * Allocates a probe at `position`. `shCoefficients` defaults to all zeros — a probe that contributes
 * no light — and when supplied is COPIED, so the caller keeps ownership of its buffer and a later
 * mutation of it cannot reach into the probe.
 *
 * Throws when `shCoefficients` is not exactly `LIGHT_PROBE_SH_FLOATS` long: a short buffer would leave
 * whole SH bands silently zero, which reads as a plausible dim probe rather than as the mistake it is.
 */
export function createLightProbe(position: Readonly<Vector3Like>, shCoefficients?: Readonly<Float32Array>): LightProbe {
  const out = allocateEntity<LightProbe>();
  initializeLightProbe(out, position, shCoefficients);
  return finishEntity(out);
}

/**
 * Allocates a grid of probes over `bounds`. `probes` is stored by reference (it is the caller's array,
 * shared not copied) while `resolution` and `bounds` are copied into owned values.
 *
 * Throws when `probes.length` does not equal `resolution.x * resolution.y * resolution.z`. This is a
 * precondition, not a runtime failure: every index the sampler computes is derived from `resolution`,
 * so a mismatched array makes reads either out of range or silently off-by-a-plane, and no sentinel a
 * caller could check afterwards would localize the mistake as well as failing here does.
 */
export function createLightProbeGrid(
  probes: readonly LightProbe[],
  bounds: Readonly<AabbLike>,
  resolution: Readonly<Vector3Like>,
): LightProbeGrid {
  const out = allocateEntity<LightProbeGrid>();
  initializeLightProbeGrid(out, probes, bounds, resolution);
  return finishEntity(out);
}

/**
 * Evaluates the nine L2 SH coefficients in direction `normal`, writing the RGB result into `out`
 * (3 floats). `normal` is normalized internally, so a caller need not pre-normalize; a zero-length
 * normal writes zeros.
 *
 * This is the plain SH reconstruction — the sum of each coefficient times its basis function — and is
 * the reconstruction half of the pair whose projection half is `setLightProbeShFromColors`. The two
 * round-trip EXACTLY only for a signal that already lies inside the L2 band and was sampled well
 * enough to integrate it; anything of higher frequency comes back as its L2 projection, because nine
 * coefficients cannot carry more. It deliberately does NOT apply the cosine-lobe convolution (the
 * per-band factors pi, 2pi/3, pi/4) that converts projected radiance into diffuse irradiance: that
 * convolution belongs to whoever shades with the result, and folding it in here would make the pair
 * no longer reconstruct what was projected.
 *
 * Alias-safe: `out` may be the same buffer as `shCoefficients`.
 */
export function evaluateLightProbeSh(
  out: Float32Array,
  normal: Readonly<Vector3Like>,
  shCoefficients: Readonly<Float32Array>,
): void {
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (length === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const inverseLength = 1 / length;
  const x = normal.x * inverseLength;
  const y = normal.y * inverseLength;
  const z = normal.z * inverseLength;

  writeShBasis(shBasisScratch, x, y, z);

  // Accumulated in locals, so writing `out` last is safe even when it aliases `shCoefficients`.
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < SH_COEFFICIENT_COUNT; i++) {
    const basis = shBasisScratch[i];
    const offset = i * 3;
    r += shCoefficients[offset] * basis;
    g += shCoefficients[offset + 1] * basis;
    b += shCoefficients[offset + 2] * basis;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

export function initializeLightProbe(
  out: EntityConstruction<LightProbe>,
  position: Readonly<Vector3Like>,
  shCoefficients?: Readonly<Float32Array>,
): void {
  if (shCoefficients !== undefined && shCoefficients.length !== LIGHT_PROBE_SH_FLOATS) {
    throw new Error(`LightProbe.shCoefficients must be ${LIGHT_PROBE_SH_FLOATS} floats, got ${shCoefficients.length}`);
  }
  out.enabled = true;
  out.position = createVector3(position.x, position.y, position.z);
  out.shCoefficients = new Float32Array(LIGHT_PROBE_SH_FLOATS);
  if (shCoefficients !== undefined) out.shCoefficients.set(shCoefficients);
}

export function initializeLightProbeGrid(
  out: EntityConstruction<LightProbeGrid>,
  probes: readonly LightProbe[],
  bounds: Readonly<AabbLike>,
  resolution: Readonly<Vector3Like>,
): void {
  const expected = resolution.x * resolution.y * resolution.z;
  if (probes.length !== expected) {
    throw new Error(
      `LightProbeGrid.probes must hold ${expected} probes for resolution ` +
        `${resolution.x}x${resolution.y}x${resolution.z}, got ${probes.length}`,
    );
  }
  out.bounds = {
    max: createVector3(bounds.max.x, bounds.max.y, bounds.max.z),
    min: createVector3(bounds.min.x, bounds.min.y, bounds.min.z),
  };
  out.enabled = true;
  out.probes = probes;
  out.resolution = createVector3(resolution.x, resolution.y, resolution.z);
}

/**
 * Writes the trilinearly interpolated SH coefficients at world-space `position` into `out`
 * (`LIGHT_PROBE_SH_FLOATS` floats). Returns false — leaving `out` untouched — when the grid is
 * disabled, has no probes, or has no ENABLED probe among the eight corners around `position`.
 *
 * A position outside the bounds clamps to the boundary rather than missing, so a surface just outside
 * a baked volume keeps the nearest lighting instead of going black. Disabled corners are dropped and
 * the remaining weights renormalized, so switching one probe off dims nothing around it; it just stops
 * voting. An axis whose resolution is 1 contributes no interpolation along that axis.
 *
 * Alias-safe: accumulation happens in a scratch buffer, so `out` may be a probe's own `shCoefficients`.
 */
export function sampleLightProbeGrid(
  out: Float32Array,
  position: Readonly<Vector3Like>,
  grid: Readonly<LightProbeGrid>,
): boolean {
  if (!grid.enabled || grid.probes.length === 0) return false;

  const nx = grid.resolution.x;
  const ny = grid.resolution.y;
  const nz = grid.resolution.z;
  const x = axisCoordinate(position.x, grid.bounds.min.x, grid.bounds.max.x, nx);
  const y = axisCoordinate(position.y, grid.bounds.min.y, grid.bounds.max.y, ny);
  const z = axisCoordinate(position.z, grid.bounds.min.z, grid.bounds.max.z, nz);
  // At the very top of an axis the floor IS the last probe index and the fraction is exactly 0, so the
  // far corner at +1 — which would be out of range — is dropped by the zero-weight test below before
  // any index is formed from it. That test, not a clamp here, is what keeps the corner pair in range.
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  shSampleScratch.fill(0);
  let totalWeight = 0;
  for (let corner = 0; corner < 8; corner++) {
    const cx = corner & 1;
    const cy = (corner >> 1) & 1;
    const cz = (corner >> 2) & 1;
    const weight = (cx === 1 ? fx : 1 - fx) * (cy === 1 ? fy : 1 - fy) * (cz === 1 ? fz : 1 - fz);
    // Skipping zero-weight corners is also what makes a resolution-1 axis safe: that axis pins its
    // fraction to 0, so its far corner weighs nothing and is dropped before an index is ever formed
    // from it. On such an axis the +1 corner would not even be out of range — with a stride of 1 it
    // would silently name the neighbour along the NEXT axis — so the bail has to come first.
    if (weight === 0) continue;
    const probe = grid.probes[x0 + cx + (y0 + cy) * nx + (z0 + cz) * nx * ny];
    if (probe === undefined || !probe.enabled) continue;

    for (let i = 0; i < LIGHT_PROBE_SH_FLOATS; i++) shSampleScratch[i] += probe.shCoefficients[i] * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return false;
  const inverseWeight = 1 / totalWeight;
  for (let i = 0; i < LIGHT_PROBE_SH_FLOATS; i++) out[i] = shSampleScratch[i] * inverseWeight;
  return true;
}

/**
 * Projects directional radiance samples into `target`'s nine L2 SH coefficients, replacing whatever
 * was there. `colors` holds linear RGB triplets and `directions` the matching unit vectors, both as
 * flat 3-float-per-sample arrays; the shorter of the two bounds how many samples are read.
 *
 * The samples are assumed to be distributed uniformly over the sphere, which is what lets each one
 * carry an equal solid angle of `4*PI / sampleCount`. Samples that are NOT uniform (a hemisphere, a
 * cube face, anything denser in one direction) will project with that bias baked in — this helper does
 * not weight by solid angle. Fewer than nine samples cannot determine nine coefficients; the result is
 * still the least-biased projection of what was given, not a fit.
 *
 * Zero samples leaves `target` all zeros, matching a fresh probe.
 */
export function setLightProbeShFromColors(
  target: LightProbe,
  colors: Readonly<Float32Array>,
  directions: Readonly<Float32Array>,
): void {
  target.shCoefficients.fill(0);
  const sampleCount = (Math.min(colors.length, directions.length) / 3) | 0;
  if (sampleCount === 0) return;

  const solidAngle = (4 * Math.PI) / sampleCount;
  for (let sample = 0; sample < sampleCount; sample++) {
    const offset = sample * 3;
    const dx = directions[offset];
    const dy = directions[offset + 1];
    const dz = directions[offset + 2];
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) continue;
    const inverseLength = 1 / length;
    writeShBasis(shBasisScratch, dx * inverseLength, dy * inverseLength, dz * inverseLength);

    const r = colors[offset] * solidAngle;
    const g = colors[offset + 1] * solidAngle;
    const b = colors[offset + 2] * solidAngle;
    for (let i = 0; i < SH_COEFFICIENT_COUNT; i++) {
      const basis = shBasisScratch[i];
      const target3 = i * 3;
      target.shCoefficients[target3] += r * basis;
      target.shCoefficients[target3 + 1] += g * basis;
      target.shCoefficients[target3 + 2] += b * basis;
    }
  }
}

// Maps a world coordinate onto the grid's probe-index axis, clamped so a position outside the bounds
// lands on the boundary. The result is in [0, n-1]; the caller turns it into a corner pair. A
// degenerate axis (min === max, or a single probe) collapses to 0. The `!(scaled > 0)` form also
// catches NaN, which a caller can produce with a NaN position and which would otherwise index nothing.
function axisCoordinate(value: number, min: number, max: number, count: number): number {
  if (count <= 1 || max <= min) return 0;
  const t = (value - min) / (max - min);
  const scaled = t * (count - 1);
  if (!(scaled > 0)) return 0;
  return Math.min(scaled, count - 1);
}

// The real (not complex) L2 spherical-harmonic basis evaluated for a unit direction, in the band order
// the coefficients are stored in. These constants are the standard normalization factors: sqrt(1/(4pi))
// for l=0, sqrt(3/(4pi)) for l=1, and the sqrt(15/(4pi)) / sqrt(5/(16pi)) / sqrt(15/(16pi)) family for
// l=2. `out` must hold at least SH_COEFFICIENT_COUNT floats.
function writeShBasis(out: Float32Array, x: number, y: number, z: number): void {
  out[0] = 0.28209479177387814;
  out[1] = 0.4886025119029199 * y;
  out[2] = 0.4886025119029199 * z;
  out[3] = 0.4886025119029199 * x;
  out[4] = 1.0925484305920792 * x * y;
  out[5] = 1.0925484305920792 * y * z;
  out[6] = 0.31539156525252005 * (3 * z * z - 1);
  out[7] = 1.0925484305920792 * x * z;
  out[8] = 0.5462742152960396 * (x * x - y * y);
}

const SH_COEFFICIENT_COUNT = 9;
const shBasisScratch = new Float32Array(SH_COEFFICIENT_COUNT);
const shSampleScratch = new Float32Array(LIGHT_PROBE_SH_FLOATS);
