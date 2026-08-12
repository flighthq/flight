import type { Bone2D, Skeleton2D, Skeleton2DIkConstraint } from '@flighthq/types/contract';
import { Skeleton2DConstraintKind, TransformMode2D } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { registerSkeleton2DIkConstraintSolver, solveSkeleton2DIkConstraint } from './ikConstraint2D';
import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import {
  getSkeleton2DConstraintSolver,
  registerSkeleton2DConstraintSolver,
  solveSkeleton2DConstraints,
  unregisterSkeleton2DConstraintSolver,
} from './skeleton2dConstraint';

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

function ik(overrides: Partial<Skeleton2DIkConstraint> = {}): Skeleton2DIkConstraint {
  return {
    bendPositive: true,
    boneIndices: [0],
    compress: false,
    kind: Skeleton2DConstraintKind.Ik as 'Skeleton2D.IkConstraint',
    mix: 1,
    stretch: false,
    targetBoneIndex: 1,
    ...overrides,
  };
}

// The world position of a bone's TIP — its origin plus its length along its own x axis. That is the point
// IK actually places, so it is what the two-bone assertions check rather than a joint angle.
function tipOf(skeleton: Readonly<Skeleton2D>, boneIndex: number): { x: number; y: number } {
  const world = skeleton.worldMatrices;
  const o = boneIndex * 6;
  const length = skeleton.bones[boneIndex].length;
  return { x: world[o] * length + world[o + 4], y: world[o + 1] * length + world[o + 5] };
}

// This file registers a built-in solver into a module-global registry, so it restores whatever it found
// rather than leaving the kind claimed for whichever file runs next.
const PRIOR = getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Ik);

afterEach(() => {
  if (PRIOR === null) unregisterSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Ik);
  else registerSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Ik, PRIOR);
});

describe('registerSkeleton2DIkConstraintSolver', () => {
  it('claims the IK kind, which nothing does until a caller opts in', () => {
    unregisterSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Ik);
    expect(getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Ik)).toBeNull();

    registerSkeleton2DIkConstraintSolver();

    expect(getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Ik)).toBe(solveSkeleton2DIkConstraint);
  });

  it('reaches the solver through solveSkeleton2DConstraints once registered', () => {
    registerSkeleton2DIkConstraintSolver();
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 0, y: 20 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DConstraints(skeleton, [ik()]);

    expect(skeleton.bones[0].rotation).toBeCloseTo(90, 5);
  });
});

