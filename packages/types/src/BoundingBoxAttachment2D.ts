import type { Attachment2D } from './Attachment2D';
import type { Skin2D } from './Skin2D';

// A closed polygon attached to a slot, used for hit testing and region queries rather than drawing —
// a hurt box, a pickup trigger, a footfall zone. It follows the rig exactly as a mesh does, so a limb's
// hit box bends with the limb instead of approximating it with a static rectangle.
//
// Skinning is the same two modes every deformable attachment has: WEIGHTED (`skin` non-null) binds each
// point to bones through `Skin2D`, and RIGID (`skin` null) holds setup-pose local points in `vertices`
// that follow the slot's bone. `computeSkeleton2DBoundingBoxAttachmentVertices` produces the world
// polygon as a flat interleaved `[x0, y0, x1, y1, …]`.
//
// It carries no drawing state at all — no UVs, no triangles, no colour. That absence is the type: a
// bounding box is queried, never rendered, and a consumer that wants to SEE one draws it from these
// vertices as a debug overlay.
export interface BoundingBoxAttachment2D extends Attachment2D {
  kind: 'BoundingBoxAttachment2D';
  pointCount: number;
  skin?: Skin2D | null;
  vertices?: Float32Array | null;
}

export const BoundingBoxAttachment2DKind = 'BoundingBoxAttachment2D';
