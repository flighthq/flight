import type { MeshAttachment2D, Skeleton2D } from '@flighthq/types';

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
export function deformSkeleton2DMeshAttachment(
  out: Float32Array,
  attachment: Readonly<MeshAttachment2D>,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
): void {
  const world = skeleton.worldMatrices;
  const skin = attachment.skin;
  if (skin !== null && skin !== undefined) {
    const counts = skin.influenceCounts;
    const inf = skin.influences;
    let vi = 0; // influence-stream cursor (stride 4: boneIndex, localX, localY, weight)
    let oi = 0; // output cursor (stride 2)
    for (let v = 0; v < counts.length; v++) {
      let wx = 0;
      let wy = 0;
      const n = counts[v];
      for (let k = 0; k < n; k++) {
        const b = inf[vi] * MATRIX_STRIDE;
        const lx = inf[vi + 1];
        const ly = inf[vi + 2];
        const weight = inf[vi + 3];
        wx += weight * (world[b] * lx + world[b + 2] * ly + world[b + 4]);
        wy += weight * (world[b + 1] * lx + world[b + 3] * ly + world[b + 5]);
        vi += 4;
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
  const b = boneIndex * MATRIX_STRIDE;
  const a = world[b];
  const bb = world[b + 1];
  const c = world[b + 2];
  const d = world[b + 3];
  const tx = world[b + 4];
  const ty = world[b + 5];
  for (let i = 0; i < vertices.length; i += 2) {
    const vx = vertices[i];
    const vy = vertices[i + 1];
    out[i] = a * vx + c * vy + tx;
    out[i + 1] = bb * vx + d * vy + ty;
  }
}