describe('solveSkeleton2DIkConstraint', () => {
  it('aims a single bone at the target, in degrees', () => {
    // Target straight above the bone's origin, so the bone's +x axis has to turn a quarter turn.
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 0, y: 7 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik());

    expect(skeleton.bones[0].rotation).toBeCloseTo(90, 5);
  });

  it('blends by mix, so a half-applied constraint turns half as far', () => {
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 0, y: 7 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ mix: 0.5 }));

    expect(skeleton.bones[0].rotation).toBeCloseTo(45, 5);
  });

  it('takes the short way round rather than spinning the long way past 180 degrees', () => {
    // Posed at 170°, target at -170°: the short way is 20° forward, the naive difference is 340° back.
    const skeleton = createSkeleton2D([
      makeBone({ length: 10, rotation: 170 }),
      makeBone({ x: Math.cos(-170 * (Math.PI / 180)), y: Math.sin(-170 * (Math.PI / 180)) }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ mix: 0.5 }));

    // Half of a +20° turn, not half of a -340° one.
    expect(skeleton.bones[0].rotation).toBeCloseTo(180, 5);
  });

  it('solves in the PARENT space, so a rotated parent does not double-count its own rotation', () => {
    // Parent rotated 90°; the child bone must end up aiming at a target on the world +x axis, which is the
    // parent's local -y. Its local rotation is therefore -90, not 0.
    const skeleton = createSkeleton2D([
      makeBone({ length: 10, rotation: 90 }),
      makeBone({ length: 10, parentIndex: 0 }),
      makeBone({ x: 30, y: 0 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ boneIndices: [1], targetBoneIndex: 2 }));

    expect(skeleton.bones[1].rotation).toBeCloseTo(-90, 5);
  });

  it('lengthens a single bone onto a target past its reach when stretch is on', () => {
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 25, y: 0 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ stretch: true }));

    expect(tipOf(skeleton, 0).x).toBeCloseTo(25, 4);
    expect(skeleton.bones[0].scaleX).toBeCloseTo(2.5, 5);
    // Uniform, not axial. Only scaleX changes how far the tip reaches, so scaling scaleY with it is a
    // deliberate choice to keep the bone's proportions rather than draw it stretched thin — the same
    // choice the two-bone path makes on its parent. Pinned because nothing else would notice it going.
    expect(skeleton.bones[0].scaleY).toBeCloseTo(2.5, 5);
  });

  it('shortens a single bone onto a target inside its reach when compress is on', () => {
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 4, y: 0 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ compress: true }));

    expect(tipOf(skeleton, 0).x).toBeCloseTo(4, 4);
    expect(skeleton.bones[0].scaleX).toBeCloseTo(0.4, 5);
  });

  // The two halves are separate permissions, not one "resize" switch, and nothing pinned that. Each case
  // below is the OTHER flag's direction: a stretch-only bone asked to shorten, and a compress-only bone
  // asked to lengthen. Both must sit at their authored length and overshoot or fall short, because a limb
  // that may only extend has no business contracting.
  it('leaves a stretch-only bone at its own length when the target is nearer than its tip', () => {
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 4, y: 0 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ stretch: true }));

    expect(skeleton.bones[0].scaleX).toBe(1);
    expect(tipOf(skeleton, 0).x).toBeCloseTo(10, 4);
  });

  it('leaves a compress-only bone at its own length when the target is past its tip', () => {
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 25, y: 0 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ compress: true }));

    expect(skeleton.bones[0].scaleX).toBe(1);
    expect(tipOf(skeleton, 0).x).toBeCloseTo(10, 4);
  });

  // Resizing blends by mix on its own terms rather than riding the rotation blend: the target is straight
  // ahead, so there is no rotation to blend and the only thing mix can be scaling here is the stretch.
  it('blends the stretch by mix, so a half-applied constraint reaches half the extra distance', () => {
    const skeleton = createSkeleton2D([makeBone({ length: 10 }), makeBone({ x: 25, y: 0 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ mix: 0.5, stretch: true }));

    // wanted = 2.5, so a half-applied scale is 1 + (2.5 - 1) * 0.5 = 1.75.
    expect(skeleton.bones[0].scaleX).toBeCloseTo(1.75, 5);
    expect(tipOf(skeleton, 0).x).toBeCloseTo(17.5, 4);
  });

  it('lands a two-bone chain tip on a target inside its reach', () => {
    const skeleton = createSkeleton2D([
      makeBone({ length: 10 }),
      makeBone({ length: 10, parentIndex: 0, x: 10 }),
      makeBone({ x: 12, y: 6 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ boneIndices: [0, 1], targetBoneIndex: 2 }));
    computeSkeleton2DWorldTransforms(skeleton);

    const tip = tipOf(skeleton, 1);
    expect(tip.x).toBeCloseTo(12, 4);
    expect(tip.y).toBeCloseTo(6, 4);
  });

  it('mirrors the elbow with bendPositive while still landing the tip on the target', () => {
    const build = (bendPositive: boolean): Skeleton2D => {
      const skeleton = createSkeleton2D([
        makeBone({ length: 10 }),
        makeBone({ length: 10, parentIndex: 0, x: 10 }),
        makeBone({ x: 12, y: 6 }),
      ]);
      computeSkeleton2DWorldTransforms(skeleton);
      solveSkeleton2DIkConstraint(skeleton, ik({ bendPositive, boneIndices: [0, 1], targetBoneIndex: 2 }));
      computeSkeleton2DWorldTransforms(skeleton);
      return skeleton;
    };
    const up = build(true);
    const down = build(false);

    // Same tip, opposite joint: the two solutions are mirror images about the origin-to-target line.
    expect(tipOf(up, 1).x).toBeCloseTo(tipOf(down, 1).x, 4);
    expect(tipOf(up, 1).y).toBeCloseTo(tipOf(down, 1).y, 4);
    expect(up.worldMatrices[1 * 6 + 5]).not.toBeCloseTo(down.worldMatrices[1 * 6 + 5], 2);
  });

  // The other unreachable case, and the one with no test: a target too CLOSE rather than too far. Unequal
  // bone lengths leave a dead zone around the parent's origin — a 10 and a 6 fold down to 4 and no further
  // — so the tip overshoots a target inside it however hard the joint bends. Asserted as a position rather
  // than as the joint angle, because the position is the thing a rig author sees go wrong.
  //
  // This pins the BEHAVIOR, not the branch that produces it: the solver's explicit dead-zone case and its
  // general law-of-cosines case agree here, because the general case clamps its acos arguments into range
  // and that clamping lands on the same fold. Deleting the dead-zone branch leaves this test green.
  it('folds as far as it can and overshoots a target inside the dead zone', () => {
    const skeleton = createSkeleton2D([
      makeBone({ length: 10 }),
      makeBone({ length: 6, parentIndex: 0, x: 10 }),
      makeBone({ x: 2, y: 0 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ boneIndices: [0, 1], targetBoneIndex: 2 }));
    computeSkeleton2DWorldTransforms(skeleton);

    // Folded flat: the joint sits at the parent's full 10, and the child doubles back its whole 6 to 4 —
    // still 2 past the target at 2, which is the closest this chain can physically come.
    expect(skeleton.worldMatrices[1 * 6 + 4]).toBeCloseTo(10, 4);
    expect(tipOf(skeleton, 1).x).toBeCloseTo(4, 4);
    expect(tipOf(skeleton, 1).y).toBeCloseTo(0, 4);
  });

  it('straightens and falls short of an unreachable target when stretch is off', () => {
    const skeleton = createSkeleton2D([
      makeBone({ length: 10 }),
      makeBone({ length: 10, parentIndex: 0, x: 10 }),
      makeBone({ x: 40, y: 0 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ boneIndices: [0, 1], targetBoneIndex: 2 }));
    computeSkeleton2DWorldTransforms(skeleton);

    // Fully extended to 20 along the aim direction, 20 short of the target rather than reaching it.
    expect(tipOf(skeleton, 1).x).toBeCloseTo(20, 4);
    expect(tipOf(skeleton, 1).y).toBeCloseTo(0, 4);
  });

  it('reaches an unreachable target when stretch is on, by scaling the chain', () => {
    const skeleton = createSkeleton2D([
      makeBone({ length: 10 }),
      makeBone({ length: 10, parentIndex: 0, x: 10 }),
      makeBone({ x: 40, y: 0 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ boneIndices: [0, 1], stretch: true, targetBoneIndex: 2 }));
    computeSkeleton2DWorldTransforms(skeleton);

    expect(tipOf(skeleton, 1).x).toBeCloseTo(40, 4);
    expect(skeleton.bones[0].scaleX).toBeCloseTo(2, 5);
  });

  it('skips a chain length it does not solve rather than posing something wrong', () => {
    const skeleton = createSkeleton2D([
      makeBone({ length: 10 }),
      makeBone({ length: 10, parentIndex: 0, x: 10 }),
      makeBone({ length: 10, parentIndex: 1, x: 10 }),
      makeBone({ x: 5, y: 5 }),
    ]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DIkConstraint(skeleton, ik({ boneIndices: [0, 1, 2], targetBoneIndex: 3 }));

    expect(skeleton.bones[0].rotation).toBe(0);
  });

  it('skips a target index outside the bone array', () => {
    const skeleton = createSkeleton2D([makeBone({ length: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    expect(() => solveSkeleton2DIkConstraint(skeleton, ik({ targetBoneIndex: 9 }))).not.toThrow();
    expect(skeleton.bones[0].rotation).toBe(0);
  });
});
