import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import type { Bone2D } from '@flighthq/types/contract';
import { AnimationInterpolationLinear, Skeleton2DAnimationPath, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { applyAnimationClipToSkeleton2D } from './applyAnimationClipToSkeleton2D';
import { cloneSkeleton2D, createSkeleton2D } from './skeleton2d';

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

function scalarTrack(times: number[], values: number[], components: number) {
  return createAnimationTrack({ times, values, components, interpolation: AnimationInterpolationLinear });
}

describe('applyAnimationClipToSkeleton2D', () => {
  it('composes a rotation delta onto the setup pose (setup + delta), leaving setup untouched', () => {
    const setup = createSkeleton2D([makeBone({ rotation: 10 })]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { boneIndex: 0, path: Skeleton2DAnimationPath.Rotation }),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 0.5);
    expect(pose.bones[0].rotation).toBeCloseTo(55, 5); // setup 10 + delta 45 (linear 0→90 at t=0.5)
    expect(setup.bones[0].rotation).toBe(10); // the rest pose is read-only, unchanged
  });

  it('adds translation/shear deltas and multiplies scale deltas onto setup', () => {
    const setup = createSkeleton2D([makeBone({ x: 5, y: -2, scaleX: 2, scaleY: 3, shearX: 1, shearY: 4 })]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 0, 10, 20], 2), {
        boneIndex: 0,
        path: Skeleton2DAnimationPath.Translation,
      }),
      createAnimationChannel(scalarTrack([0, 1], [1, 1, 3, 0.5], 2), {
        boneIndex: 0,
        path: Skeleton2DAnimationPath.Scale,
      }),
      createAnimationChannel(scalarTrack([0, 1], [0, 0, 5, 6], 2), {
        boneIndex: 0,
        path: Skeleton2DAnimationPath.Shear,
      }),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1);
    expect(pose.bones[0].x).toBeCloseTo(15, 5); // 5 + 10
    expect(pose.bones[0].y).toBeCloseTo(18, 5); // -2 + 20
    expect(pose.bones[0].scaleX).toBeCloseTo(6, 5); // 2 * 3 (multiplier)
    expect(pose.bones[0].scaleY).toBeCloseTo(1.5, 5); // 3 * 0.5 (multiplier)
    expect(pose.bones[0].shearX).toBeCloseTo(6, 5); // 1 + 5
    expect(pose.bones[0].shearY).toBeCloseTo(10, 5); // 4 + 6
  });

  it('re-applies from setup each frame — no accumulation across repeated calls', () => {
    const setup = createSkeleton2D([makeBone({ rotation: 10 })]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { boneIndex: 0, path: Skeleton2DAnimationPath.Rotation }),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1); // 10 + 90 = 100
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1); // composes from setup again → still 100, not 190
    expect(pose.bones[0].rotation).toBeCloseTo(100, 5);
  });

  it('skips a channel with a foreign target or an out-of-range bone (no throw, no mutation)', () => {
    const setup = createSkeleton2D([makeBone({ rotation: 7 })]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { someOtherTarget: true }),
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { boneIndex: 9, path: Skeleton2DAnimationPath.Rotation }),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1);
    expect(pose.bones[0].rotation).toBe(7); // untouched
  });
});
