import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
    const out = allocateEntity<PathAttachment2D>();
  out.commands = [PathCommand.MOVE_TO, PathCommand.LINE_TO];
  out.kind = PathAttachment2DKind;
  out.pointCount = 2;
  out.skin = null;
  out.vertices = new Float32Array([0, 0, 100, 0]);
  out.winding = 'nonZero' as const;
  return finishEntity(out) as PathAttachment2D;;
}

function constraint(overrides: Partial<Skeleton2DPathConstraint> = {}): Skeleton2DPathConstraint {
    const out = allocateEntity<PathAttachment2D>();
  out.boneIndices = [1];
  out.kind = Skeleton2DConstraintKind.Path as 'Skeleton2D.PathConstraint';
  out.mix = 1;
  out.mixRotate = 0;
  out.mixX = 1;
  out.mixY = 1;
  out.position = 0;
  out.positionMode = Skeleton2DPathPositionMode.Fixed;
  out.rotateMode = Skeleton2DPathRotateMode.Tangent;
  out.spacing = 0;
  out.spacingMode = Skeleton2DPathSpacingMode.Fixed;
  out.targetSlotIndex = 0;
  Object.assign(out, overrides);
  return finishEntity(out) as Skeleton2DPathConstraint;; bones 1..n are the chain laid along it.
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

  // The third spacing mode, and the one with no test: Fixed and Length were both pinned, Percent was not.
  // It is the mode that keeps a chain's proportions when the path is re-authored longer or shorter, which
  // is exactly the case a hardcoded arc length gets wrong.
  it('spaces a chain by a fraction of the whole path in Percent mode', () => {
    const skeleton = rig(3);

    solveSkeleton2DPathConstraint(
      skeleton,
      constraint({ boneIndices: [1, 2, 3], spacing: 0.2, spacingMode: Skeleton2DPathSpacingMode.Percent }),
    );

    // 0.2 of the path's 100 units is a 20-unit gap, independent of any bone's own length.
    expect(skeleton.bones[1].x).toBeCloseTo(0, 4);
    expect(skeleton.bones[2].x).toBeCloseTo(20, 4);
    expect(skeleton.bones[3].x).toBeCloseTo(40, 4);
  });

  // The sibling of the run-off-the-end case, which was pinned while this one was not.
  //
  // This pins the CONSTRAINT'S contract, not the local clamp: @flighthq/path's sampler clamps a negative
  // distance to the start of the first contour itself, so deleting `clampSkeleton2DPathDistance`'s negative
  // arm leaves this green. The local clamp stays anyway — the sampler's clamping is an implementation
  // choice inside another package rather than a documented promise, and a constraint that only works while
  // that choice holds is coupled to something it cannot see. Which is also why this test is worth having:
  // it fails if either layer ever starts extrapolating off the front.
  it('clamps a negative position to the start rather than sampling off the front of the path', () => {
    const skeleton = rig(2);

    solveSkeleton2DPathConstraint(skeleton, constraint({ boneIndices: [1, 2], position: -30, spacing: 40 }));

    expect(skeleton.bones[1].x).toBeCloseTo(0, 4);
    // The second sample is −30 + 40 = 10, which is on the path and so is NOT clamped: this pins that the
    // clamp is per sample rather than a shift of the whole chain onto the path.
    expect(skeleton.bones[2].x).toBeCloseTo(10, 4);
  });

  it('clamps a chain that runs off the end rather than wrapping it to the other end', () => {
    const skeleton = rig(2);

    solveSkeleton2DPathConstraint(skeleton, constraint({ boneIndices: [1, 2], position: 90, spacing: 40 }));

    expect(skeleton.bones[1].x).toBeCloseTo(90, 4);
    expect(skeleton.bones[2].x).toBeCloseTo(100, 4);
  });

  // A rotate-only constraint is an ordinary rig setup — follow the path's heading, keep your own position.
  // The bone is deliberately posed away from the path first, so leaving its position alone is something
  // the assertion can actually see.
  //
  // The zero-mix guard this reaches is a PERFORMANCE skip, not a behavioural one, and the test says so
  // rather than implying otherwise: running the translate block at mix 0 computes the bone's own current
  // world position and writes it straight back, so forcing the branch on leaves this green. What it saves
  // is an inverse-basis solve and a matrix rebuild per bone per frame for every rotate-only chain.
  it('turns a bone to the path without moving it when both translate mixes are zero', () => {
    const skeleton = rig(
      1,
      (() => { const out = allocateEntity<PathAttachment2D>(); out.commands = [PathCommand.MOVE_TO, PathCommand.LINE_TO]; out.kind = PathAttachment2DKind; out.pointCount = 2; out.skin = null; out.vertices = new Float32Array([0, 0, 0, 100]); out.winding = 'nonZero' as const; return finishEntity(out) as PathAttachment2D,; })()
    );
    skeleton.bones[1].x = 40;
    skeleton.bones[1].y = -7;
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DPathConstraint(skeleton, constraint({ mixRotate: 1, mixX: 0, mixY: 0, position: 10 }));

    expect(skeleton.bones[1].rotation).toBeCloseTo(90, 4);
    expect(skeleton.bones[1].x).toBe(40);
    expect(skeleton.bones[1].y).toBe(-7);
  });

  it('aims a bone along the path tangent when rotateMode is Tangent', () => {
    const skeleton = rig(
      1,
      (() => { const out = allocateEntity<PathAttachment2D>(); out.commands = [PathCommand.MOVE_TO, PathCommand.LINE_TO]; out.kind = PathAttachment2DKind; out.pointCount = 2; out.skin = null; out.vertices = new Float32Array([0, 0, 0, 100]); out.winding = 'nonZero' as const; return finishEntity(out) as PathAttachment2D,; })()
    );

    solveSkeleton2DPathConstraint(skeleton, constraint({ mixRotate: 1, position: 10 }));

    expect(skeleton.bones[1].rotation).toBeCloseTo(90, 4);
    expect(skeleton.bones[1].y).toBeCloseTo(10, 4);
  });

  it('aims each bone at the NEXT one in Chain mode, sampling every position before moving any', () => {
    const skeleton = rig(
      2,
      (() => { const out = allocateEntity<PathAttachment2D>(); out.commands = [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]; out.kind = PathAttachment2DKind; out.pointCount = 3; out.skin = null; out.vertices = new Float32Array([0, 0, 50, 0, 50, 50]); out.winding = 'nonZero' as const; return finishEntity(out) as PathAttachment2D,; })()
    );

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
