import type { Bone2D, PathAttachment2D, Skeleton2D, Skeleton2DPathConstraint, Slot2D } from '@flighthq/types/contract';
import {
  PathAttachment2DKind,
  PathCommand,
  Skeleton2DConstraintKind,
  Skeleton2DPathPositionMode,
  Skeleton2DPathRotateMode,
  Skeleton2DPathSpacingMode,
  TransformMode2D,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { registerSkeleton2DPathConstraintSolver, solveSkeleton2DPathConstraint } from './pathConstraint2D';
import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import {
  getSkeleton2DConstraintSolver,
  registerSkeleton2DConstraintSolver,
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

// A rigid straight path from (0,0) to (100,0) — 100 units of arc length, so a distance IS an x coordinate
// and every assertion below can be read off by hand.
function straightPath(): PathAttachment2D {
  return {
    commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO],
    kind: PathAttachment2DKind,
    pointCount: 2,
    skin: null,
    vertices: new Float32Array([0, 0, 100, 0]),
    winding: 'nonZero',
  };
}

function pathSlot(attachment: PathAttachment2D | null): Slot2D {
  return { attachment, boneIndex: 0, color: 0xffffffff, name: 'path' };
}

function constraint(overrides: Partial<Skeleton2DPathConstraint> = {}): Skeleton2DPathConstraint {
  return {
    boneIndices: [1],
    kind: Skeleton2DConstraintKind.Path as 'Skeleton2D.PathConstraint',
    mix: 1,
    mixRotate: 0,
    mixX: 1,
    mixY: 1,
    position: 0,
    positionMode: Skeleton2DPathPositionMode.Fixed,
    rotateMode: Skeleton2DPathRotateMode.Tangent,
    spacing: 0,
    spacingMode: Skeleton2DPathSpacingMode.Fixed,
    targetSlotIndex: 0,
    ...overrides,
  };
}

// Bone 0 carries the path slot; bones 1..n are the chain laid along it.
function rig(chainLength: number, attachment: PathAttachment2D | null = straightPath()): Skeleton2D {
  const bones = [makeBone()];
  for (let i = 0; i < chainLength; i++) bones.push(makeBone({ length: 10 }));
  const skeleton = createSkeleton2D(bones, [pathSlot(attachment)]);
  computeSkeleton2DWorldTransforms(skeleton);
  return skeleton;
}

// This file registers a built-in solver into a module-global registry, so it restores whatever it found
// rather than leaving the kind claimed for whichever file runs next.
const PRIOR = getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path);

afterEach(() => {
  if (PRIOR === null) unregisterSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path);
  else registerSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path, PRIOR);
});

describe('registerSkeleton2DPathConstraintSolver', () => {
  it('claims the path kind, which nothing does until a caller opts in', () => {
    unregisterSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path);
    expect(getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path)).toBeNull();

    registerSkeleton2DPathConstraintSolver();

    expect(getSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path)).toBe(solveSkeleton2DPathConstraint);
    unregisterSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path);
  });
});

