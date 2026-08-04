import type { Path, PathAttachment2D, Skeleton2D } from '@flighthq/types/contract';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

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

  const world = skeleton.worldMatrices;
  const skin = attachment.skin;
  if (skin !== null && skin !== undefined) {
    const counts = skin.influenceCounts;
    const inf = skin.influences;
    // Hoisted out of the loop: a rig with no deform timeline pays one test for the whole attachment.
    const offsets = deform !== null && deform.length * 2 >= inf.length ? deform : null;
    let vi = 0; // influence-stream cursor (stride 4: boneIndex, localX, localY, weight)
    let di = 0; // deform cursor (stride 2, one pair per influence)
    let oi = 0; // output cursor (stride 2)
    for (let v = 0; v < counts.length; v++) {
      let wx = 0;
      let wy = 0;
      const n = counts[v];
      for (let k = 0; k < n; k++) {
        const b = inf[vi] * MATRIX_STRIDE;
        const lx = offsets === null ? inf[vi + 1] : inf[vi + 1] + offsets[di];
        const ly = offsets === null ? inf[vi + 2] : inf[vi + 2] + offsets[di + 1];
        const weight = inf[vi + 3];
        wx += weight * (world[b] * lx + world[b + 2] * ly + world[b + 4]);
        wy += weight * (world[b + 1] * lx + world[b + 3] * ly + world[b + 5]);
        vi += 4;
        di += 2;
      }
      data[oi] = wx;
      data[oi + 1] = wy;
      oi += 2;
    }
    return;
  }

  // Rigid path: every point follows one bone's world transform.
  const vertices = attachment.vertices;
  if (vertices === null || vertices === undefined) return;
  const offsets = deform !== null && deform.length >= vertices.length ? deform : null;
  const b = boneIndex * MATRIX_STRIDE;
  const a = world[b];
  const bb = world[b + 1];
  const c = world[b + 2];
  const d = world[b + 3];
  const tx = world[b + 4];
  const ty = world[b + 5];
  for (let i = 0; i < vertices.length; i += 2) {
    const vx = offsets === null ? vertices[i] : vertices[i] + offsets[i];
    const vy = offsets === null ? vertices[i + 1] : vertices[i + 1] + offsets[i + 1];
    data[i] = a * vx + c * vy + tx;
    data[i + 1] = bb * vx + d * vy + ty;
  }
}
