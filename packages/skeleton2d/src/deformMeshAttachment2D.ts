import type { MeshAttachment2D, Skeleton2D } from '@flighthq/types/contract';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

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
      out[oi] = wx;
      out[oi + 1] = wy;
      oi += 2;
    }
    return;
  }

  // Rigid mesh: the whole attachment follows one bone's world transform.
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
    out[i] = a * vx + c * vy + tx;
    out[i + 1] = bb * vx + d * vy + ty;
  }
}
