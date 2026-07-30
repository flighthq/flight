import type { Attachment2D } from './Attachment2D';

// One entry of a skin: the attachment a slot shows while that skin is worn, filed under the name the skin
// keys it by. `slotIndex` indexes the skeleton's flat slot array, and `name` is the attachment's key WITHIN
// the skin — two skins deliberately reuse the same key (`"head"`) to supply different art for one slot,
// which is exactly how a rig swaps a character's look without touching its animations.
export interface SkinAttachment2D {
  attachment: Attachment2D;
  name: string;
  slotIndex: number;
}

// A NAMED SKIN — the set of slot attachments a skeleton wears together. This is the Spine/DragonBones
// "skin": character customization, where `goblin` and `goblingirl` supply different art for the same slots
// over the same bones and the same animations.
//
// NOT to be confused with `Skin2D`, which is an entirely different concept that unfortunately shares the
// word: `Skin2D` is a weighted mesh's per-vertex BONE BINDING (influence counts and weights, the 2D analogue
// of skeleton3d's joints/weights), while this is a WARDROBE. Both senses of "skin" are canonical in their
// own domain — vertex skinning in the mesh-deformation sense, skins in the Spine sense — so neither name is
// wrong and the two are distinguished by the `Attachment` qualifier here. A skeleton's `skins` field holds
// these; a mesh attachment's `skin` field holds a `Skin2D`.
//
// Entries are a FLAT array rather than a nested slot→name map: skins are small, a lookup happens when the
// wardrobe changes rather than per frame, and a flat value type ports directly to C/C++ without a hash of
// hashes. Order is the file's own.
export interface AttachmentSkin2D {
  attachments: SkinAttachment2D[];
  name: string;
}
