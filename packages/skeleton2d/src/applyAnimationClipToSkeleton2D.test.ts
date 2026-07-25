import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import type { Bone2D } from '@flighthq/types';
import { AnimationInterpolationLinear, Skeleton2DAnimationPath, TransformMode2D } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { applyAnimationClipToSkeleton2D } from './applyAnimationClipToSkeleton2D';
import { createSkeleton2D } from './skeleton2d';

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
  it('samples a rotation track into the target bone at the given time', () => {
    const s = createSkeleton2D([makeBone()]);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { boneIndex: 0, path: Skeleton2DAnimationPath.Rotation }),
    ]);
    applyAnimationClipToSkeleton2D(clip, s, 0.5);
    expect(s.bones[0].rotation).toBeCloseTo(45, 5); // linear 0→90 at t=0.5
  });

  it('drives translation, scale, and shear across their two-component paths', () => {
    const s = createSkeleton2D([makeBone()]);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 0, 10, 20], 2), {
        boneIndex: 0,
        path: Skeleton2DAnimationPath.Translation,
      }),
      createAnimationChannel(scalarTrack([0, 1], [1, 1, 3, 4], 2), {
        boneIndex: 0,
        path: Skeleton2DAnimationPath.Scale,
      }),
      createAnimationChannel(scalarTrack([0, 1], [0, 0, 5, 6], 2), {
        boneIndex: 0,
        path: Skeleton2DAnimationPath.Shear,
      }),
    ]);
    applyAnimationClipToSkeleton2D(clip, s, 1);
    expect(s.bones[0].x).toBeCloseTo(10, 5);
    expect(s.bones[0].y).toBeCloseTo(20, 5);
    expect(s.bones[0].scaleX).toBeCloseTo(3, 5);
    expect(s.bones[0].scaleY).toBeCloseTo(4, 5);
    expect(s.bones[0].shearX).toBeCloseTo(5, 5);
    expect(s.bones[0].shearY).toBeCloseTo(6, 5);
  });

  it('skips a channel with a foreign target or an out-of-range bone (no throw, no mutation)', () => {
    const s = createSkeleton2D([makeBone({ rotation: 7 })]);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { someOtherTarget: true }),
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { boneIndex: 9, path: Skeleton2DAnimationPath.Rotation }),
    ]);
    applyAnimationClipToSkeleton2D(clip, s, 1);
    expect(s.bones[0].rotation).toBe(7); // untouched
  });
});
