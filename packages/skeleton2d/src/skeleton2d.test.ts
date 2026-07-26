import { createMatrix } from '@flighthq/geometry/contract';
import type { Bone2D } from '@flighthq/types/contract';
import { TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  cloneSkeleton2D,
  computeSkeleton2DBoneMatrices,
  computeSkeleton2DWorldTransforms,
  createSkeleton2D,
  disposeSkeleton2D,
  equalsSkeleton2D,
  getSkeleton2DBoneIndexByName,
  getSkeleton2DBoneWorldMatrix,
  setSkeleton2DBindPose,
  validateSkeleton2D,
} from './skeleton2d';

function makeBone(overrides: Partial<Bone2D> = {}): Bone2D {
  return {
    length: 0,
    name: null,
    parentIndex: -1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    transformMode: TransformMode2D.Normal,
    x: 0,
    y: 0,
    ...overrides,
  };
}

describe('cloneSkeleton2D', () => {
  it('deep-copies bones so the clone poses independently', () => {
    const s = createSkeleton2D([makeBone({ name: 'root', rotation: 30 })]);
    const c = cloneSkeleton2D(s);
    c.bones[0].rotation = 90;
    expect(s.bones[0].rotation).toBe(30);
    expect(c.bones[0].rotation).toBe(90);
    // Buffers are distinct instances.
    expect(c.worldMatrices).not.toBe(s.worldMatrices);
  });
});

describe('computeSkeleton2DBoneMatrices', () => {
  it('yields identity palettes at the captured bind pose and non-identity once posed', () => {
    const s = createSkeleton2D([makeBone({ x: 10, rotation: 45 }), makeBone({ parentIndex: 0, x: 5 })]);
    computeSkeleton2DWorldTransforms(s);
    setSkeleton2DBindPose(s);
    computeSkeleton2DBoneMatrices(s);
    // At bind pose, palette = world × inverse(world) = identity for every bone.
    for (let i = 0; i < s.bones.length; i++) {
      const o = i * 6;
      expect(s.boneMatrices[o]).toBeCloseTo(1, 4);
      expect(s.boneMatrices[o + 1]).toBeCloseTo(0, 4);
      expect(s.boneMatrices[o + 2]).toBeCloseTo(0, 4);
      expect(s.boneMatrices[o + 3]).toBeCloseTo(1, 4);
      expect(s.boneMatrices[o + 4]).toBeCloseTo(0, 4);
      expect(s.boneMatrices[o + 5]).toBeCloseTo(0, 4);
    }
    // Repose the root; the palette leaves identity.
    s.bones[0].rotation = 90;
    computeSkeleton2DWorldTransforms(s);
    computeSkeleton2DBoneMatrices(s);
    const changed = Math.abs(s.boneMatrices[0] - 1) > 1e-3 || Math.abs(s.boneMatrices[1]) > 1e-3;
    expect(changed).toBe(true);
  });
});

