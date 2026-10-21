//! NDC-to-view-space depth conversion (TS `depth.ts`).

use crate::projection::is_orthographic_projection;
use crate::types::*;

/// Converts a raw NDC depth value (ndcZ in [-1, 1]) to a linear view-space Z (TS
/// `getCamera3DLinearDepth`). Negative values are in front of the camera. Returns 0 for a degenerate
/// clip range or denominator.
pub fn get_camera_3d_linear_depth(camera: &Camera3D, ndc_z: f32) -> f32 {
    let near = camera.near;
    let far = camera.far;
    let range = far - near;
    if range == 0.0 {
        return 0.0;
    }
    if is_orthographic_projection(&camera.projection) {
        return -(near + ((ndc_z + 1.0) * range) / 2.0);
    }
    let denominator = ndc_z * range - (far + near);
    if denominator == 0.0 {
        return 0.0;
    }
    return (2.0 * far * near) / denominator;
}

/// Converts a raw NDC depth value to a positive linear depth in [near, far] (TS
/// `getCamera3DViewSpaceZ`).
pub fn get_camera_3d_view_space_z(camera: &Camera3D, ndc_z: f32) -> f32 {
    return -get_camera_3d_linear_depth(camera, ndc_z);
}
