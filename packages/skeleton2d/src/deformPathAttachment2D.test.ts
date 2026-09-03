import type { Bone2D, Path, PathAttachment2D, Skeleton2DDeformLengthMismatch, Skin2D } from '@flighthq/types/contract';
import { EntityRuntimeKey, PathAttachment2DKind, PathCommand, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { deformSkeleton2DPathAttachment } from './deformPathAttachment2D';
import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import { setSkeleton2DDeformLengthGuard } from './skeleton2dGuards';
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

function emptyPath(): Path {
  return { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'nonZero' };
}

function weightedPath(skin: Skin2D, pointCount: number, commands: number[]): PathAttachment2D {
  return { commands, kind: PathAttachment2DKind, pointCount, skin, vertices: null, winding: 'evenOdd' };
}

describe('deformSkeleton2DPathAttachment', () => {
  it('carries the verb stream and winding through untouched, since bones move points and not verbs', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment = weightedPath(createSkin2D(new Uint16Array([1]), new Float32Array([0, 3, 4, 1])), 1, [
      PathCommand.MOVE_TO,
    ]);
    const out = emptyPath();

    deformSkeleton2DPathAttachment(out, attachment, skeleton, 0);

    expect(out.commands).toEqual([PathCommand.MOVE_TO]);
    expect(out.winding).toBe('evenOdd');
    expect(out.data).toHaveLength(2);
    expect(out.data[0]).toBeCloseTo(3, 5);
    expect(out.data[1]).toBeCloseTo(4, 5);
  });

  it('skins a cubic handle exactly like its anchor, because import gave it the anchor influence set', () => {
    // One bone rotated 90°. An anchor and its two handles all bound to it with weight 1, so the whole
    // curve travels rigidly with the bone rather than the anchors moving and the handles staying put.
    const skeleton = createSkeleton2D([makeBone({ rotation: 90 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment = weightedPath(
      createSkin2D(new Uint16Array([1, 1, 1]), new Float32Array([0, 0, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1])),
      3,
      [PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO],
    );
    const out = emptyPath();

    deformSkeleton2DPathAttachment(out, attachment, skeleton, 0);

    // Every point rotates 90°: (0,0)→(0,0), (1,0)→(0,1), (2,0)→(0,2). The spacing between the anchor and
    // its handles is preserved, which is what an unsheared tangent looks like.
    expect(out.data[0]).toBeCloseTo(0, 5);
    expect(out.data[1]).toBeCloseTo(0, 5);
    expect(out.data[2]).toBeCloseTo(0, 5);
    expect(out.data[3]).toBeCloseTo(1, 5);
    expect(out.data[4]).toBeCloseTo(0, 5);
    expect(out.data[5]).toBeCloseTo(2, 5);
  });

  it('blends a point across two bones by weight, the same math a mesh vertex gets', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment = weightedPath(
      createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5])),
      1,
      [PathCommand.MOVE_TO],
    );
    const out = emptyPath();

    deformSkeleton2DPathAttachment(out, attachment, skeleton, 0);

    expect(out.data[0]).toBeCloseTo(5, 5);
    expect(out.data[1]).toBeCloseTo(0, 5);
  });

  it('adds a weighted deform offset in bone-local space, one pair per influence', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 5, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment = weightedPath(createSkin2D(new Uint16Array([1]), new Float32Array([0, 1, 0, 1])), 1, [
      PathCommand.MOVE_TO,
    ]);
    const out = emptyPath();

    deformSkeleton2DPathAttachment(out, attachment, skeleton, 0, new Float32Array([0, 2]));

    // Local (1,2) under a 90° rotation and a +5 x translation, so the offset moves the point along -x.
    expect(out.data[0]).toBeCloseTo(3, 5);
    expect(out.data[1]).toBeCloseTo(1, 5);
  });

  it('ignores a deform stream too short for the influences it parallels', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment = weightedPath(
      createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5])),
      1,
      [PathCommand.MOVE_TO],
    );
    const out = emptyPath();

    deformSkeleton2DPathAttachment(out, attachment, skeleton, 0, new Float32Array([4, 4]));

    expect(out.data[0]).toBeCloseTo(5, 5);
  });

  it('reaches the guard seam when it ignores a short stream, naming the path attachment', () => {
    const reports: Skeleton2DDeformLengthMismatch[] = [];
    setSkeleton2DDeformLengthGuard((report) => reports.push({ ...report }));
    const skeleton = createSkeleton2D([makeBone(), makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment = weightedPath(
      createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5])),
      1,
      [PathCommand.MOVE_TO],
    );

    deformSkeleton2DPathAttachment(emptyPath(), attachment, skeleton, 0, new Float32Array([9, 9]));
    setSkeleton2DDeformLengthGuard(null);

    // The subject distinguishes it from a mesh mismatch, which is what the field exists for.
    expect(reports).toEqual([{ addressed: 4, offsets: 2, subject: 'PathAttachment2D' }]);
  });

  it('transforms a rigid path by the slot bone world matrix', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 5, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment: PathAttachment2D = {
      commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO],
      kind: PathAttachment2DKind,
      pointCount: 2,
      skin: null,
      vertices: new Float32Array([2, 0, 0, 3]),
      winding: 'nonZero',
    };
    const out = emptyPath();

    deformSkeleton2DPathAttachment(out, attachment, skeleton, 0, new Float32Array([0, 0, 0, 0]));

    expect(out.data[0]).toBeCloseTo(5, 5);
    expect(out.data[1]).toBeCloseTo(2, 5);
    expect(out.data[2]).toBeCloseTo(2, 5);
    expect(out.data[3]).toBeCloseTo(0, 5);
  });

  it('writes nothing for a rigid path with no setup vertices rather than throwing', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const attachment: PathAttachment2D = {
      commands: [],
      kind: PathAttachment2DKind,
      pointCount: 0,
      skin: null,
      vertices: null,
      winding: 'nonZero',
    };
    const out = emptyPath();

    expect(() => deformSkeleton2DPathAttachment(out, attachment, skeleton, 0)).not.toThrow();
    expect(out.data).toEqual([]);
  });
});
