//! Slot deform offsets and their attachment identity (TS `slotDeform2D.ts`).

use crate::types::*;

/// The offsets in effect on a slot, only when authored for the attachment it currently shows (TS
/// `getSkeleton2DSlotDeformOffsets`).
// flight-lint: allow(conform-array) Rust adopts an owned Vec<f32> where TS passes a shared Float32Array reference
pub fn get_skeleton_2d_slot_deform_offsets(slot: &Slot2D) -> Option<&[f32]> {
    let deform = slot.deform.as_ref()?;
    let shown = slot.attachment.as_ref();
    let authored = deform.attachment.as_ref();
    let same = match (authored, shown) {
        (None, None) => true,
        (Some(authored), Some(shown)) => std::sync::Arc::ptr_eq(authored, shown),
        _ => false,
    };
    return if same { Some(&deform.offsets) } else { None };
}

/// Writes offsets onto a slot for a named attachment, reusing the existing buffer at the same length
/// (TS `setSkeleton2DSlotDeform`). Passing `None` clears.
// flight-lint: allow(conform-array) Rust adopts an owned Vec<f32> where TS passes a shared Float32Array reference
pub fn set_skeleton_2d_slot_deform<'a>(
    slot: &'a mut Slot2D,
    attachment: Option<Attachment2DRef>,
    offsets: Option<&[f32]>,
) -> Option<&'a Skeleton2DSlotDeform> {
    let Some(offsets) = offsets else {
        slot.deform = None;
        return None;
    };
    if let Some(existing) = slot.deform.as_mut()
        && existing.offsets.len() == offsets.len()
    {
        existing.offsets.copy_from_slice(offsets);
        existing.attachment = attachment;
        return slot.deform.as_ref();
    }
    slot.deform = Some(Skeleton2DSlotDeform {
        attachment,
        offsets: offsets.to_vec(),
    });
    return slot.deform.as_ref();
}
