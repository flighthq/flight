//! Point attachment world position and direction (TS `pointAttachment2D.ts`).

use flight_geometry::Vector2;
use flight_math::{DEG_TO_RAD, RAD_TO_DEG};

use crate::types::*;

/// Writes a point attachment's world position into `out` (TS `computeSkeleton2DPointAttachmentPosition`).
pub fn compute_skeleton_2d_point_attachment_position(
    out: &mut Vector2,
    attachment: &PointAttachment2D,
    skeleton: &Skeleton2D,
    bone_index: i32,
) {
    let world = &skeleton.world_matrices;
    if bone_index < 0 || bone_index as usize * SKELETON_2D_MATRIX_STRIDE >= world.len() {
        return;
    }
    let b = bone_index as usize * SKELETON_2D_MATRIX_STRIDE;
    let x = attachment.x;
    let y = attachment.y;
    out.x = world[b] * x + world[b + 2] * y + world[b + 4];
    out.y = world[b + 1] * x + world[b + 3] * y + world[b + 5];
}

/// The point's world direction in degrees, carried through the bone's transformed x axis (TS
/// `computeSkeleton2DPointAttachmentRotation`).
pub fn compute_skeleton_2d_point_attachment_rotation(
    attachment: &PointAttachment2D,
    skeleton: &Skeleton2D,
    bone_index: i32,
) -> f32 {
    let world = &skeleton.world_matrices;
    if bone_index < 0 || bone_index as usize * SKELETON_2D_MATRIX_STRIDE >= world.len() {
        return attachment.rotation;
    }
    let b = bone_index as usize * SKELETON_2D_MATRIX_STRIDE;
    let radians = attachment.rotation * DEG_TO_RAD;
    let cos = radians.cos();
    let sin = radians.sin();
    let x = world[b] * cos + world[b + 2] * sin;
    let y = world[b + 1] * cos + world[b + 3] * sin;
    return y.atan2(x) * RAD_TO_DEG;
}
