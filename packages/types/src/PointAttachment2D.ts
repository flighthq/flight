import type { Attachment2D } from './Attachment2D';

// A single positioned, oriented point on a bone — a muzzle flash origin, a footstep emitter, a hand grip.
// It draws nothing and has no extent; what a caller wants from it is a world position and a world
// direction, produced by `computeSkeleton2DPointAttachmentPosition` and
// `computeSkeleton2DPointAttachmentRotation`.
//
// It is deliberately NOT skinnable. A point rides one bone by definition — that is what makes it a point
// rather than a one-vertex mesh — so it carries a local offset and rotation and no `Skin2D`. Anything
// wanting a blended position wants a weighted attachment instead.
//
// `rotation` is DEGREES in the bone's local space, matching every other authoring-layer angle in the SDK.
export interface PointAttachment2D extends Attachment2D {
  kind: 'PointAttachment2D';
  rotation: number;
  x: number;
  y: number;
}

export const PointAttachment2DKind = 'PointAttachment2D';
