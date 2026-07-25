import type { Attachment2D } from './Attachment2D';

// A textured quad attached to a slot's bone — the Spine region attachment, the common case (a limb
// image, a prop). It is rigid: its four world corners are the bone's world transform applied to the
// region's local rect, produced by computeSkeleton2DRegionAttachmentVertices as a flat [x0,y0,…x3,y3].
//
// The region's LOCAL transform (relative to the slot's bone): `x`/`y` offset, `rotation` (degrees),
// `scaleX`/`scaleY`, and the unscaled `width`/`height` of the quad. Texture UVs and tint are display
// concerns held by the composition layer, not the runtime, so they are not on this type.
export interface RegionAttachment2D extends Attachment2D {
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  x: number;
  y: number;
}

export const RegionAttachment2DKind = 'RegionAttachment2D';
