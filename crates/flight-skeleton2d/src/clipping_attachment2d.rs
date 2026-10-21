//! Clipping polygon and draw-order range (TS `clippingAttachment2D.ts`).

use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::skin_attachment2d_points::skin_skeleton_2d_attachment_points;
use crate::types::*;

/// The half-open slot range a clipping attachment covers.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Skeleton2DClippingAttachmentSlotRange {
    pub end: i32,
    pub start: i32,
}

/// Produces a clipping polygon's world points (TS `computeSkeleton2DClippingAttachmentVertices`).
// flight-lint: allow(conform-params) D5: the caller-owned guard state is threaded explicitly instead of a module-global slot
pub fn compute_skeleton_2d_clipping_attachment_vertices(
    out: &mut [f32],
    attachment: &ClippingAttachment2D,
    skeleton: &Skeleton2D,
    bone_index: i32,
    deform: Option<&[f32]>,
    guards: &Skeleton2DGuardState,
) {
    skin_skeleton_2d_attachment_points(
        out,
        attachment.skin.as_ref(),
        attachment.vertices.as_deref(),
        skeleton,
        bone_index,
        deform,
        "ClippingAttachment2D",
        guards,
    );
}

/// The half-open slot range a clipping attachment covers from `slot_index` (TS
/// `getSkeleton2DClippingAttachmentSlotRange`).
pub fn get_skeleton_2d_clipping_attachment_slot_range(
    attachment: &ClippingAttachment2D,
    slot_index: i32,
    slot_count: i32,
) -> Skeleton2DClippingAttachmentSlotRange {
    let start = slot_index + 1;
    let declared = attachment.end_slot_index;
    let end = if declared < start {
        slot_count
    } else {
        (declared + 1).min(slot_count)
    };
    return Skeleton2DClippingAttachmentSlotRange {
        end: end.max(start),
        start,
    };
}
