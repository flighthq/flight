import type { BoundingBoxAttachment2D, Skeleton2D } from '@flighthq/types/contract';

import { skinSkeleton2DAttachmentPoints } from './skinAttachment2DPoints';

// Produces a bounding box's world polygon as flat interleaved `[x0, y0, x1, y1, …]` in `out` (length
// ≥ 2 × attachment.pointCount), for hit testing and region queries. Requires
// `computeSkeleton2DWorldTransforms` to have filled `skeleton.worldMatrices`. Out-parameter,
// allocation-free.
//
// It is `compute*` rather than `deform*` because nothing here is being drawn: the result is queried. The
// skinning underneath is identical to a mesh's, which is the point — a hit box bound to the same bones as
// the art it covers tracks that art exactly, rather than approximating it with a shape that drifts as the
// rig moves.
export function computeSkeleton2DBoundingBoxAttachmentVertices(
  out: Float32Array,
  attachment: Readonly<BoundingBoxAttachment2D>,
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
    'BoundingBoxAttachment2D',
  );
}
