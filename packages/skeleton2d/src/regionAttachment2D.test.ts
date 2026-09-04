import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bone2D, RegionAttachment2D } from '@flighthq/types/contract';
import { RegionAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { computeSkeleton2DRegionAttachmentVertices } from './regionAttachment2D';
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

function region(overrides: Partial<RegionAttachment2D> = {}): RegionAttachment2D {
  const out = allocateEntity<any>();
  out.kind = RegionAttachment2DKind;
  out.height = 2;
  out.rotation = 0;
  out.scaleX = 1;
  out.scaleY = 1;
  out.width = 4;
  out.x = 0;
  out.y = 0;
  Object.assign(out, overrides);
  return finishEntity(out) as RegionAttachment2D;
}

describe('computeSkeleton2DRegionAttachmentVertices', () => {
  // The sibling of the guard in skinSkeleton2DAttachmentPoints, and the reason this one exists: a slot
  // whose bone name did not resolve carries boneIndex -1, which spineParse emits by design, and this
  // wrote eight NaN corners for it while the point attachment next door returned cleanly. `out` is
  // pre-filled with a marker so "left alone" is distinguishable from "written with zeroes".
  it.each([-1, 3, 99])('leaves out untouched for a slot bound to no bone (boneIndex %i)', (boneIndex) => {
    const s = createSkeleton2D([makeBone({ x: 10, y: 5 })]);
    computeSkeleton2DWorldTransforms(s);
    const out = new Float32Array(8).fill(-7);

    computeSkeleton2DRegionAttachmentVertices(out, region(), s, boneIndex);

    expect(Array.from(out)).toEqual(new Array(8).fill(-7));
  });

  it('offsets a 4×2 region rect by the bone translation (BL, TL, TR, BR order)', () => {
    const s = createSkeleton2D([makeBone({ x: 10, y: 5 })]);
    computeSkeleton2DWorldTransforms(s);
    const out = new Float32Array(8);
    computeSkeleton2DRegionAttachmentVertices(out, region(), s, 0);
    // Corners (±2, ±1) shifted by (10,5): BL(8,4) TL(8,6) TR(12,6) BR(12,4).
    expect(Array.from(out)).toEqual([8, 4, 8, 6, 12, 6, 12, 4]);
  });

  it('rotates the region rect through a 90° bone', () => {
    const s = createSkeleton2D([makeBone({ rotation: 90 })]);
    computeSkeleton2DWorldTransforms(s);
    const out = new Float32Array(8);
    computeSkeleton2DRegionAttachmentVertices(out, region(), s, 0);
    // BL local (-2,-1) rotated 90° CCW → (1,-2).
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(-2, 5);
    // TR local (2,1) → (-1,2).
    expect(out[4]).toBeCloseTo(-1, 5);
    expect(out[5]).toBeCloseTo(2, 5);
  });

  it('applies the region local offset and scale on top of the bone', () => {
    const s = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(s);
    const out = new Float32Array(8);
    // Region offset to (3,0), doubled in x: half-width 2·2 = 4, so BL at (3-4, 0-1) = (-1,-1).
    computeSkeleton2DRegionAttachmentVertices(out, region({ x: 3, scaleX: 2 }), s, 0);
    expect(out[0]).toBeCloseTo(-1, 5);
    expect(out[1]).toBeCloseTo(-1, 5);
  });
});
