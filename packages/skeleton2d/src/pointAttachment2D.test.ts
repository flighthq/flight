import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bone2D, PointAttachment2D } from '@flighthq/types/contract';
import { PointAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  computeSkeleton2DPointAttachmentPosition,
  computeSkeleton2DPointAttachmentRotation,
} from './pointAttachment2D';
import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';

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

function point(x: number, y: number, rotation: number): PointAttachment2D {
    const out = allocateEntity<PointAttachment2D>();
  out.kind = PointAttachment2DKind;
  out.rotation = rotation;
  out.x = x;
  out.y = y;
  return finishEntity(out) as PointAttachment2D;;
    computeSkeleton2DWorldTransforms(skeleton);
    const out = { x: 0, y: 0 };

    computeSkeleton2DPointAttachmentPosition(out, point(3, 0, 0), skeleton, 0);

    expect(out.x).toBeCloseTo(5, 5);
    expect(out.y).toBeCloseTo(3, 5);
  });

  it('leaves out untouched for a bone index outside the buffer rather than writing garbage', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = { x: -1, y: -1 };

    computeSkeleton2DPointAttachmentPosition(out, point(3, 0, 0), skeleton, 9);

    expect(out).toEqual({ x: -1, y: -1 });
  });
});

describe('computeSkeleton2DPointAttachmentRotation', () => {
  it('adds the bone world rotation to the local one, in degrees', () => {
    const skeleton = createSkeleton2D([makeBone({ rotation: 90 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    expect(computeSkeleton2DPointAttachmentRotation(point(0, 0, 30), skeleton, 0)).toBeCloseTo(120, 4);
  });

  it('follows the bone AXIS rather than its rotation angle, which non-uniform scale separates', () => {
    // scaleX 1, scaleY 4: a 45° local direction is stretched toward +y, so the world direction is NOT 45°.
    // Adding the bone's rotation angle instead would have returned 45 and pointed the wrong way.
    const skeleton = createSkeleton2D([makeBone({ scaleY: 4 })]);
    computeSkeleton2DWorldTransforms(skeleton);

    const rotation = computeSkeleton2DPointAttachmentRotation(point(0, 0, 45), skeleton, 0);

    expect(rotation).toBeCloseTo((Math.atan2(4, 1) * 180) / Math.PI, 4);
    expect(rotation).not.toBeCloseTo(45, 1);
  });

  it('returns the local rotation unchanged for a bone index outside the buffer', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);

    expect(computeSkeleton2DPointAttachmentRotation(point(0, 0, 30), skeleton, 9)).toBe(30);
  });
});
