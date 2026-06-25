// LUT (lookup-table) recipe math for LookupTableGradeEffect. Substrate-agnostic helpers for
// sampling 3D color LUTs stored as 2D strip-encoded textures. All functions are alias-safe.

// Computes the UV coordinate in the 2D strip-encoded LUT texture that corresponds to an RGB color.
// A 3D LUT of size N is encoded as a horizontal strip of N² tiles each of size N×1:
//   U encodes the B channel (tile index + R-within-tile).
//   V encodes the G channel (row within the strip, normalized to [0,1]).
// Writes [u, v] into `out`. Caller applies bilinear filtering.
// Alias-safe.
export function computeLookupTableCoord(
  r: number, // normalized R channel [0..1].
  g: number, // normalized G channel [0..1].
  b: number, // normalized B channel [0..1].
  lutSize: number, // cube size of the LUT (e.g. 16, 32, 64).
  out: [number, number],
): void {
  const n = Math.max(1, lutSize);
  const halfTexel = 0.5 / n;
  // Clamp inputs to avoid bleeding at the LUT boundary.
  const rc = Math.max(0, Math.min(1, r));
  const gc = Math.max(0, Math.min(1, g));
  const bc = Math.max(0, Math.min(1, b));
  // B determines which horizontal tile (0..n-1).
  const bSlice = bc * (n - 1);
  const bIndex = Math.floor(bSlice);
  // U: tile offset + R within the tile.
  const u = (bIndex + rc * (1 - 1 / n) + halfTexel) / n;
  // V: G channel (one row per G step, stored bottom-to-top; some encoders are inverted — callers
  // can flip V if needed for their texture's storage convention).
  const v = gc * (1 - 1 / n) + halfTexel;
  out[0] = u;
  out[1] = v;
}

// Returns the [width, height] in pixels of the 2D strip texture required to store a 3D LUT of
// the given cube size. Width = size², height = size (one row of G steps).
// Writes [width, height] into `out`.
export function getLookupTableTileLayout(lutSize: number, out: [number, number]): void {
  const n = Math.max(1, lutSize);
  out[0] = n * n; // width: n tiles × n pixels each.
  out[1] = n; // height: one row per G step.
}
