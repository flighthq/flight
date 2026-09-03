import type { Bone2D, MeshAttachment2D, Skeleton2DDeformLengthMismatch, Skin2D } from '@flighthq/types/contract';
import { MeshAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { deformSkeleton2DMeshAttachment } from './deformMeshAttachment2D';
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

function weightedMesh(skin: Skin2D, vertexCount: number): MeshAttachment2D {
  return {
    kind: MeshAttachment2DKind,
    skin,
    triangles: new Uint16Array(),
    uvs: new Float32Array(vertexCount * 2),
    vertexCount,
    vertices: null,
  };
}

describe('deformSkeleton2DMeshAttachment', () => {
  it('deforms a single-bone weighted vertex through the bone world transform', () => {
    // One bone rotated 90° at (5,0). One vertex, one influence: offset (1,0) in the bone, weight 1.
    const s = createSkeleton2D([makeBone({ x: 5, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(s);
    const mesh = weightedMesh(createSkin2D(new Uint16Array([1]), new Float32Array([0, 1, 0, 1])), 1);
    const out = new Float32Array(2);
    deformSkeleton2DMeshAttachment(out, mesh, s, 0);
    // (1,0) rotated 90° = (0,1), + translation (5,0) → (5,1).
    expect(out[0]).toBeCloseTo(5, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });

  it('blends two bones by weight (0.5/0.5 → midpoint of their translations)', () => {
    const s = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(s);
    // Vertex at each bone's origin (0,0), weighted 0.5 to bone 0 and 0.5 to bone 1.
    const skin: Skin2D = createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5]));
    const out = new Float32Array(2);
    deformSkeleton2DMeshAttachment(out, weightedMesh(skin, 1), s, 0);
    expect(out[0]).toBeCloseTo(5, 5); // midpoint of x=0 and x=10
    expect(out[1]).toBeCloseTo(0, 5);
  });

  it('adds a weighted deform offset in BONE-LOCAL space, one pair per influence', () => {
    const s = createSkeleton2D([makeBone({ x: 5, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(s);
    const mesh = weightedMesh(createSkin2D(new Uint16Array([1]), new Float32Array([0, 1, 0, 1])), 1);
    const out = new Float32Array(2);

    deformSkeleton2DMeshAttachment(out, mesh, s, 0, new Float32Array([0, 2]));

    // The offset displaces the bone-local (1,0) to (1,2) BEFORE the bone's 90° rotation, so it comes out
    // along -x. Applying it after the transform would have moved the vertex along +y instead.
    expect(out[0]).toBeCloseTo(3, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });

  it('walks the deform stream per influence, so a two-bone vertex consumes two offset pairs', () => {
    const s = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(s);
    const skin: Skin2D = createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5]));
    const out = new Float32Array(2);

    // Only the SECOND influence is displaced; at weight 0.5 it moves the blended vertex half as far.
    deformSkeleton2DMeshAttachment(out, weightedMesh(skin, 1), s, 0, new Float32Array([0, 0, 4, 0]));

    expect(out[0]).toBeCloseTo(7, 5);
    expect(out[1]).toBeCloseTo(0, 5);
  });

  it('ignores a deform stream too short for the influences it parallels rather than reading past it', () => {
    const s = createSkeleton2D([makeBone({ x: 0 }), makeBone({ x: 10 })]);
    computeSkeleton2DWorldTransforms(s);
    const skin: Skin2D = createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5]));
    const out = new Float32Array(2);

    // Sized from vertex count (one pair) instead of influence count (two) — the importer bug this guards.
    deformSkeleton2DMeshAttachment(out, weightedMesh(skin, 1), s, 0, new Float32Array([4, 4]));

    expect(out[0]).toBeCloseTo(5, 5);
    expect(out[1]).toBeCloseTo(0, 5);
  });

  it('adds a rigid deform offset to the setup vertices before the bone transform', () => {
    const s = createSkeleton2D([makeBone({ x: 5, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(s);
    const mesh: MeshAttachment2D = {
      kind: MeshAttachment2DKind,
      skin: null,
      triangles: new Uint16Array(),
      uvs: new Float32Array(2),
      vertexCount: 1,
      vertices: new Float32Array([2, 0]),
    };
    const out = new Float32Array(2);

    deformSkeleton2DMeshAttachment(out, mesh, s, 0, new Float32Array([1, 0]));

    // (3,0) rotated 90° = (0,3), + (5,0) → (5,3).
    expect(out[0]).toBeCloseTo(5, 5);
    expect(out[1]).toBeCloseTo(3, 5);
  });

  it('reaches the guard seam when it ignores a short stream, rather than dropping it silently', () => {
    const reports: Skeleton2DDeformLengthMismatch[] = [];
    setSkeleton2DDeformLengthGuard((report) => reports.push({ ...report }));
    const s = createSkeleton2D([makeBone(), makeBone()]);
    computeSkeleton2DWorldTransforms(s);
    const skin: Skin2D = createSkin2D(new Uint16Array([2]), new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 0.5]));

    // Sized from vertex count (2) rather than influence count (4) — the importer mistake the guard names.
    deformSkeleton2DMeshAttachment(new Float32Array(2), weightedMesh(skin, 1), s, 0, new Float32Array([9, 9]));
    setSkeleton2DDeformLengthGuard(null);

    expect(reports).toEqual([{ addressed: 4, offsets: 2, subject: 'MeshAttachment2D' }]);
  });

  it('transforms a rigid mesh by the slot bone world matrix (alias-safe in place)', () => {
    const s = createSkeleton2D([makeBone({ x: 5, rotation: 90 })]);
    computeSkeleton2DWorldTransforms(s);
    const verts = new Float32Array([2, 0]); // one vertex, local to the bone
    const mesh: MeshAttachment2D = {
      kind: MeshAttachment2DKind,
      skin: null,
      triangles: new Uint16Array(),
      uvs: new Float32Array(2),
      vertexCount: 1,
      vertices: verts,
    };
    // Deform in place (out === vertices) to exercise alias safety.
    deformSkeleton2DMeshAttachment(verts, mesh, s, 0);
    // (2,0) rotated 90° = (0,2), + (5,0) → (5,2).
    expect(verts[0]).toBeCloseTo(5, 5);
    expect(verts[1]).toBeCloseTo(2, 5);
  });
});