describe('solveSkeleton2DPathConstraint', () => {
  it('places a bone at a fixed arc-length position along the path', () => {
    const skeleton = rig(1);

    solveSkeleton2DPathConstraint(skeleton, constraint({ position: 25 }));

    expect(skeleton.bones[1].x).toBeCloseTo(25, 4);
    expect(skeleton.bones[1].y).toBeCloseTo(0, 4);
  });

  it('reads position as a fraction of the whole path in Percent mode', () => {
    const skeleton = rig(1);

    solveSkeleton2DPathConstraint(
      skeleton,
      constraint({ position: 0.25, positionMode: Skeleton2DPathPositionMode.Percent }),
    );

    expect(skeleton.bones[1].x).toBeCloseTo(25, 4);
  });

  it('spaces a chain by fixed arc length', () => {
    const skeleton = rig(3);

    solveSkeleton2DPathConstraint(skeleton, constraint({ boneIndices: [1, 2, 3], position: 10, spacing: 20 }));

    expect(skeleton.bones[1].x).toBeCloseTo(10, 4);
    expect(skeleton.bones[2].x).toBeCloseTo(30, 4);
    expect(skeleton.bones[3].x).toBeCloseTo(50, 4);
  });

  it('spaces by each bone own length in Length mode, which is what keeps a chain jointed', () => {
    const skeleton = rig(2);
    skeleton.bones[1].length = 40;
    skeleton.bones[2].length = 10;

    solveSkeleton2DPathConstraint(
      skeleton,
      constraint({ boneIndices: [1, 2], spacing: 1, spacingMode: Skeleton2DPathSpacingMode.Length }),
    );

    // The gap after bone 1 is bone 1's own length, not a shared constant.
    expect(skeleton.bones[1].x).toBeCloseTo(0, 4);
    expect(skeleton.bones[2].x).toBeCloseTo(40, 4);
  });

  it('clamps a chain that runs off the end rather than wrapping it to the other end', () => {
    const skeleton = rig(2);

    solveSkeleton2DPathConstraint(skeleton, constraint({ boneIndices: [1, 2], position: 90, spacing: 40 }));

    expect(skeleton.bones[1].x).toBeCloseTo(90, 4);
    expect(skeleton.bones[2].x).toBeCloseTo(100, 4);
  });

  it('aims a bone along the path tangent when rotateMode is Tangent', () => {
    const skeleton = rig(1, {
      commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO],
      kind: PathAttachment2DKind,
      pointCount: 2,
      skin: null,
      // Straight up, so the tangent is a quarter turn from the bone's setup direction.
      vertices: new Float32Array([0, 0, 0, 100]),
      winding: 'nonZero',
    });

    solveSkeleton2DPathConstraint(skeleton, constraint({ mixRotate: 1, position: 10 }));

    expect(skeleton.bones[1].rotation).toBeCloseTo(90, 4);
    expect(skeleton.bones[1].y).toBeCloseTo(10, 4);
  });

  it('aims each bone at the NEXT one in Chain mode, sampling every position before moving any', () => {
    const skeleton = rig(2, {
      commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO],
      kind: PathAttachment2DKind,
      pointCount: 3,
      skin: null,
      // An L: 50 along +x, then 50 along +y. A chain straddling the corner aims across it.
      vertices: new Float32Array([0, 0, 50, 0, 50, 50]),
      winding: 'nonZero',
    });

    solveSkeleton2DPathConstraint(
      skeleton,
      constraint({
        boneIndices: [1, 2],
        mixRotate: 1,
        position: 30,
        rotateMode: Skeleton2DPathRotateMode.Chain,
        spacing: 40,
      }),
    );

    // Bone 1 sits at (30,0) and bone 2 at (50,20); the chain angle between them is atan2(20, 20) = 45°,
    // which no tangent anywhere on this path equals — so this can only pass if Chain mode is real.
    expect(skeleton.bones[1].x).toBeCloseTo(30, 4);
    expect(skeleton.bones[2].x).toBeCloseTo(50, 4);
    expect(skeleton.bones[2].y).toBeCloseTo(20, 4);
    expect(skeleton.bones[1].rotation).toBeCloseTo(45, 4);
  });

  it('blends position by mix, leaving the bone partway toward the path', () => {
    const skeleton = rig(1);
    skeleton.bones[1].x = 0;

    solveSkeleton2DPathConstraint(skeleton, constraint({ mix: 0.5, position: 40 }));

    expect(skeleton.bones[1].x).toBeCloseTo(20, 4);
  });

  it('skips a slot wearing no path rather than posing anything', () => {
    const skeleton = rig(1, null);

    expect(() => solveSkeleton2DPathConstraint(skeleton, constraint({ position: 25 }))).not.toThrow();
    expect(skeleton.bones[1].x).toBe(0);
  });

  it('skips a slot index outside the slot array', () => {
    const skeleton = rig(1);

    expect(() => solveSkeleton2DPathConstraint(skeleton, constraint({ targetSlotIndex: 9 }))).not.toThrow();
    expect(skeleton.bones[1].x).toBe(0);
  });

  it('follows the path AS POSED, so a moved path drags the chain with it', () => {
    const skeleton = rig(1);
    // Move the bone the path slot hangs off; the path is rigid to it, so it travels.
    skeleton.bones[0].y = 60;
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DPathConstraint(skeleton, constraint({ position: 25 }));

    expect(skeleton.bones[1].x).toBeCloseTo(25, 4);
    expect(skeleton.bones[1].y).toBeCloseTo(60, 4);
  });
});
