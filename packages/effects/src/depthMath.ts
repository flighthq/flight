// Screen-space depth recipe math. Substrate-agnostic helpers shared by depth-dependent effects
// (SSAO, SSR, depth-of-field, screen-space fog). All functions are alias-safe.

// Computes the circle-of-confusion (CoC) radius in normalized image-space for a depth-of-field
// effect, using the thin-lens formula. Returns a signed value; positive = behind focus.
// focusDistance: distance to the in-focus plane (same units as depth).
// aperture: lens aperture diameter (f-number denominator, e.g. 1.4 for f/1.4).
// focalLength: lens focal length in mm (for a 35 mm sensor equivalent).
export function computeDepthOfFieldCoc(
  depth: number,
  focusDistance: number,
  aperture: number,
  focalLength: number,
): number {
  // Thin lens: CoC = |focalLength * aperture * (depth - focusDistance)| / (depth * (focusDistance - focalLength)).
  const fd = Math.max(1e-5, focusDistance);
  const fl = Math.max(1e-5, focalLength) / 1000; // mm → m
  const d = Math.max(1e-5, depth);
  const a = fl / Math.max(1e-5, aperture);
  return (a * (d - fd)) / (d * (fd - fl));
}

// Converts a nonlinear (hyperbolic) depth buffer value [0..1] to a linear eye-space depth.
// The standard projection formula: linear = (near * far) / (far - depth * (far - near)).
export function computeLinearDepthFromNonlinear(depth: number, near: number, far: number): number {
  return (near * far) / (far - depth * (far - near));
}

// Generates a hemisphere SSAO sample kernel and writes the samples (xyz triplets) into `out`.
// Samples are distributed in a unit hemisphere oriented along +Z, with more samples near the
// origin for better occlusion at small radii. Returns the number of samples written.
// `out` must have capacity >= samples * 3. Alias-safe (no shared mutable state).
export function computeSsaoSampleKernel(samples: number, out: Float32Array): number {
  const n = Math.max(1, Math.round(samples));
  // Deterministic Halton-like distribution (no Math.random) so results are reproducible.
  for (let i = 0; i < n; i++) {
    // Spread samples over the hemisphere using a Halton-2 (x) and Halton-3 (y) sequence.
    const h2 = halton(i + 1, 2);
    const h3 = halton(i + 1, 3);
    const theta = h2 * 2 * Math.PI; // azimuth.
    const phi = Math.acos(1 - h3); // polar angle, biased toward origin.
    // Apply a lerp-based distance falloff: samples close to origin get more weight.
    const scale = i / n;
    const dist = 0.1 + 0.9 * scale * scale; // accelerating lerp.
    out[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * dist;
    out[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * dist;
    out[i * 3 + 2] = Math.cos(phi) * dist;
  }
  return n;
}

// Halton low-discrepancy sequence for a given index and base.
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1;
  let i = index;
  while (i > 0) {
    f /= base;
    result += f * (i % base);
    i = Math.floor(i / base);
  }
  return result;
}
