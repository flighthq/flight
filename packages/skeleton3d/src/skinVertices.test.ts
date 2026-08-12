import { createMatrix3, createMatrix4, setMatrix3NormalFromMatrix4 } from '@flighthq/geometry/contract';

import { skinTangents, skinVertices } from './skinVertices';

// The normal palette a real pose would carry: the inverse-transpose of each joint's upper 3x3. Derived
// here rather than hand-written so a test cannot accidentally assert against a palette that no pose
// could produce.
function normalPaletteFor(jointMatrices: readonly number[]): Float32Array {
  const count = (jointMatrices.length / 16) | 0;
  const out = new Float32Array(count * 12);
  for (let j = 0; j < count; j += 1) {
    const source = createMatrix4();
    source.m.set(jointMatrices.slice(j * 16, j * 16 + 16));
    const normal = createMatrix3();
    setMatrix3NormalFromMatrix4(normal, source);
    for (let c = 0; c < 3; c += 1) {
      out[j * 12 + c * 4] = normal.m[c * 3]!;
      out[j * 12 + c * 4 + 1] = normal.m[c * 3 + 1]!;
      out[j * 12 + c * 4 + 2] = normal.m[c * 3 + 2]!;
    }
  }
  return out;
}

// A column-major 4x4 identity, then variants with translation/scale, laid out as the 16-float palette entry.
function identity(): number[] {
  // prettier-ignore
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function translation(tx: number, ty: number, tz: number): number[] {
  const m = identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

describe('skinTangents', () => {
  // Same contract as the position path: no influence means bind pose. A zero tangent collapses the
  // TBN basis the shader reconstructs the bitangent from.
  it('leaves an uninfluenced tangent at its bind pose rather than zero', () => {
    const tangents = new Float32Array([1, 0, 0, -1]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([0, 0, 0, 0]);
    const palette = new Float32Array(identity());
    palette[0] = 9;
    const out = new Float32Array(4);

    skinTangents(out, tangents, joints, weights, palette);

    expect(Array.from(out)).toEqual([1, 0, 0, -1]);
  });

  // A 90-degree rotation about Z, column-major. A pure rotation is used deliberately: N·T = 0 survives
  // skinning exactly only under a rigid transform, where transforming the tangent as a vector by M and
  // the normal as a covector by M⁻ᵀ coincide. Under non-uniform scale they diverge and orthogonality is
  // not something this code promises, so it is not asserted there.
  // prettier-ignore
  const rotateZ90 = [
    0, 1, 0, 0,
    -1, 0, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
  const singleJoint = { joints: new Float32Array([0, 0, 0, 0]), weights: new Float32Array([1, 0, 0, 0]) };

  it('rotates the tangent direction with the pose', () => {
    const tangents = new Float32Array([1, 0, 0, 1]);
    const out = new Float32Array(4);
    skinTangents(out, tangents, singleJoint.joints, singleJoint.weights, new Float32Array(rotateZ90));
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(1);
    expect(out[2]).toBeCloseTo(0);
  });

  it('carries w through UNCHANGED, because it is handedness and not a coordinate', () => {
    // Rotating or re-deriving w flips the bitangent across whole regions of the surface, which reaches
    // the eye as inverted lighting rather than as a crash. Both signs are checked: a transform that
    // happened to preserve +1 could still destroy -1.
    const positive = new Float32Array(4);
    const negative = new Float32Array(4);
    skinTangents(
      positive,
      new Float32Array([1, 0, 0, 1]),
      singleJoint.joints,
      singleJoint.weights,
      new Float32Array(rotateZ90),
    );
    skinTangents(
      negative,
      new Float32Array([1, 0, 0, -1]),
      singleJoint.joints,
      singleJoint.weights,
      new Float32Array(rotateZ90),
    );
    expect(positive[3]).toBe(1);
    expect(negative[3]).toBe(-1);
  });

  it('keeps the tangent orthogonal to the normal it was orthogonal to', () => {
    // The defect this fixes: the normal was skinned and the tangent was not, so N·T drifted away from
    // zero in any pose off the bind pose. Starting orthogonal, they must stay orthogonal under a rotation.
    const palette = new Float32Array(rotateZ90);
    const outNormals = new Float32Array(3);
    const outTangents = new Float32Array(4);
    skinVertices(
      new Float32Array(3),
      outNormals,
      new Float32Array([0, 0, 0]),
      new Float32Array([0, 1, 0]),
      singleJoint.joints,
      singleJoint.weights,
      palette,
      normalPaletteFor([...palette]),
    );
    skinTangents(outTangents, new Float32Array([1, 0, 0, 1]), singleJoint.joints, singleJoint.weights, palette);
    const dot = outNormals[0] * outTangents[0] + outNormals[1] * outTangents[1] + outNormals[2] * outTangents[2];
    expect(dot).toBeCloseTo(0);
  });

  it('applies the same transform skinVertices applies to normals FOR A RIGID JOINT', () => {
    // ★ NARROWED 2026-08-10, AND THE NARROWING IS THE POINT. This began as a blanket anti-divergence
    // guard, written when normals and tangents shared one transform. They no longer do: a normal is a
    // covector and now follows the per-joint inverse-transpose, while a tangent is a true vector and
    // still follows the plain matrix. Under non-uniform scale they SHOULD disagree, so asserting
    // equality there would now be asserting the bug back into existence. For a RIGID joint the two
    // matrices coincide, so agreement remains the right expectation and the guard still catches an
    // accidental divergence in the case that covers almost all authored content.
    const palette = new Float32Array(rotateZ90);
    const vector = [0.3, -0.7, 0.5];
    const outNormals = new Float32Array(3);
    const outTangents = new Float32Array(4);
    skinVertices(
      new Float32Array(3),
      outNormals,
      new Float32Array([0, 0, 0]),
      new Float32Array(vector),
      singleJoint.joints,
      singleJoint.weights,
      palette,
      normalPaletteFor([...palette]),
    );
    skinTangents(outTangents, new Float32Array([...vector, 1]), singleJoint.joints, singleJoint.weights, palette);
    expect(outTangents[0]).toBeCloseTo(outNormals[0]);
    expect(outTangents[1]).toBeCloseTo(outNormals[1]);
    expect(outTangents[2]).toBeCloseTo(outNormals[2]);
  });

  it('is safe when the output aliases the input', () => {
    const tangents = new Float32Array([1, 0, 0, -1]);
    skinTangents(tangents, tangents, singleJoint.joints, singleJoint.weights, new Float32Array(rotateZ90));
    expect(tangents[1]).toBeCloseTo(1);
    expect(tangents[3]).toBe(-1);
  });

  it('iterates nothing when the geometry carries no tangent channel', () => {
    // A zero-length capture is how "this layout has no tangents" is expressed, so it must be a no-op
    // rather than an out-of-range read.
    const out = new Float32Array(0);
    expect(() =>
      skinTangents(out, new Float32Array(0), singleJoint.joints, singleJoint.weights, new Float32Array(rotateZ90)),
    ).not.toThrow();
  });
});

describe('skinVertices', () => {
  // packSkinInfluences documents that a vertex with no influence "keeps all weights zero (it stays at
  // its bind position)". Accumulating the weighted sum from zero instead collapsed such a vertex onto
  // the ORIGIN with a zero normal — it teleported and dragged its triangle with it, and the skin bounds
  // computed from these positions inherited the collapse. The palette here is a translation, so a
  // bind-pose pass-through and a "moved by the joint" answer cannot be confused.
  it('leaves an uninfluenced vertex at its bind pose rather than the origin', () => {
    const positions = new Float32Array([5, 6, 7]);
    const normals = new Float32Array([0, 1, 0]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([0, 0, 0, 0]);
    const palette = new Float32Array(identity());
    palette[12] = 100;
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);

    skinVertices(
      outPositions,
      outNormals,
      positions,
      normals,
      joints,
      weights,
      palette,
      normalPaletteFor([...palette]),
    );

    expect(Array.from(outPositions)).toEqual([5, 6, 7]);
    expect(Array.from(outNormals)).toEqual([0, 1, 0]);
  });

  it('passes vertices through unchanged when the only weighted joint is identity', () => {
    const positions = new Float32Array([2, 3, 4]);
    const normals = new Float32Array([0, 1, 0]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0]);
    const palette = new Float32Array(identity());
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);

    skinVertices(
      outPositions,
      outNormals,
      positions,
      normals,
      joints,
      weights,
      palette,
      normalPaletteFor([...palette]),
    );

    expect(Array.from(outPositions)).toEqual([2, 3, 4]);
    expect(Array.from(outNormals)).toEqual([0, 1, 0]);
  });

  it('applies a single-joint translation to the position but not the normal', () => {
    const positions = new Float32Array([1, 0, 0]);
    const normals = new Float32Array([0, 0, 1]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0]);
    const palette = new Float32Array(translation(10, 20, 30));
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);

    skinVertices(
      outPositions,
      outNormals,
      positions,
      normals,
      joints,
      weights,
      palette,
      normalPaletteFor([...palette]),
    );

    expect(outPositions[0]).toBeCloseTo(11);
    expect(outPositions[1]).toBeCloseTo(20);
    expect(outPositions[2]).toBeCloseTo(30);
    // Normals ignore the translation column.
    expect(outPositions).not.toBe(outNormals);
    expect(outNormals[0]).toBeCloseTo(0);
    expect(outNormals[1]).toBeCloseTo(0);
    expect(outNormals[2]).toBeCloseTo(1);
  });

  it('blends two joints by their weights', () => {
    const positions = new Float32Array([0, 0, 0]);
    const normals = new Float32Array([0, 0, 0]);
    // Joint 0 at palette base 0 translates +(10,0,0); joint 1 at base 16 translates +(0,10,0).
    const palette = new Float32Array([...translation(10, 0, 0), ...translation(0, 10, 0)]);
    const joints = new Uint16Array([0, 1, 0, 0]);
    const weights = new Float32Array([0.25, 0.75, 0, 0]);
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);

    skinVertices(
      outPositions,
      outNormals,
      positions,
      normals,
      joints,
      weights,
      palette,
      normalPaletteFor([...palette]),
    );

    // 0.25 * (10,0,0) + 0.75 * (0,10,0) = (2.5, 7.5, 0)
    expect(outPositions[0]).toBeCloseTo(2.5);
    expect(outPositions[1]).toBeCloseTo(7.5);
    expect(outPositions[2]).toBeCloseTo(0);
  });

  it('skins every vertex in a multi-vertex buffer', () => {
    const positions = new Float32Array([1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1]);
    const joints = new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
    const palette = new Float32Array(translation(5, 0, 0));
    const outPositions = new Float32Array(6);
    const outNormals = new Float32Array(6);

    skinVertices(
      outPositions,
      outNormals,
      positions,
      normals,
      joints,
      weights,
      palette,
      normalPaletteFor([...palette]),
    );

    expect(Array.from(outPositions)).toEqual([6, 0, 0, 5, 1, 0]);
  });

  it('is safe when out aliases the input positions', () => {
    const positions = new Float32Array([1, 2, 3]);
    const normals = new Float32Array([1, 0, 0]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0]);
    const palette = new Float32Array(translation(1, 1, 1));

    skinVertices(positions, normals, positions, normals, joints, weights, palette, normalPaletteFor([...palette]));

    expect(Array.from(positions)).toEqual([2, 3, 4]);
  });
});

