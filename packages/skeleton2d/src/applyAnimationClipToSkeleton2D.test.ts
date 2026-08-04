import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import type { Bone2D } from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  Skeleton2DAnimationPath,
  Skeleton2DSlotAnimationPath,
  TransformMode2D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { applyAnimationClipToSkeleton2D } from './applyAnimationClipToSkeleton2D';
import { cloneSkeleton2D, createSkeleton2D } from './skeleton2d';
import { createSkeleton2DBoneAnimationTarget, createSkeleton2DSlotAnimationTarget } from './skeleton2dAnimationTarget';

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
      createAnimationChannel(
        scalarTrack([0, 1], [0, 90], 1),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Rotation),
      ),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 0.5);
    expect(pose.bones[0].rotation).toBeCloseTo(55, 5); // setup 10 + delta 45 (linear 0→90 at t=0.5)
    expect(setup.bones[0].rotation).toBe(10); // the rest pose is read-only, unchanged
  });

  it('adds translation/shear deltas and multiplies scale deltas onto setup', () => {
    const setup = createSkeleton2D([makeBone({ x: 5, y: -2, scaleX: 2, scaleY: 3, shearX: 1, shearY: 4 })]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        scalarTrack([0, 1], [0, 0, 10, 20], 2),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Translation),
      ),
      createAnimationChannel(
        scalarTrack([0, 1], [1, 1, 3, 0.5], 2),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Scale),
      ),
      createAnimationChannel(
        scalarTrack([0, 1], [0, 0, 5, 6], 2),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Shear),
      ),
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
      createAnimationChannel(
        scalarTrack([0, 1], [0, 90], 1),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Rotation),
      ),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1); // 10 + 90 = 100
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1); // composes from setup again → still 100, not 190
    expect(pose.bones[0].rotation).toBeCloseTo(100, 5);
  });

  it('throws when setup and pose are the same skeleton (aliasing would corrupt the rest pose)', () => {
    const s = createSkeleton2D([makeBone({ rotation: 10 })]);
    const clip = createAnimationClip([
      createAnimationChannel(
        scalarTrack([0, 1], [0, 90], 1),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Rotation),
      ),
    ]);
    expect(() => applyAnimationClipToSkeleton2D(clip, s, s, 1)).toThrow(/distinct skeletons/);
  });

  it('skips a channel with a foreign target or an out-of-range bone (no throw, no mutation)', () => {
    const setup = createSkeleton2D([makeBone({ rotation: 7 })]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(scalarTrack([0, 1], [0, 90], 1), { kind: 'acme.Unclaimed' }),
      createAnimationChannel(
        scalarTrack([0, 1], [0, 90], 1),
        createSkeleton2DBoneAnimationTarget(9, Skeleton2DAnimationPath.Rotation),
      ),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1);
    expect(pose.bones[0].rotation).toBe(7); // untouched
  });
});

describe('applyAnimationClipToSkeleton2D slot channels', () => {
  it('WRITES an absolute slot colour rather than composing it onto the setup colour', () => {
    // Composing would double-apply the tint; Spine and DragonBones both author colour absolutely.
    const setup = createSkeleton2D([makeBone()], [{ attachment: null, boneIndex: 0, color: 0x112233ff, name: 's' }]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ components: 4, times: [0, 1], values: [1, 0, 0, 1, 0, 0, 1, 1] }),
        createSkeleton2DSlotAnimationTarget(0, Skeleton2DSlotAnimationPath.Color),
      ),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 0);
    expect(pose.slots![0].color).toBe(0xff0000ff);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 1);
    expect(pose.slots![0].color).toBe(0x0000ffff);
    expect(setup.slots![0].color).toBe(0x112233ff); // setup untouched
  });

  it('interpolates colour channels between keyframes', () => {
    const setup = createSkeleton2D([makeBone()], [{ attachment: null, boneIndex: 0, color: 0, name: 's' }]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ components: 4, times: [0, 1], values: [0, 0, 0, 0, 1, 1, 1, 1] }),
        createSkeleton2DSlotAnimationTarget(0, Skeleton2DSlotAnimationPath.Color),
      ),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 0.5);
    expect(pose.slots![0].color).toBe(0x80808080); // 0.5 -> 127.5 rounds to 128 on every channel
  });

  it('CLAMPS an overshooting sample instead of letting it wrap the packed colour', () => {
    // An easing curve can legitimately overshoot its endpoints; 1.4 must saturate, not wrap to a low byte.
    const setup = createSkeleton2D([makeBone()], [{ attachment: null, boneIndex: 0, color: 0, name: 's' }]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ components: 4, times: [0], values: [1.4, -0.2, 1, 1] }),
        createSkeleton2DSlotAnimationTarget(0, Skeleton2DSlotAnimationPath.Color),
      ),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 0);
    expect(pose.slots![0].color).toBe(0xff00ffff);
  });

  it('ignores a slot channel whose index is out of range, or a skeleton with no slots', () => {
    const setup = createSkeleton2D([makeBone()], [{ attachment: null, boneIndex: 0, color: 0x010203ff, name: 's' }]);
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ components: 4, times: [0], values: [1, 1, 1, 1] }),
        createSkeleton2DSlotAnimationTarget(9, Skeleton2DSlotAnimationPath.Color),
      ),
    ]);
    expect(() => applyAnimationClipToSkeleton2D(clip, setup, pose, 0)).not.toThrow();
    expect(pose.slots![0].color).toBe(0x010203ff);

    const boneOnly = createSkeleton2D([makeBone()]);
    const bonePose = cloneSkeleton2D(boneOnly);
    expect(() => applyAnimationClipToSkeleton2D(clip, boneOnly, bonePose, 0)).not.toThrow();
  });

  it('drives bone and slot channels from ONE clip, dispatching on target kind', () => {
    const setup = createSkeleton2D(
      [makeBone({ rotation: 10 })],
      [{ attachment: null, boneIndex: 0, color: 0, name: 's' }],
    );
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ components: 1, times: [0], values: [90] }),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Rotation),
      ),
      createAnimationChannel(
        createAnimationTrack({ components: 4, times: [0], values: [1, 1, 1, 1] }),
        createSkeleton2DSlotAnimationTarget(0, Skeleton2DSlotAnimationPath.Color),
      ),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 0);
    expect(pose.bones[0].rotation).toBeCloseTo(100, 5); // bone still COMPOSES onto setup
    expect(pose.slots![0].color).toBe(0xffffffff); // slot WRITES
  });
});
