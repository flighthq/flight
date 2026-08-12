// Linear-blend-skins tangents by the same palette, 4 floats per vertex in and out.
//
// ★ `w` IS HANDEDNESS, NOT A COORDINATE, AND IS COPIED THROUGH UNTOUCHED. It records which way the
// bitangent runs (B = w * cross(N, T)), so it is a sign rather than a direction: rotating it with the
// vector, or re-deriving it after skinning, flips the bitangent across whole regions of the surface.
// That reaches the eye as inverted lighting rather than as a crash, so it is a defect that ships.
//
// ★ A TANGENT AND A NORMAL DELIBERATELY DIVERGE UNDER NON-UNIFORM SCALE, AND THAT IS NOT AN OVERSIGHT.
// A tangent is a TRUE VECTOR: it lies along the surface, so it follows the same matrix a position does —
// the plain upper 3x3 of each palette matrix, no translation, no renormalization. A normal is a
// COVECTOR: it is defined by being perpendicular to the surface, so it follows the inverse-transpose,
// which is why `skinVertices` reads the separate per-joint normal palette and this function does not.
// They coincide exactly for a rigid joint, which is why one shared transform looked correct for as long
// as it did. The two are still checked against each other, but only on RIGID input, where agreement is
// the right expectation.
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
    let influenced = false;

    for (let k = 0; k < 4; k++) {
      const weight = weights[t + k];
      if (weight === 0) continue;
      influenced = true;
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

    // No influence means bind pose, not the origin — see the position path for the contract.
    outTangents[t] = influenced ? otx : tx;
    outTangents[t + 1] = influenced ? oty : ty;
    outTangents[t + 2] = influenced ? otz : tz;
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
  normalMatrices: Readonly<Float32Array>,
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
    let influenced = false;

    const w = v * 4;
    for (let k = 0; k < 4; k++) {
      const weight = weights[w + k];
      if (weight === 0) continue;
      influenced = true;
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

      // Normals use the joint's NORMAL matrix, not the joint matrix. A normal is a covector: under
      // non-uniform scale it transforms by the inverse-transpose, and using the position matrix tilts
      // it off the surface. The two coincide for a rigid joint, which is why this was invisible.
      // Columns are padded to four floats each, so column c starts at n + c*4.
      const n = joints[w + k] * 12;
      onx += weight * (normalMatrices[n] * nx + normalMatrices[n + 4] * ny + normalMatrices[n + 8] * nz);
      ony += weight * (normalMatrices[n + 1] * nx + normalMatrices[n + 5] * ny + normalMatrices[n + 9] * nz);
      onz += weight * (normalMatrices[n + 2] * nx + normalMatrices[n + 6] * ny + normalMatrices[n + 10] * nz);
    }

    // A vertex with no influence stays at its BIND POSE. That is the packer's documented contract —
    // packSkinInfluences says a vertex with no influence "keeps all weights zero (it stays at its bind
    // position)" — and accumulating from zero instead collapsed it onto the origin with a zero normal.
    // Not a rounding error: an unweighted vertex teleported to (0,0,0) and dragged its triangle with it,
    // and the skin bounds computed from these positions inherited the collapse.
    outPositions[p] = influenced ? opx : px;
    outPositions[p + 1] = influenced ? opy : py;
    outPositions[p + 2] = influenced ? opz : pz;
    outNormals[p] = influenced ? onx : nx;
    outNormals[p + 1] = influenced ? ony : ny;
    outNormals[p + 2] = influenced ? onz : nz;
  }
}
