import type { Bone2D, Skin2D } from '@flighthq/types/contract';
import { TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import { skinSkeleton2DAttachmentPoints } from './skinAttachment2DPoints';

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

const twoBoneSkin: Skin2D = {
  influenceCounts: new Uint16Array([2]),
  influences: new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5]),
};

describe('skinSkeleton2DAttachmentPoints', () => {
  it('blends a weighted point by weight across its influences', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(2);

    skinSkeleton2DAttachmentPoints(out, twoBoneSkin, null, skeleton, 0, null, 'test');

    expect(out[0]).toBeCloseTo(5, 5);
  });

  it('writes into a plain number array as well as a Float32Array, which is what a Path data stream is', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 6 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out: number[] = [0, 0];

    skinSkeleton2DAttachmentPoints(out, null, new Float32Array([1, 2]), skeleton, 0, null, 'test');

    expect(out[0]).toBeCloseTo(7, 5);
    expect(out[1]).toBeCloseTo(2, 5);
  });

  it('is alias-safe when out IS the vertex buffer', () => {
    const skeleton = createSkeleton2D([makeBone({ rotation: 90, x: 5 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const vertices = new Float32Array([2, 0]);

    skinSkeleton2DAttachmentPoints(vertices, null, vertices, skeleton, 0, null, 'test');

    expect(vertices[0]).toBeCloseTo(5, 5);
    expect(vertices[1]).toBeCloseTo(2, 5);
  });

  it('adds a weighted deform in BONE-LOCAL space, before the weighted sum', () => {
    const skeleton = createSkeleton2D([makeBone({ rotation: 90 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const skin: Skin2D = { influenceCounts: new Uint16Array([1]), influences: new Float32Array([0, 1, 0, 1]) };
    const out = new Float32Array(2);

    skinSkeleton2DAttachmentPoints(out, skin, null, skeleton, 0, new Float32Array([0, 2]), 'test');

    // Local (1,2) then rotated 90° → (-2,1). Applying the offset after the rotation would give (0,3).
    expect(out[0]).toBeCloseTo(-2, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });

  it('ignores a deform stream too short for the influences it parallels', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(2);

    skinSkeleton2DAttachmentPoints(out, twoBoneSkin, null, skeleton, 0, new Float32Array([9, 9]), 'test');

    expect(out[0]).toBeCloseTo(5, 5);
  });

  it('writes nothing when neither a skin nor vertices are present', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array([7, 7]);

    skinSkeleton2DAttachmentPoints(out, null, null, skeleton, 0, null, 'test');

    expect(out[0]).toBe(7);
  });
});
