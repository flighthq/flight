import type { Entity } from './Entity';

// The per-vertex bone-weight binding of a weighted MeshAttachment2D — the 2D analog of skeleton3d's
// joints0/weights0, in the Spine "weighted mesh" format. Each vertex is influenced by a VARIABLE number
// of bones (not a fixed 4 — skeleton2d skins on the CPU, so it pays for exactly the influences a vertex
// has), and for each influence stores the vertex's position in THAT bone's local (setup) space plus a
// weight. The deformed world position of a vertex is Σ weight · (boneWorldMatrix · localOffset): because
// each offset is already in bone-local space, the inverse-bind is baked into the offsets at author/import
// time and the deformer reads bone WORLD matrices directly (no separate palette for weighted meshes).
//
// Layout: `influenceCounts[v]` is how many bones influence vertex v (length = the mesh's vertexCount).
// `influences` is the flat stream of Σ influenceCounts entries, in vertex order, each entry four floats:
// (boneIndex, localX, localY, weight) — boneIndex is an integer-valued float (like skeleton3d's joints0).
export interface Skin2D extends Entity {
  influenceCounts: Uint16Array;
  influences: Float32Array;
}
