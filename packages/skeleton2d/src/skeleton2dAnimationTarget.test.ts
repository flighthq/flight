import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import type { Bone2D, Skeleton2D } from '@flighthq/types/contract';
import {
  Skeleton2DAnimationPath,
  Skeleton2DAnimationTargetKind,
  Skeleton2DSlotAnimationPath,
  TransformMode2D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { applyAnimationClipToSkeleton2D } from './applyAnimationClipToSkeleton2D';
import { cloneSkeleton2D, createSkeleton2D } from './skeleton2d';
import {
  createSkeleton2DBoneAnimationTarget,
  createSkeleton2DSlotAnimationTarget,
  findSkeleton2DStepKeyframe,
  getSkeleton2DAnimationTargetBinder,
  getSkeleton2DAnimationTargetBinderKinds,
  initializeSkeleton2DBoneAnimationTarget,
  initializeSkeleton2DSlotAnimationTarget,
  registerSkeleton2DAnimationTargetBinder,
  unregisterSkeleton2DAnimationTargetBinder,
} from './skeleton2dAnimationTarget';

describe('createSkeleton2DBoneAnimationTarget', () => {
  it('stamps the bone kind, which is what the binder dispatches on', () => {
    expect(createSkeleton2DBoneAnimationTarget(3, Skeleton2DAnimationPath.Rotation)).toMatchObject({
      boneIndex: 3,
      kind: Skeleton2DAnimationTargetKind.Bone,
      path: Skeleton2DAnimationPath.Rotation,
    });
  });
});

describe('createSkeleton2DSlotAnimationTarget', () => {
  it('stamps the slot kind and leaves the attachment table null for a colour channel', () => {
    expect(createSkeleton2DSlotAnimationTarget(2, Skeleton2DSlotAnimationPath.Color)).toMatchObject({
      attachments: null,
      kind: Skeleton2DAnimationTargetKind.Slot,
      path: Skeleton2DSlotAnimationPath.Color,
      slotIndex: 2,
    });
  });

  it('carries the lookup table an attachment channel resolves its indices through', () => {
    const table = [null];

    expect(createSkeleton2DSlotAnimationTarget(0, Skeleton2DSlotAnimationPath.Attachment, table).attachments).toBe(
      table,
    );
  });
});

describe('findSkeleton2DStepKeyframe', () => {
  it('returns the last keyframe at or before the time', () => {
    expect(findSkeleton2DStepKeyframe([0, 1, 2], 1.9)).toBe(1);
    expect(findSkeleton2DStepKeyframe([0, 1, 2], 2)).toBe(2);
  });

  it('holds the first keyframe before the track starts', () => {
    // A value has to be in effect at every time, so an early sample takes the first rather than none.
    expect(findSkeleton2DStepKeyframe([5, 9], 0)).toBe(0);
  });

  it('returns -1 for a track with no keyframes at all', () => {
    expect(findSkeleton2DStepKeyframe([], 0)).toBe(-1);
  });
});

describe('getSkeleton2DAnimationTargetBinder', () => {
  it('resolves the bone and slot binders without any caller opting in', () => {
    expect(getSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Bone)).not.toBeNull();
    expect(getSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Slot)).not.toBeNull();
  });

  it('returns null for a kind nothing has claimed', () => {
    expect(getSkeleton2DAnimationTargetBinder('acme.RopeTarget')).toBeNull();
  });
});

describe('getSkeleton2DAnimationTargetBinderKinds', () => {
  it('enumerates sorted bound kinds and stops naming one after it is unregistered', () => {
    registerSkeleton2DAnimationTargetBinder('acme.RopeTarget', () => {});
    expect(getSkeleton2DAnimationTargetBinderKinds()).toEqual([
      Skeleton2DAnimationTargetKind.Bone,
      Skeleton2DAnimationTargetKind.Slot,
      'acme.RopeTarget',
    ]);

    unregisterSkeleton2DAnimationTargetBinder('acme.RopeTarget');

    expect(getSkeleton2DAnimationTargetBinderKinds()).toEqual([
      Skeleton2DAnimationTargetKind.Bone,
      Skeleton2DAnimationTargetKind.Slot,
    ]);
  });
});

describe('initializeSkeleton2DBoneAnimationTarget', () => {
  it('is the construction initializer of createSkeleton2DBoneAnimationTarget', () => {
    expect(typeof initializeSkeleton2DBoneAnimationTarget).toBe('function');
  });
});

describe('initializeSkeleton2DSlotAnimationTarget', () => {
  it('is the construction initializer of createSkeleton2DSlotAnimationTarget', () => {
    expect(typeof initializeSkeleton2DSlotAnimationTarget).toBe('function');
  });
});

function makeBone(): Bone2D {
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
  };
}

function makeSkeleton(): Skeleton2D {
  return createSkeleton2D([makeBone()], [{ attachment: null, boneIndex: 0, color: 0xffffffff, name: 's' }]);
}

function track(times: number[], values: number[], components: number) {
  return createAnimationTrack({ components, times, values });
}
describe('registerSkeleton2DAnimationTargetBinder', () => {
  it('binds a family this package does not own from the same single pass as bones', () => {
    const seen: number[] = [];
    registerSkeleton2DAnimationTargetBinder('acme.RopeTarget', (channel, _setup, _pose, target, time) => {
      seen.push(channel.track.times.length, (target as { slack: number }).slack, time);
    });
    const setup = makeSkeleton();
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        track([0, 1], [0, 90], 1),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Rotation),
      ),
      createAnimationChannel(track([0], [0], 1), { kind: 'acme.RopeTarget', slack: 7 }),
    ]);

    applyAnimationClipToSkeleton2D(clip, setup, pose, 1);
    unregisterSkeleton2DAnimationTargetBinder('acme.RopeTarget');

    // The bone channel still posed, so registering a foreign family adds a lane rather than replacing one.
    expect(pose.bones[0].rotation).toBeCloseTo(90, 5);
    expect(seen).toEqual([1, 7, 1]);
  });

  it('takes the last registration for a kind, so a caller can replace a built-in binding', () => {
    const original = getSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Bone)!;
    let called = 0;
    registerSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Bone, () => {
      called++;
    });
    const setup = makeSkeleton();
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([
      createAnimationChannel(
        track([0, 1], [0, 90], 1),
        createSkeleton2DBoneAnimationTarget(0, Skeleton2DAnimationPath.Rotation),
      ),
    ]);

    applyAnimationClipToSkeleton2D(clip, setup, pose, 1);
    registerSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Bone, original);

    expect(called).toBe(1);
    expect(pose.bones[0].rotation).toBe(0);
  });
});

describe('unregisterSkeleton2DAnimationTargetBinder', () => {
  it('releases a kind, after which its channels are skipped rather than throwing', () => {
    registerSkeleton2DAnimationTargetBinder('acme.RopeTarget', () => {});
    unregisterSkeleton2DAnimationTargetBinder('acme.RopeTarget');
    const setup = makeSkeleton();
    const pose = cloneSkeleton2D(setup);
    const clip = createAnimationClip([createAnimationChannel(track([0], [0], 1), { kind: 'acme.RopeTarget' })]);

    expect(() => applyAnimationClipToSkeleton2D(clip, setup, pose, 0)).not.toThrow();
    expect(getSkeleton2DAnimationTargetBinder('acme.RopeTarget')).toBeNull();
  });
});
