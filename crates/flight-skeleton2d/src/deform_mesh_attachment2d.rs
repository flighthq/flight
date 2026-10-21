//! Mesh attachment deformation (TS `deformMeshAttachment2D.ts`).

use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::skin_attachment2d_points::skin_skeleton_2d_attachment_points;
use crate::types::*;

/// Deforms a mesh's vertices into flat interleaved world positions (TS
/// `deformSkeleton2DMeshAttachment`).
// flight-lint: allow(conform-params) D5: the caller-owned guard state is threaded explicitly instead of a module-global slot
pub fn deform_skeleton_2d_mesh_attachment(
    out: &mut [f32],
    attachment: &MeshAttachment2D,
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
        "MeshAttachment2D",
        guards,
    );
}
