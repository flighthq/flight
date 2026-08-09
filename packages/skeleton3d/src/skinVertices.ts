// Linear-blend-skins tangents by the same palette, 4 floats per vertex in and out.
//
// ★ `w` IS HANDEDNESS, NOT A COORDINATE, AND IS COPIED THROUGH UNTOUCHED. It records which way the
// bitangent runs (B = w * cross(N, T)), so it is a sign rather than a direction: rotating it with the
// vector, or re-deriving it after skinning, flips the bitangent across whole regions of the surface.
// That reaches the eye as inverted lighting rather than as a crash, so it is a defect that ships.
//
// ★ THE xyz TRANSFORM MUST STAY IDENTICAL TO THE ONE `skinVertices` APPLIES TO NORMALS — upper 3x3 of
// each palette matrix, no translation, no renormalization. Orthogonality of N and T survives skinning
// only because both go through the same transform; "improving" one side alone breaks N·T=0 for a
// reason that has nothing to do with the improvement. `skinVertices` and this function are checked
// against each other by a test that skins the same vector through both and requires equal results.
//
// `outTangents` may alias `tangents`: each vertex's input is read into locals before any output is
// written. Not renormalized, matching the normal path — a caller needing unit tangents does that after.
export function skinTangents(
  outTangents: Float32Array,
  tangents: Readonly<Float32Array>,
  joints: Readonly<ArrayLike<number>>,
  weights: Readonly<Float32Array>,
  jointMatrices: Readonly<Float32Array>,
): void {
  const vertexCount = (tangents.length / 4) | 0;
  for (let v = 0; v < vertexCount; v++) {
    const t = v * 4;
    const tx = tangents[t];
    const ty = tangents[t + 1];
    const tz = tangents[t + 2];
    const handedness = tangents[t + 3];

    let otx = 0;
    let oty = 0;
    let otz = 0;

    for (let k = 0; k < 4; k++) {
      const weight = weights[t + k];
      if (weight === 0) continue;
      const m = joints[t + k] * 16;

      const m0 = jointMatrices[m];
      const m1 = jointMatrices[m + 1];
      const m2 = jointMatrices[m + 2];
      const m4 = jointMatrices[m + 4];
      const m5 = jointMatrices[m + 5];
      const m6 = jointMatrices[m + 6];
      const m8 = jointMatrices[m + 8];
      const m9 = jointMatrices[m + 9];
      const m10 = jointMatrices[m + 10];

      otx += weight * (m0 * tx + m4 * ty + m8 * tz);
      oty += weight * (m1 * tx + m5 * ty + m9 * tz);
      otz += weight * (m2 * tx + m6 * ty + m10 * tz);
    }

    outTangents[t] = otx;
    outTangents[t + 1] = oty;
    outTangents[t + 2] = otz;
    outTangents[t + 3] = handedness;
  }
}

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
