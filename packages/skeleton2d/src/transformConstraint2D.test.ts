import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bone2D, Skeleton2DTransformConstraint } from '@flighthq/types/contract';
import { Skeleton2DConstraintKind, TransformMode2D } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import {
  getSkeleton2DConstraintSolver,
  registerSkeleton2DConstraintSolver,
  unregisterSkeleton2DConstraintSolver,
} from './skeleton2dConstraint';
import {
  registerSkeleton2DTransformConstraintSolver,
  solveSkeleton2DTransformConstraint,
} from './transformConstraint2D';

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

// Every channel off by default, so each test turns on exactly the one it is about.
function transform(overrides: Partial<Skeleton2DTransformConstraint> = {}): Skeleton2DTransformConstraint {
    const out = allocateEntity<unknown>();
  out.boneIndices = [0];
  out.kind = Skeleton2DConstraintKind.Transform as 'Skeleton2D.TransformConstraint';
  out.mix = 1;
  out.mixRotate = 0;
  out.mixScaleX = 0;
  out.mixScaleY = 0;
  out.mixShearY = 0;
  out.mixX = 0;
  out.mixY = 0;
  out.offsetRotation = 0;
  out.offsetScaleX = 0;
  out.offsetScaleY = 0;
  out.offsetShearY = 0;
  out.offsetX = 0;
  out.offsetY = 0;
  out.targetBoneIndex = 1;
  Object.assign(out, overrides);
  return finishEntity(out) as Skeleton2DTransformConstraint;;

afterEach(() => {
  if (PRIOR === null) unregisterSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Transform);
  else registerSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Transform, PRIOR);
});

describe('registerSkeleton2DTransformConstraintSolver', () => {
  it('claims the transform kind, which nothing does until a caller opts in', () => {
    unregisterSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Transform);
    expect(getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Transform)).toBeNull();

    registerSkeleton2DTransformConstraintSolver();

    expect(getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Transform)).toBe(solveSkeleton2DTransformConstraint);
  });
});

describe('solveSkeleton2DTransformConstraint', () => {
  it('copies the target world rotation onto the constrained bone', () => {
    const skeleton = createSkeleton2D([makeBone(), makeBone({ rotation: 40 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ mixRotate: 1 }));

    expect(skeleton.bones[0].rotation).toBeCloseTo(40, 5);
  });

  it('leaves every channel it was not told to copy exactly as animation posed it', () => {
    const skeleton = createSkeleton2D([
      makeBone({ rotation: 10, scaleX: 3, x: 5 }),
      makeBone({ rotation: 40, scaleX: 2, x: 90 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ mixRotate: 1 }));

    expect(skeleton.bones[0].rotation).toBeCloseTo(40, 5);
    expect(skeleton.bones[0].scaleX).toBe(3);
    expect(skeleton.bones[0].x).toBe(5);
  });

  it('scales each channel mix by the constraint mix, so one field fades the whole thing', () => {
    const skeleton = createSkeleton2D([makeBone(), makeBone({ rotation: 40 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ mix: 0.5, mixRotate: 0.5 }));

    // 0.5 × 0.5 of the way from 0° to 40°.
    expect(skeleton.bones[0].rotation).toBeCloseTo(10, 5);
  });

  it('adds the rotation offset to the copied value rather than replacing it', () => {
    const skeleton = createSkeleton2D([makeBone(), makeBone({ rotation: 40 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ mixRotate: 1, offsetRotation: 25 }));

    expect(skeleton.bones[0].rotation).toBeCloseTo(65, 5);
  });

  // The constraint accepts SIX offsets and only offsetRotation above was pinned, which is the shape
  // AGENTS.md calls out by name: a field a caller sets, that the solver could quietly stop honouring with
  // nothing to notice. The rule is one rule — the constrained bone lands on the target's world value for
  // that channel PLUS the offset — so it is asserted once per channel from the same posed target rather
  // than as six unrelated numbers. The constrained bone is a root, so its local value is its world value
  // and each expectation is readable straight off the target's setup.
  it.each([
    ['rotation', { mixRotate: 1, offsetRotation: 25 }, 'rotation', 65],
    ['scaleX', { mixScaleX: 1, offsetScaleX: 0.5 }, 'scaleX', 2.5],
    ['scaleY', { mixScaleY: 1, offsetScaleY: 0.5 }, 'scaleY', 2.5],
    ['shearY', { mixShearY: 1, offsetShearY: 15 }, 'shearY', 25],
    ['x', { mixX: 1, offsetX: 7 }, 'x', 37],
    ['y', { mixY: 1, offsetY: 7 }, 'y', 19],
  ] as const)('offsets the copied %s by its own offset field', (_channel, overrides, field, expected) => {
    const target = makeBone({ rotation: 40, scaleX: 2, scaleY: 2, shearY: 10, x: 30, y: 12 });
    const skeleton = createSkeleton2D([makeBone(), target]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform(overrides));

    expect(skeleton.bones[0][field]).toBeCloseTo(expected, 4);
  });

  it('copies world position through the constrained bone PARENT basis, not field to field', () => {
    // The constrained bone hangs off a parent rotated 90°, so a world target of (0, 30) is local (30, 0)
    // to it. A field-to-field copy would have written (0, 30) and put the bone in the wrong place.
    const skeleton = createSkeleton2D([
      makeBone({ rotation: 90 }),
      makeBone({ parentIndex: 0 }),
      makeBone({ x: 0, y: 30 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ boneIndices: [1], mixX: 1, mixY: 1, targetBoneIndex: 2 }));
    computeSkeleton2DWorldTransforms(skeleton);

    expect(skeleton.bones[1].x).toBeCloseTo(30, 5);
    expect(skeleton.bones[1].y).toBeCloseTo(0, 5);
    expect(skeleton.worldMatrices[1 * 6 + 4]).toBeCloseTo(0, 5);
    expect(skeleton.worldMatrices[1 * 6 + 5]).toBeCloseTo(30, 5);
  });

  it('copies scale as a ratio of the current world scale, so a scaled parent is accounted for', () => {
    const skeleton = createSkeleton2D([makeBone(), makeBone({ scaleX: 4 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ mixScaleX: 1 }));

    expect(skeleton.bones[0].scaleX).toBeCloseTo(4, 5);
  });

  it('copies shear, which is the departure of the y axis from perpendicular', () => {
    const skeleton = createSkeleton2D([makeBone(), makeBone({ shearY: 20 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ mixShearY: 1 }));

    expect(skeleton.bones[0].shearY).toBeCloseTo(20, 5);
  });

  it('constrains every bone it names, not just the first', () => {
    const skeleton = createSkeleton2D([makeBone(), makeBone(), makeBone({ rotation: 40 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DTransformConstraint(skeleton, transform({ boneIndices: [0, 1], mixRotate: 1, targetBoneIndex: 2 }));

    expect(skeleton.bones[0].rotation).toBeCloseTo(40, 5);
    expect(skeleton.bones[1].rotation).toBeCloseTo(40, 5);
  });

  it('skips out-of-range bone and target indices rather than throwing', () => {
    const skeleton = createSkeleton2D([makeBone(), makeBone({ rotation: 40 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    expect(() =>
      solveSkeleton2DTransformConstraint(skeleton, transform({ boneIndices: [9], mixRotate: 1 })),
    ).not.toThrow();
    expect(() =>
      solveSkeleton2DTransformConstraint(skeleton, transform({ mixRotate: 1, targetBoneIndex: 9 })),
    ).not.toThrow();
    expect(skeleton.bones[0].rotation).toBe(0);
  });
});
