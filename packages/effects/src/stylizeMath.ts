// Stylize-effect recipe math. Substrate-agnostic helpers for CRT, halftone, dither, scanline,
// and related stylize effects. All functions are alias-safe and zero-allocation (out-param).

// Computes CRT mask/barrel parameters for a CRT effect.
// Writes [maskScale, curvatureStrength] into `out`.
// maskScale: pixel-grid cell size for the RGB phosphor mask.
// curvatureStrength: barrel curvature magnitude [0..1].
// Alias-safe.
export function computeCrtMaskParams(
  resolution: number, // render target height (pixels) for scaling the mask.
  curvature: number, // barrel curvature [0..1]. Default 0.1.
  out: [number, number],
): void {
  // Mask scale normalized to physical scanline height.
  const maskScale = Math.max(1, resolution) / 360; // normalize to 360p reference.
  const curv = Math.max(0, Math.min(1, curvature));
  out[0] = maskScale;
  out[1] = curv * 0.1; // map [0..1] to [0..0.1] barrel strength.
}

// Computes halftone cell parameters for a given screen frequency and angle.
// Returns [cellSize, cosAngle, sinAngle] for use in a halftone shader.
// frequency: dots per pixel (e.g. 1/8 for 8px cells). angle: radians (common 45° = π/4).
// Alias-safe.
export function computeHalftoneCellParams(frequency: number, angle: number, out: [number, number, number]): void {
  const cellSize = frequency > 1e-10 ? 1 / frequency : 1;
  out[0] = cellSize;
  out[1] = Math.cos(angle);
  out[2] = Math.sin(angle);
}

// Computes scanline parameters: [scanlineWidth, scanlineSoftness].
// scanlineWidth: normalized scanline thickness relative to a single pixel.
// intensity: scanline darkness [0..1].
// Alias-safe.
export function computeScanlineParams(
  resolution: number, // render target height for scaling.
  intensity: number, // scanline intensity [0..1].
  out: [number, number],
): void {
  const scale = Math.max(1, resolution) / 480; // normalize to 480p reference.
  out[0] = scale;
  out[1] = Math.max(0, Math.min(1, intensity));
}

// Creates a Bayer ordered-dither matrix of the given order (1=2×2, 2=4×4, 3=8×8, ...).
// Writes `order^2` normalized values into `out` in row-major order. Values are in [0..1).
// `out` must have capacity >= (2^order)^2. Returns the matrix size (2^order).
// Alias-safe: no external shared state.
export function createBayerMatrix(order: number, out: Float32Array): number {
  const size = Math.pow(2, Math.max(1, Math.round(order)));
  const sizeSq = size * size;
  // Build the Bayer matrix recursively via the recurrence:
  // B(2n) = [ B(n)*4, B(n)*4+2; B(n)*4+3, B(n)*4+1 ] / (4n^2)
  // Start with the base 2×2 matrix [0,2;3,1] / 4.
  const raw = new Float32Array(sizeSq);
  raw[0] = 0;
  raw[1] = 2;
  raw[2] = 3;
  raw[3] = 1;
  let currentSize = 2;
  while (currentSize < size) {
    const next = currentSize * 2;
    const nextSq = next * next;
    const tmp = new Float32Array(nextSq);
    for (let y = 0; y < currentSize; y++) {
      for (let x = 0; x < currentSize; x++) {
        const base = raw[y * currentSize + x] * 4;
        tmp[y * next + x] = base;
        tmp[y * next + (x + currentSize)] = base + 2;
        tmp[(y + currentSize) * next + x] = base + 3;
        tmp[(y + currentSize) * next + (x + currentSize)] = base + 1;
      }
    }
    raw.set(tmp);
    currentSize = next;
  }
  // Normalize to [0..1).
  const invSizeSq = 1 / sizeSq;
  for (let i = 0; i < sizeSq; i++) {
    out[i] = raw[i] * invSizeSq;
  }
  return size;
}
