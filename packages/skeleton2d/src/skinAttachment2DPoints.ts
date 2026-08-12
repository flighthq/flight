import type { Skeleton2D, Skin2D } from '@flighthq/types/contract';

import { reportSkeleton2DDeformLengthMismatch } from './skeleton2dGuards';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

// Transforms an attachment's points into world space, writing flat interleaved `[x0, y0, x1, y1, …]`.
// This is the skinning primitive every deformable attachment shares — meshes, paths, bounding boxes and
// clipping polygons all reduce to it, because a skinned point is a skinned point whatever reads it
// afterwards. `Skin2D` carries no triangles and no UVs, so it was geometry-agnostic before any of them
// existed; the callers differ only in what they do with the result.
//
//   WEIGHTED (`skin` non-null): each point is Σ weight · (boneWorld · (localX, localY)) over its
//     influences. The offsets already sit in each bone's local space (they bake the bind pose), so this
//     reads bone WORLD matrices directly with no palette, and `boneIndex` is ignored.
//   RIGID (`skin` null): `vertices` holds setup-pose local points transformed by bone `boneIndex`'s world
//     matrix. Alias-safe — each point is read into locals before its output is written, so `out` may be
//     the same buffer as `vertices`.
//
// `deform` is the animated offset stream layered on top, ADDRESSED BY WHATEVER THE ATTACHMENT STORES ITS
// POSITIONS AS: parallel to the INFLUENCE stream when weighted (two floats per influence, so a point
// bound to three bones consumes three pairs) and to the vertex stream when rigid. Offsets are in the same
// space as what they displace — bone-local when weighted — so they are added BEFORE the weighted sum.
// Adding them to the world position afterwards would put a bone-local displacement into world space,
// which looks correct at rest and wrong the moment the rig moves.
//
// A `deform` whose length does not EXACTLY match what it parallels is ignored and reported through the
// guard seam under `subject`, so a caller can tell which attachment to fix. The match is exact rather than
// a minimum in both directions on purpose: too SHORT would read past the stream, and too LONG is never
// merely harmless — it means the stream was sized against something other than this attachment, which is
// the same authoring defect arriving from the other side. A caller holding one oversized scratch buffer
// for several attachments passes `buffer.subarray(0, n)`, which costs nothing and says what it means.
//
// `out` accepts a plain array as well as a Float32Array, because a Path's `data` stream is one.
export function skinSkeleton2DAttachmentPoints(
  out: Float32Array | number[],
  skin: Readonly<Skin2D> | null | undefined,
  vertices: Readonly<Float32Array> | null | undefined,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
  deform: Readonly<Float32Array> | null,
  subject: string,
): void {
  const world = skeleton.worldMatrices;
  if (skin !== null && skin !== undefined) {
    const counts = skin.influenceCounts;
    const inf = skin.influences;
    // Hoisted out of the loop: a rig with no deform timeline pays one test for the whole attachment.
    const offsets = deform !== null && deform.length * 2 === inf.length ? deform : null;
    if (deform !== null && offsets === null) {
      reportSkeleton2DDeformLengthMismatch(subject, deform.length, inf.length / 2);
    }
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
      out[oi] = wx;
      out[oi + 1] = wy;
      oi += 2;
    }
    return;
  }

  if (vertices === null || vertices === undefined) return;
  // A slot bound to no bone is an ASSET fact, not a programmer error: an importer resolving a slot's bone
  // name against the bone array emits -1 when the file names one that is not there, and a skeleton holding
  // that slot is valid — validateSkeleton2D checks bone parentage and buffer lengths, never slot bones. So
  // it takes the sentinel, leaving `out` as the caller last saw it. Reading on would index the world buffer
  // at a negative offset, and every coordinate written from there is NaN: a mesh that draws nothing, and a
  // bounding box no hit test can ever match, with no symptom pointing back at the rig.
  if (boneIndex < 0 || boneIndex * MATRIX_STRIDE >= world.length) return;
  const offsets = deform !== null && deform.length === vertices.length ? deform : null;
  if (deform !== null && offsets === null) {
    reportSkeleton2DDeformLengthMismatch(subject, deform.length, vertices.length);
  }
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
    out[i] = a * vx + c * vy + tx;
    out[i + 1] = bb * vx + d * vy + ty;
  }
}
