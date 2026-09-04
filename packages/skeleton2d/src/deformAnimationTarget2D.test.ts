import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import { createEntity } from '@flighthq/entity/contract';
import type { Bone2D, MeshAttachment2D, Skin2D, Slot2D } from '@flighthq/types/contract';
import { MeshAttachment2DKind, Skeleton2DAnimationTargetKind, TransformMode2D } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { applyAnimationClipToSkeleton2D } from './applyAnimationClipToSkeleton2D';
import { registerSkeleton2DDeformAnimationTarget } from './deformAnimationTarget2D';
import { cloneSkeleton2D, createSkeleton2D } from './skeleton2d';
import {
  getSkeleton2DAnimationTargetBinder,
  registerSkeleton2DAnimationTargetBinder,
  unregisterSkeleton2DAnimationTargetBinder,
} from './skeleton2dAnimationTarget';
import { createSkin2D } from './skin2D';
import { getSkeleton2DSlotDeformOffsets } from './slotDeform2D';

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

function mesh(pointCount: number): MeshAttachment2D {
  const skin: Skin2D = createSkin2D(new Uint16Array(pointCount).fill(1), new Float32Array(pointCount * 4));
  return createEntity({
    kind: MeshAttachment2DKind,
    skin,
    triangles: new Uint16Array(),
    uvs: new Float32Array(pointCount * 2),
    vertexCount: pointCount,
    vertices: null,
  }) as MeshAttachment2D;
}

function rig(attachment: MeshAttachment2D | null): {
  pose: ReturnType<typeof cloneSkeleton2D>;
  setup: ReturnType<typeof createSkeleton2D>;
} {
  const slot: Slot2D = { attachment, boneIndex: 0, color: 0xffffffff, name: 's' };
  const setup = createSkeleton2D([makeBone()], [slot]);
  return { pose: cloneSkeleton2D(setup), setup };
}

// This file registers into a module-global binder registry, so it restores whatever it found rather than
// leaving the Deform kind claimed for whichever file runs next.
const PRIOR = getSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Deform);

afterEach(() => {
  if (PRIOR === null) unregisterSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Deform);
  else registerSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Deform, PRIOR);
});

describe('registerSkeleton2DDeformAnimationTarget', () => {
  it('claims the deform kind, which nothing does until a caller opts in', () => {
    registerSkeleton2DDeformAnimationTarget();

    expect(getSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Deform)).not.toBeNull();
  });

  it('samples a whole offset stream onto the slot, stamped with its attachment', () => {
    registerSkeleton2DDeformAnimationTarget();
    const art = mesh(2);
    const { pose, setup } = rig(art);
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ components: 4, times: [0, 1], values: [0, 0, 0, 0, 4, 8, 12, 16] }),
        { attachment: art, kind: Skeleton2DAnimationTargetKind.Deform, slotIndex: 0 },
      ),
    ]);

    applyAnimationClipToSkeleton2D(clip, setup, pose, 1);

    expect(getSkeleton2DSlotDeformOffsets(pose.slots![0])).toEqual(new Float32Array([4, 8, 12, 16]));
  });

  it('INTERPOLATES between keys, which is what makes a morph move rather than snap', () => {
    registerSkeleton2DDeformAnimationTarget();
    const art = mesh(1);
    const { pose, setup } = rig(art);
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ components: 2, times: [0, 1], values: [0, 0, 10, 20] }), {
        attachment: art,
        kind: Skeleton2DAnimationTargetKind.Deform,
        slotIndex: 0,
      }),
    ]);

    applyAnimationClipToSkeleton2D(clip, setup, pose, 0.5);

    const offsets = getSkeleton2DSlotDeformOffsets(pose.slots![0])!;
    expect(offsets[0]).toBeCloseTo(5, 5);
    expect(offsets[1]).toBeCloseTo(10, 5);
  });

  it('stops being read once the slot swaps to different art, without the binder knowing', () => {
    registerSkeleton2DDeformAnimationTarget();
    const art = mesh(2);
    const other = mesh(2);
    const { pose, setup } = rig(art);
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ components: 4, times: [0], values: [1, 2, 3, 4] }), {
        attachment: art,
        kind: Skeleton2DAnimationTargetKind.Deform,
        slotIndex: 0,
      }),
    ]);
    applyAnimationClipToSkeleton2D(clip, setup, pose, 0);
    expect(getSkeleton2DSlotDeformOffsets(pose.slots![0])).not.toBeNull();

    // Equal point count, so no length check could catch this.
    pose.slots![0].attachment = other;

    expect(getSkeleton2DSlotDeformOffsets(pose.slots![0])).toBeNull();
  });

  it('writes nothing for a slot index the skeleton does not have', () => {
    registerSkeleton2DDeformAnimationTarget();
    const art = mesh(1);
    const { pose, setup } = rig(art);
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ components: 2, times: [0], values: [1, 1] }), {
        attachment: art,
        kind: Skeleton2DAnimationTargetKind.Deform,
        slotIndex: 9,
      }),
    ]);

    expect(() => applyAnimationClipToSkeleton2D(clip, setup, pose, 0)).not.toThrow();
    expect(getSkeleton2DSlotDeformOffsets(pose.slots![0])).toBeNull();
  });
});
