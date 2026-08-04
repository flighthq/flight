import type { MeshAttachment2D, Skeleton2D } from '@flighthq/types/contract';

import { skinSkeleton2DAttachmentPoints } from './skinAttachment2DPoints';

// Deforms a MeshAttachment2D's vertices into flat interleaved world positions `[x0, y0, x1, y1, …]` in
// `out` (length ≥ 2 × attachment.vertexCount), for the display layer to draw. Requires
// `computeSkeleton2DWorldTransforms` to have filled `skeleton.worldMatrices`. Out-parameter,
// allocation-free.
//
//   WEIGHTED (attachment.skin non-null): each vertex is Σ weight · (boneWorld · (localX, localY)) over its
//     Skin2D influences — the offsets are already in each bone's local space (they bake the bind pose), so
//     this reads bone WORLD matrices directly, no palette. `boneIndex` is ignored.
//   RIGID (attachment.skin null): the mesh's setup-pose local `vertices` are transformed by bone
//     `boneIndex`'s (the slot's bone) world matrix. Alias-safe — each vertex is read into locals before its
//     output is written, so `out` may be the same buffer as `attachment.vertices`.
//
// `deform` is the animated offset stream layered on top of the skinning, or null for the undeformed
// attachment. It is ADDRESSED BY WHATEVER THE ATTACHMENT STORES ITS POSITIONS AS, which is the one rule
// that makes deform work for meshes and paths alike: a weighted attachment's offsets parallel its
// INFLUENCE stream (two floats per influence, so a vertex with three bones consumes three pairs), and a
// rigid one's parallel its vertex stream. Offsets are in the same space as what they displace — bone-local
// for a weighted attachment, so they are added BEFORE the weighted sum. Adding them to the world position
// afterwards would put a bone-local displacement into world space, which looks correct at rest and wrong
// the moment the rig moves.
//
// A `deform` too short for the stream it parallels is ignored entirely rather than read past: an importer
// sizing that buffer from vertex count instead of influence count is an expected failure, not a
// programmer error, so it takes the sentinel.
export function deformSkeleton2DMeshAttachment(
  out: Float32Array,
  attachment: Readonly<MeshAttachment2D>,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
  deform: Readonly<Float32Array> | null = null,
): void {
  skinSkeleton2DAttachmentPoints(
    out,
    attachment.skin,
    attachment.vertices,
    skeleton,
    boneIndex,
    deform,
    'MeshAttachment2D',
  );
}
