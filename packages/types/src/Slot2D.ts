import type { Attachment2D } from './Attachment2D';

// A draw slot in a Skeleton2D: it binds a bone to the attachment currently shown on it, and its position
// in the skeleton's `slots` array IS its draw order (earlier = drawn first / behind). A slot follows its
// bone (`boneIndex`) — the attachment is transformed by that bone's world matrix — the Spine/DragonBones
// slot model that decouples draw order from the bone hierarchy.
//
// `attachment` is the attachment currently displayed (null = the slot draws nothing this frame; a skin
// set swaps it in P3). `color` is a packed RGBA tint (`0xffffffff` = no tint), the per-slot multiply.
export interface Slot2D {
  attachment?: Attachment2D | null;
  boneIndex: number;
  color?: number;
  name?: string | null;
}
