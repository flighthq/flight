import { createEntity } from '@flighthq/entity/contract';
import type { Bone2D, BoundingBoxAttachment2D, Skin2D } from '@flighthq/types/contract';
import { BoundingBoxAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { computeSkeleton2DBoundingBoxAttachmentVertices } from './boundingBoxAttachment2D';
import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import { createSkin2D } from './skin2D';

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

function box(skin: Skin2D | null, vertices: Float32Array | null, pointCount: number): BoundingBoxAttachment2D {
  return createEntity({ kind: BoundingBoxAttachment2DKind, pointCount, skin, vertices }) as BoundingBoxAttachment2D;
}

describe('computeSkeleton2DBoundingBoxAttachmentVertices', () => {
  it('carries a rigid box through the slot bone world transform', () => {
    const skeleton = createSkeleton2D([makeBone({ rotation: 90, x: 5 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(4);

    computeSkeleton2DBoundingBoxAttachmentVertices(out, box(null, new Float32Array([2, 0, 0, 3]), 2), skeleton, 0);

    // (2,0) rotated 90° = (0,2), +5 in x → (5,2). (0,3) → (-3,0), +5 → (2,0).
    expect(out[0]).toBeCloseTo(5, 5);
    expect(out[1]).toBeCloseTo(2, 5);
    expect(out[2]).toBeCloseTo(2, 5);
    expect(out[3]).toBeCloseTo(0, 5);
  });

  it('blends a weighted point across bones, so a hit box bends with the limb it covers', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const skin: Skin2D = createSkin2D(
      new Uint16Array([1, 2]),
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 0.5, 1, 0, 0, 0.5]),
    );
    const out = new Float32Array(4);

    computeSkeleton2DBoundingBoxAttachmentVertices(out, box(skin, null, 2), skeleton, 0);

    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(5, 5);
  });

  it('applies a deform offset, since a hit box animates with the art', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(2);

    computeSkeleton2DBoundingBoxAttachmentVertices(
      out,
      box(null, new Float32Array([1, 1]), 1),
      skeleton,
      0,
      new Float32Array([3, 4]),
    );

    expect(out[0]).toBeCloseTo(4, 5);
    expect(out[1]).toBeCloseTo(5, 5);
  });

  it('writes nothing for a box with neither skin nor vertices rather than throwing', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(2);

    expect(() => computeSkeleton2DBoundingBoxAttachmentVertices(out, box(null, null, 0), skeleton, 0)).not.toThrow();
    expect(out[0]).toBe(0);
  });
});
