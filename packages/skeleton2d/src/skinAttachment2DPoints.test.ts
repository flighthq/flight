import type { Bone2D, Skin2D } from '@flighthq/types/contract';
import { TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import { setSkeleton2DDeformLengthGuard } from './skeleton2dGuards';
import { createSkin2D } from './skin2D';
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

const twoBoneSkin: Skin2D = createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5]));

describe('skinSkeleton2DAttachmentPoints', () => {
  // A slot whose bone name did not resolve carries boneIndex -1 — the value spineParse emits by design for
  // a file naming a bone that is not there, on a skeleton validateSkeleton2D calls valid. Before this was
  // guarded the rigid path indexed the world buffer at -6, and every coordinate it wrote was NaN: a mesh
  // that draws nothing and a bounding box no hit test can match, with nothing pointing back at the rig.
  //
  // `out` is pre-filled with a marker rather than zeroes so the assertion tells "left alone" apart from
  // "written with zeroes", which are different outcomes and only one of them is the sentinel.
  it.each([-1, 4, 99])('leaves out untouched for a slot bound to no bone (boneIndex %i)', (boneIndex) => {
    const skeleton = createSkeleton2D([makeBone({ rotation: 30 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array([-7, -7, -7, -7]);

    skinSkeleton2DAttachmentPoints(out, null, new Float32Array([1, 0, 0, 1]), skeleton, boneIndex, null, 'test');

    expect(Array.from(out)).toEqual([-7, -7, -7, -7]);
  });

  // The weighted path reads its bone indices from the influence stream and ignores `boneIndex` entirely,
  // so the guard must not turn a perfectly good weighted skin into a no-op on its way past.
  it('still skins a weighted attachment when boneIndex is -1, which it does not use', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(2);

    skinSkeleton2DAttachmentPoints(out, twoBoneSkin, null, skeleton, -1, null, 'test');

    expect(out[0]).toBeCloseTo(5, 5);
  });

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
    const skin: Skin2D = createSkin2D(new Uint16Array([1]), new Float32Array([0, 1, 0, 1]));
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

  it('ignores a deform stream LONGER than the influences it parallels, not only a shorter one', () => {
    // A too-long stream was silently accepted while the check was `>=`. It is never merely harmless: it
    // means the buffer was sized against something other than this attachment.
    const skeleton = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(2);

    skinSkeleton2DAttachmentPoints(out, twoBoneSkin, null, skeleton, 0, new Float32Array(8).fill(5), 'test');

    expect(out[0]).toBeCloseTo(5, 5);
  });

  it('ignores a deform stream longer than a RIGID attachment vertex stream', () => {
    const skeleton = createSkeleton2D([makeBone({ x: 4 })]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array(2);

    skinSkeleton2DAttachmentPoints(
      out,
      null,
      new Float32Array([1, 1]),
      skeleton,
      0,
      new Float32Array(6).fill(9),
      'test',
    );

    expect(out[0]).toBeCloseTo(5, 5);
  });

  it('reports the over-long case through the guard seam rather than dropping it silently', () => {
    const reports: number[] = [];
    setSkeleton2DDeformLengthGuard((report) => reports.push(report.offsets, report.addressed));
    const skeleton = createSkeleton2D([makeBone(), makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);

    skinSkeleton2DAttachmentPoints(new Float32Array(2), twoBoneSkin, null, skeleton, 0, new Float32Array(8), 'test');
    setSkeleton2DDeformLengthGuard(null);

    expect(reports).toEqual([8, 4]);
  });

  it('writes nothing when neither a skin nor vertices are present', () => {
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);
    const out = new Float32Array([7, 7]);

    skinSkeleton2DAttachmentPoints(out, null, null, skeleton, 0, null, 'test');

    expect(out[0]).toBe(7);
  });
});