describe('computeSkeleton2DWorldTransforms', () => {
  it('rotates a root 90° into an (a=0,b=1,c=-1,d=0) world matrix at its translation', () => {
    const s = createSkeleton2D([makeBone({ x: 10, y: 0, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(s);
    expect(s.worldMatrices[0]).toBeCloseTo(0, 5); // a
    expect(s.worldMatrices[1]).toBeCloseTo(1, 5); // b
    expect(s.worldMatrices[2]).toBeCloseTo(-1, 5); // c
    expect(s.worldMatrices[3]).toBeCloseTo(0, 5); // d
    expect(s.worldMatrices[4]).toBeCloseTo(10, 5); // tx
    expect(s.worldMatrices[5]).toBeCloseTo(0, 5); // ty
  });

  it('places a child at parent × local (2 units along a 90°-rotated parent maps to +y)', () => {
    const s = createSkeleton2D([makeBone({ x: 10, y: 0, rotation: 90 }), makeBone({ parentIndex: 0, x: 2, y: 0 })]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    expect(out.tx).toBeCloseTo(10, 5);
    expect(out.ty).toBeCloseTo(2, 5);
  });

  it('OnlyTranslation inherits the parent position but not its rotation', () => {
    const s = createSkeleton2D([
      makeBone({ rotation: 90 }),
      makeBone({ parentIndex: 0, x: 3, y: 0, transformMode: TransformMode2D.OnlyTranslation }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Linear part is the child's own (identity), not the parent's 90° rotation.
    expect(out.a).toBeCloseTo(1, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(1, 5);
    // Position still follows the parent (3 along parent +x → +y in world).
    expect(out.tx).toBeCloseTo(0, 5);
    expect(out.ty).toBeCloseTo(3, 5);
  });

  it('NoScale strips the parent scale but keeps its rotation', () => {
    const s = createSkeleton2D([
      makeBone({ scaleX: 3, scaleY: 3 }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoScale }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Parent's 3× scale removed → the child's world linear part is unit (identity here, no rotation).
    expect(out.a).toBeCloseTo(1, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(1, 5);
  });

  it('NoRotationOrReflection keeps the parent scale but strips its rotation', () => {
    const s = createSkeleton2D([
      makeBone({ rotation: 90, scaleX: 2, scaleY: 2 }),
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoRotationOrReflection }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Parent's 90° rotation removed, its 2× scale kept → axis-aligned 2× world.
    expect(out.a).toBeCloseTo(2, 5);
    expect(out.b).toBeCloseTo(0, 5);
    expect(out.c).toBeCloseTo(0, 5);
    expect(out.d).toBeCloseTo(2, 5);
  });

  it('NoScaleOrReflection never flips the child under a reflected parent', () => {
    const s = createSkeleton2D([
      makeBone({ scaleX: -2, scaleY: 2 }), // reflected (negative X scale)
      makeBone({ parentIndex: 0, transformMode: TransformMode2D.NoScaleOrReflection }),
    ]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    getSkeleton2DBoneWorldMatrix(out, s, 1);
    // Determinant stays positive (no reflection) and unit magnitude (no scale).
    const det = out.a * out.d - out.c * out.b;
    expect(det).toBeCloseTo(1, 5);
  });
});

describe('createSkeleton2D', () => {
  it('sizes the flat buffers to 6 floats per bone', () => {
    const s = createSkeleton2D([makeBone(), makeBone({ parentIndex: 0 })]);
    expect(s.worldMatrices.length).toBe(12);
    expect(s.inverseBindMatrices.length).toBe(12);
    expect(s.boneMatrices.length).toBe(12);
    expect(s.slots).toBeNull();
  });
});

describe('disposeSkeleton2D', () => {
  it('clears bones and slots for GC', () => {
    const s = createSkeleton2D([makeBone()], []);
    disposeSkeleton2D(s);
    expect(s.bones.length).toBe(0);
    expect(s.slots).toBeNull();
  });
});

describe('equalsSkeleton2D', () => {
  it('is true for a fresh clone and false after a bone edit', () => {
    const s = createSkeleton2D([makeBone({ rotation: 15 })]);
    const c = cloneSkeleton2D(s);
    expect(equalsSkeleton2D(s, c)).toBe(true);
    c.bones[0].rotation = 16;
    expect(equalsSkeleton2D(s, c)).toBe(false);
  });
});

describe('getSkeleton2DBoneIndexByName', () => {
  it('finds a named bone and returns -1 for a miss', () => {
    const s = createSkeleton2D([makeBone({ name: 'root' }), makeBone({ parentIndex: 0, name: 'arm' })]);
    expect(getSkeleton2DBoneIndexByName(s, 'arm')).toBe(1);
    expect(getSkeleton2DBoneIndexByName(s, 'leg')).toBe(-1);
  });
});

describe('getSkeleton2DBoneWorldMatrix', () => {
  it('writes the world matrix in range and returns false out of range', () => {
    const s = createSkeleton2D([makeBone({ x: 7 })]);
    computeSkeleton2DWorldTransforms(s);
    const out = createMatrix();
    expect(getSkeleton2DBoneWorldMatrix(out, s, 0)).toBe(true);
    expect(out.tx).toBeCloseTo(7, 5);
    expect(getSkeleton2DBoneWorldMatrix(out, s, 5)).toBe(false);
    expect(getSkeleton2DBoneWorldMatrix(out, s, -1)).toBe(false);
  });
});

describe('setSkeleton2DBindPose', () => {
  it('captures the inverse of the current world so the palette is identity at bind', () => {
    const s = createSkeleton2D([makeBone({ x: 4, rotation: 60, scaleX: 2 })]);
    computeSkeleton2DWorldTransforms(s);
    setSkeleton2DBindPose(s);
    computeSkeleton2DBoneMatrices(s);
    expect(s.boneMatrices[0]).toBeCloseTo(1, 4);
    expect(s.boneMatrices[3]).toBeCloseTo(1, 4);
    expect(s.boneMatrices[4]).toBeCloseTo(0, 4);
    expect(s.boneMatrices[5]).toBeCloseTo(0, 4);
  });
});

describe('validateSkeleton2D', () => {
  it('returns null for a valid parent-before-child skeleton', () => {
    const s = createSkeleton2D([makeBone(), makeBone({ parentIndex: 0 })]);
    expect(validateSkeleton2D(s)).toBeNull();
  });

  it('reports a child whose parentIndex is not before it', () => {
    const s = createSkeleton2D([makeBone({ parentIndex: 1 }), makeBone({ parentIndex: 0 })]);
    expect(validateSkeleton2D(s)).toContain('parent-before-child');
  });

  it('reports a mis-sized buffer', () => {
    const s = createSkeleton2D([makeBone()]);
    s.worldMatrices = new Float32Array(3);
    expect(validateSkeleton2D(s)).toContain('worldMatrices');
  });
});
