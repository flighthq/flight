import type { Path, PathAttachment2D, Skeleton2D } from '@flighthq/types/contract';

import { skinSkeleton2DAttachmentPoints } from './skinAttachment2DPoints';

// Deforms a PathAttachment2D into `out`, filling its `data` with world coordinates under the attachment's
// own verb stream. Requires `computeSkeleton2DWorldTransforms` to have filled `skeleton.worldMatrices`.
// Out-parameter; allocates only when `out`'s arrays have to grow to fit.
//
// The math is the same as `deformSkeleton2DMeshAttachment` — deliberately so. A skinned point is a
// skinned point whether a triangle or a curve reads it, and Skin2D carries no triangles and no UVs, so it
// was already geometry-agnostic. Only the output target differs: a Path's `data` stream instead of an
// interleaved vertex buffer.
//
// CONTROL POINTS NEED NO SPECIAL CASE HERE, and that is by construction rather than by luck: a cubic
// handle is given its anchor's influence set at IMPORT (see PathAttachment2D), so it arrives as an
// ordinary entry in the influence stream. Nothing below distinguishes an anchor from a handle, which is
// exactly why a curve cannot end up with its anchors moved and its handles left behind, or with its
// tangents sheared by influences blended across a segment.
//
// `deform` is the animated offset stream layered on top of the skinning, addressed the same way the mesh
// deformer addresses it: parallel to the INFLUENCE stream when weighted (two floats per influence),
// parallel to the coordinate stream when rigid, and applied to the BONE-LOCAL offset before the weighted
// sum. A stream too short for what it parallels is ignored rather than read past.
//
// This writes coordinates and never queries geometry, so it needs the `Path` TYPE and no function from
// `@flighthq/path`. That is the whole reason path skinning can live here beside mesh skinning instead of
// in a package that depends on the path kernel.
export function deformSkeleton2DPathAttachment(
  out: Path,
  attachment: Readonly<PathAttachment2D>,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
  deform: Readonly<Float32Array> | null = null,
): void {
  const commands = attachment.commands;
  const data = out.data;
  const outCommands = out.commands;
  outCommands.length = commands.length;
  for (let i = 0; i < commands.length; i++) outCommands[i] = commands[i];
  out.winding = attachment.winding;
  data.length = attachment.pointCount * 2;

  skinSkeleton2DAttachmentPoints(
    data,
    attachment.skin,
    attachment.vertices,
    skeleton,
    boneIndex,
    deform,
    'PathAttachment2D',
  );
}
