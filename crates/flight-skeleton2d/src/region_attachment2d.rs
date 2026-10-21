//! Rigid region attachment corners (TS `regionAttachment2D.ts`).

use flight_geometry::{
    Matrix, create_matrix, matrix_transform_point_xy, multiply_matrix, set_transform_matrix,
};
use flight_math::DEG_TO_RAD;

use crate::types::*;

/// Writes a region's four world corners bottom-left, top-left, top-right, bottom-right (TS
/// `computeSkeleton2DRegionAttachmentVertices`).
pub fn compute_skeleton_2d_region_attachment_vertices(
    out: &mut [f32],
    attachment: &RegionAttachment2D,
    skeleton: &Skeleton2D,
    bone_index: i32,
) {
    let world = &skeleton.world_matrices;
    if bone_index < 0 || bone_index as usize * SKELETON_2D_MATRIX_STRIDE >= world.len() {
        return;
    }
    let mut local: Matrix = Matrix::default();
    set_transform_matrix(
        &mut local,
        attachment.scale_x,
        attachment.scale_y,
        attachment.rotation * DEG_TO_RAD,
        attachment.x,
        attachment.y,
    );
    let b = bone_index as usize * SKELETON_2D_MATRIX_STRIDE;
    let bone = create_matrix(
        world[b],
        world[b + 1],
        world[b + 2],
        world[b + 3],
        world[b + 4],
        world[b + 5],
    );
    let mut combined: Matrix = Matrix::default();
    multiply_matrix(&mut combined, &bone, &local);
    let hw = attachment.width / 2.0;
    let hh = attachment.height / 2.0;
    let mut corner = flight_geometry::create_vector2(0.0, 0.0);
    matrix_transform_point_xy(&mut corner, &combined, -hw, -hh);
    out[0] = corner.x;
    out[1] = corner.y;
    matrix_transform_point_xy(&mut corner, &combined, -hw, hh);
    out[2] = corner.x;
    out[3] = corner.y;
    matrix_transform_point_xy(&mut corner, &combined, hw, hh);
    out[4] = corner.x;
    out[5] = corner.y;
    matrix_transform_point_xy(&mut corner, &combined, hw, -hh);
    out[6] = corner.x;
    out[7] = corner.y;
}
