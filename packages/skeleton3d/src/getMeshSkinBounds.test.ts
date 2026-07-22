import { createEntity } from '@flighthq/entity';
import { createAabb } from '@flighthq/geometry';
import type { MeshSkinBindPose, Skeleton3D } from '@flighthq/types';

import { getMeshSkinConservativeBounds, getMeshSkinExactBounds } from './getMeshSkinBounds';

// A column-major 4x4 identity / translation, laid out as a 16-float palette entry.
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

// A minimal bind pose: `count` vertices with the given flat rest positions, each fully weighted to
// the joint indices in `jointIndices` (aligned by vertex, one influence slot filled). Normals are
// zero; skinned scratch is allocated to match.
function bindPoseFor(positions: number[], jointIndices: number[]): MeshSkinBindPose {
  const count = (positions.length / 3) | 0;
  const joints = new Float32Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    joints[v * 4] = jointIndices[v];
    weights[v * 4] = 1;
  }
  return {
    joints,
    normals: new Float32Array(count * 3),
    positions: new Float32Array(positions),
    skinnedNormals: new Float32Array(count * 3),
    skinnedPositions: new Float32Array(count * 3),
    weights,
  };
}

function skeletonFor(palette: number[]): Skeleton3D {
  return createEntity({
    inverseBindMatrices: new Float32Array(palette.length),
    jointMatrices: new Float32Array(palette),
    joints: [],
  });
}

describe('getMeshSkinConservativeBounds', () => {
  it('sweeps the rest box by each referenced joint and unions the results', () => {
    // Two vertices at the origin, one bound to joint 0 (+x by 10), one to joint 1 (+y by 20).
    // The rest box is a single point at the origin, so each joint-transformed box is a point; the
    // union of the two joint translations is the box spanning (0,0,0)..(10,20,0).
    const bindPose = bindPoseFor([0, 0, 0, 0, 0, 0], [0, 1]);
    const skeleton = skeletonFor([...translation(10, 0, 0), ...translation(0, 20, 0)]);
    const out = createAabb();

    getMeshSkinConservativeBounds(out, bindPose, skeleton);

    expect(out.min.x).toBeCloseTo(0);
    expect(out.min.y).toBeCloseTo(0);
    expect(out.min.z).toBeCloseTo(0);
    expect(out.max.x).toBeCloseTo(10);
    expect(out.max.y).toBeCloseTo(20);
    expect(out.max.z).toBeCloseTo(0);
  });

  it('ignores unreferenced palette joints (a far joint no vertex weights does not inflate the box)', () => {
    // Only joint 0 is referenced; joint 1 sits far away but is never weighted.
    const bindPose = bindPoseFor([1, 0, 0], [0]);
    const skeleton = skeletonFor([...translation(0, 0, 0), ...translation(1000, 1000, 1000)]);
    const out = createAabb();

    getMeshSkinConservativeBounds(out, bindPose, skeleton);

    expect(out.max.x).toBeCloseTo(1);
    expect(out.max.y).toBeCloseTo(0);
    expect(out.max.z).toBeCloseTo(0);
  });

  it('yields the empty box for an empty rest pose', () => {
    const bindPose = bindPoseFor([], []);
    const skeleton = skeletonFor(identity());
    const out = createAabb();

    getMeshSkinConservativeBounds(out, bindPose, skeleton);

    expect(out.min.x).toBe(Number.POSITIVE_INFINITY);
    expect(out.max.x).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('getMeshSkinExactBounds', () => {
  it('takes the tight AABB of every CPU-skinned vertex (hand-computed)', () => {
    // A rest box from (0,0,0) to (2,2,0), each corner bound to a different joint.
    // Joint 0 translates +(0,0,0) (identity), joint 1 translates +(10,0,0). The skinned corners are
    // (0,0,0),(2,2,0) under joint 0 and (10,0,0),(12,2,0) under joint 1 → tight box (0,0,0)..(12,2,0).
    const bindPose = bindPoseFor([0, 0, 0, 2, 2, 0, 0, 0, 0, 2, 2, 0], [0, 0, 1, 1]);
    const skeleton = skeletonFor([...identity(), ...translation(10, 0, 0)]);
    const out = createAabb();

    getMeshSkinExactBounds(out, bindPose, skeleton);

    expect(out.min.x).toBeCloseTo(0);
    expect(out.min.y).toBeCloseTo(0);
    expect(out.min.z).toBeCloseTo(0);
    expect(out.max.x).toBeCloseTo(12);
    expect(out.max.y).toBeCloseTo(2);
    expect(out.max.z).toBeCloseTo(0);
  });

  it('is contained within the conservative bound (conservative >= exact containment invariant)', () => {
    // A spread of vertices across two rotating/translating joints; the exact box must sit inside the
    // conservative sweep for every referenced joint.
    const positions = [-1, -1, -1, 1, 1, 1, 0.5, -0.5, 0.25, -0.75, 0.6, -0.4];
    const bindPose = bindPoseFor(positions, [0, 1, 0, 1]);
    // Joint 0: scale 2 + translate (3,0,0); joint 1: translate (0,-5,2). Non-trivial so the boxes differ.
    // prettier-ignore
    const palette = [
      2, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 2, 0,
      3, 0, 0, 1,
      ...translation(0, -5, 2),
    ];
    const skeleton = skeletonFor(palette);

    const exact = createAabb();
    const conservative = createAabb();
    getMeshSkinExactBounds(exact, bindPose, skeleton);
    getMeshSkinConservativeBounds(conservative, bindPose, skeleton);

    expect(conservative.min.x).toBeLessThanOrEqual(exact.min.x + 1e-5);
    expect(conservative.min.y).toBeLessThanOrEqual(exact.min.y + 1e-5);
    expect(conservative.min.z).toBeLessThanOrEqual(exact.min.z + 1e-5);
    expect(conservative.max.x).toBeGreaterThanOrEqual(exact.max.x - 1e-5);
    expect(conservative.max.y).toBeGreaterThanOrEqual(exact.max.y - 1e-5);
    expect(conservative.max.z).toBeGreaterThanOrEqual(exact.max.z - 1e-5);
  });
});
