// CPU linear-blend skinning (a.k.a. smooth/matrix-palette skinning). Deforms each vertex on the CPU by the
// weighted sum of its influencing joints' palette matrices — the same math a GPU vertex shader runs, kept
// here as a deterministic, GPU-free path for offscreen bakes, physics proxies, and jsdom tests.
//
// Buffer layout (all flat typed arrays, tightly packed, vertex-major):
//   positions / outPositions : 3 floats per vertex  (x, y, z)
//   normals   / outNormals   : 3 floats per vertex  (x, y, z)
//   joints                   : 4 joint indices per vertex (the standard 4-influence LBS)
//   weights                  : 4 blend weights per vertex, aligned with `joints`
//   jointMatrices            : the skin palette — 16 column-major floats per joint
//
// Positions are transformed as affine points (including translation); normals are transformed by the
// palette matrix's upper 3×3 only (no translation) and are NOT renormalized — callers that need unit
// normals (e.g. non-uniform scale in the palette) renormalize afterward. `out*` may alias `positions` /
// `normals`: each vertex's inputs are read into locals before any output is written.
export function skinVertices(
  outPositions: Float32Array,
  outNormals: Float32Array,
  positions: Readonly<Float32Array>,
  normals: Readonly<Float32Array>,
  joints: Readonly<ArrayLike<number>>,
  weights: Readonly<Float32Array>,
  jointMatrices: Readonly<Float32Array>,
): void {
  const vertexCount = (positions.length / 3) | 0;
  for (let v = 0; v < vertexCount; v++) {
    const p = v * 3;
    const px = positions[p];
    const py = positions[p + 1];
    const pz = positions[p + 2];
    const nx = normals[p];
    const ny = normals[p + 1];
    const nz = normals[p + 2];

    let opx = 0;
    let opy = 0;
    let opz = 0;
    let onx = 0;
    let ony = 0;
    let onz = 0;

    const w = v * 4;
    for (let k = 0; k < 4; k++) {
      const weight = weights[w + k];
      if (weight === 0) continue;
      const m = joints[w + k] * 16;

      const m0 = jointMatrices[m];
      const m1 = jointMatrices[m + 1];
      const m2 = jointMatrices[m + 2];
      const m4 = jointMatrices[m + 4];
      const m5 = jointMatrices[m + 5];
      const m6 = jointMatrices[m + 6];
      const m8 = jointMatrices[m + 8];
      const m9 = jointMatrices[m + 9];
      const m10 = jointMatrices[m + 10];

      opx += weight * (m0 * px + m4 * py + m8 * pz + jointMatrices[m + 12]);
      opy += weight * (m1 * px + m5 * py + m9 * pz + jointMatrices[m + 13]);
      opz += weight * (m2 * px + m6 * py + m10 * pz + jointMatrices[m + 14]);

      onx += weight * (m0 * nx + m4 * ny + m8 * nz);
      ony += weight * (m1 * nx + m5 * ny + m9 * nz);
      onz += weight * (m2 * nx + m6 * ny + m10 * nz);
    }

    outPositions[p] = opx;
    outPositions[p + 1] = opy;
    outPositions[p + 2] = opz;
    outNormals[p] = onx;
    outNormals[p + 1] = ony;
    outNormals[p + 2] = onz;
  }
}
