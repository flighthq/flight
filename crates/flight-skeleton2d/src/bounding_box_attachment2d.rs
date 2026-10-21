//! Bounding-box world polygon (TS `boundingBoxAttachment2D.ts`).

use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::skin_attachment2d_points::skin_skeleton_2d_attachment_points;
use crate::types::*;

/// Produces a bounding box's world polygon in flat interleaved coordinates (TS
/// `computeSkeleton2DBoundingBoxAttachmentVertices`).
// flight-lint: allow(conform-params) D5: the caller-owned guard state is threaded explicitly instead of a module-global slot
pub fn compute_skeleton_2d_bounding_box_attachment_vertices(
    out: &mut [f32],
    attachment: &BoundingBoxAttachment2D,
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
        "BoundingBoxAttachment2D",
        guards,
    );
}
