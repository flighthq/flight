import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bone2D, ClippingAttachment2D } from '@flighthq/types/contract';
import { ClippingAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  computeSkeleton2DClippingAttachmentVertices,
  getSkeleton2DClippingAttachmentSlotRange,
} from './clippingAttachment2D';
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

function clip(endSlotIndex: number, vertices: Float32Array | null = null): ClippingAttachment2D {
  const out = allocateEntity<ClippingAttachment2D>();
  out.endSlotIndex = endSlotIndex;
  out.kind = ClippingAttachment2DKind;
  out.pointCount = vertices === null ? 0 : vertices.length / 2;
  out.skin = null;
  out.vertices = vertices;
  return finishEntity(out) as ClippingAttachment2D;
}

describe('computeSkeleton2DClippingAttachmentVertices', () => {
  it('carries the polygon through the slot bone world transform', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 4 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(4);

    computeSkeleton2DClippingAttachmentVertices(out, clip(-1, new Float32Array([0, 0, 2, 2])), skeleton, 0);

    expect(out[0]).toBeCloseTo(4, 5);
    expect(out[2]).toBeCloseTo(6, 5);
    expect(out[3]).toBeCloseTo(2, 5);
  });
});

describe('getSkeleton2DClippingAttachmentSlotRange', () => {
  it('starts AFTER the clipping slot and ends one past the inclusive end slot', () => {
    // endSlotIndex 4 is inclusive, so the half-open range ends at 5 — the off-by-one this exists to own.
    expect(getSkeleton2DClippingAttachmentSlotRange(clip(4), 1, 10)).toEqual({ end: 5, start: 2 });
  });

  it('runs to the end of the draw order for -1', () => {
    expect(getSkeleton2DClippingAttachmentSlotRange(clip(-1), 3, 10)).toEqual({ end: 10, start: 4 });
  });

  it('runs to the end when the declared end is at or before the clipping slot', () => {
    // A malformed range cannot clip backwards, so it degrades to clipping everything after itself.
    expect(getSkeleton2DClippingAttachmentSlotRange(clip(2), 5, 10)).toEqual({ end: 10, start: 6 });
  });

  it('clamps an end past the slot array rather than returning an out-of-range index', () => {
    expect(getSkeleton2DClippingAttachmentSlotRange(clip(99), 0, 4)).toEqual({ end: 4, start: 1 });
  });

  it('returns an empty range when the clipping slot is last, rather than an inverted one', () => {
    const range = getSkeleton2DClippingAttachmentSlotRange(clip(-1), 3, 4);

    expect(range.end).toBe(range.start);
  });
});