describe('skinVertices covector normals', () => {
  const singleJoint = { joints: new Float32Array([0, 0, 0, 0]), weights: new Float32Array([1, 0, 0, 0]) };
  // Non-uniform scale: 2x along x, 1x along y. A plane's normal must NOT follow this the way a position
  // does — stretching a surface along x makes its normal lean the OTHER way.
  // prettier-ignore
  const scaleX2 = [
    2, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];

  it('leans a normal AGAINST a non-uniform stretch, not with it', () => {
    // ★ THE DEFECT THIS FIXES. A 45-degree normal on a surface stretched 2x in x must come out with its
    // x component HALVED relative to y (the inverse-transpose), not DOUBLED (the position matrix). The
    // two answers differ by a factor of four in the ratio, so this cannot pass by accident.
    const palette = new Float32Array(scaleX2);
    const out = new Float32Array(3);
    skinVertices(
      new Float32Array(3),
      out,
      new Float32Array([0, 0, 0]),
      new Float32Array([1, 1, 0]),
      singleJoint.joints,
      singleJoint.weights,
      palette,
      normalPaletteFor(scaleX2),
    );
    expect(out[0] / out[1]).toBeCloseTo(0.5);
  });

  it('leaves a RIGID joint bit-for-bit unchanged, which is what protects existing content', () => {
    // ★ THE HALF THAT MATTERS MOST. For rotation+translation the inverse-transpose EQUALS the matrix in
    // exact arithmetic — but it is computed via an inverse and a transpose in floating point, so it need
    // not agree BIT-FOR-BIT. MD5 and most authored content is rigid, so any drift here would perturb
    // every skinned scene in the repo for no benefit. Compared with toBe, not toBeCloseTo, deliberately:
    // "close enough" is exactly the answer that would let a few ULPs through unnoticed.
    // prettier-ignore
    const rigid = [
      0, 1, 0, 0,
      -1, 0, 0, 0,
      0, 0, 1, 0,
      3, 4, 5, 1,
    ];
    const palette = new Float32Array(rigid);
    const viaNormalPalette = new Float32Array(3);
    const viaJointMatrix = new Float32Array(3);
    const normal = new Float32Array([0.3, -0.7, 0.5]);
    skinVertices(
      new Float32Array(3),
      viaNormalPalette,
      new Float32Array(3),
      normal,
      singleJoint.joints,
      singleJoint.weights,
      palette,
      normalPaletteFor(rigid),
    );
    // The pre-fix behaviour: the joint matrix used as its own normal matrix.
    skinVertices(
      new Float32Array(3),
      viaJointMatrix,
      new Float32Array(3),
      normal,
      singleJoint.joints,
      singleJoint.weights,
      palette,
      new Float32Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0]),
    );
    expect(viaNormalPalette[0]).toBe(viaJointMatrix[0]);
    expect(viaNormalPalette[1]).toBe(viaJointMatrix[1]);
    expect(viaNormalPalette[2]).toBe(viaJointMatrix[2]);
  });
});
