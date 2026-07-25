import type { Attachment2D } from './Attachment2D';
import type { Skin2D } from './Skin2D';

// A deformable 2D triangle mesh attached to a slot — the Spine mesh attachment. Its deformed world
// vertices are produced by deformSkeleton2DMeshAttachment into a flat interleaved [x0,y0,x1,y1,…]
// Float32Array the display layer consumes.
//
// Two skin modes:
//   - WEIGHTED (`skin` non-null): each vertex is Σ weight · (boneWorld · localOffset) over its Skin2D
//     influences. `vertices` is null (positions come from the influences). This is the deforming mesh.
//   - RIGID (`skin` null): the mesh is fixed in one bone's local space; `vertices` holds its setup-pose
//     local positions [x0,y0,…] and the whole mesh follows the slot's bone world transform.
//
// `triangles` indexes the vertices (3 per triangle). `uvs` are per-vertex texture coordinates (2 each),
// carried for the display layer — the runtime deforms positions only. `vertexCount` is the vertex count
// (uvs length / 2, and `vertices` length / 2 when rigid).
export interface MeshAttachment2D extends Attachment2D {
  skin?: Skin2D | null;
  triangles: Uint16Array;
  uvs: Float32Array;
  vertexCount: number;
  vertices?: Float32Array | null;
}

export const MeshAttachment2DKind = 'MeshAttachment2D';
