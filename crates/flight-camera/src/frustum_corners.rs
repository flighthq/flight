//! The eight world-space frustum corners (TS `frustumCorners.ts`).

use flight_geometry::{Vector3, create_matrix4, inverse_matrix4};

use crate::camera::get_camera_3d_view_projection_matrix4;
use crate::types::*;

/// NDC cube vertices, near row then far row (TS `getCamera3DFrustumCorners` ordering).
const NDC_CORNERS: [[f32; 3]; 8] = [
    [-1.0, -1.0, -1.0],
    [1.0, -1.0, -1.0],
    [-1.0, 1.0, -1.0],
    [1.0, 1.0, -1.0],
    [-1.0, -1.0, 1.0],
    [1.0, -1.0, 1.0],
    [-1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
];

/// Writes the 8 world-space corners of the camera frustum into `out` and returns true, or returns
/// false (leaving `out` untouched) when the view-projection is non-invertible (TS
/// `getCamera3DFrustumCorners`). Alias-safe: all corners are computed before writing.
pub fn get_camera_3d_frustum_corners(
    out: &mut [Vector3; 8],
    camera: &Camera3D,
    aspect: f32,
) -> bool {
    let mut view_projection = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    get_camera_3d_view_projection_matrix4(&mut view_projection, camera, aspect);
    let mut inverse = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    if !inverse_matrix4(&mut inverse, &view_projection) {
        return false;
    }
    let m = inverse.m;
    let mut results = [[0.0_f32; 3]; 8];
    let mut index = 0;
    while index < 8 {
        let corner = NDC_CORNERS[index];
        let nx = corner[0];
        let ny = corner[1];
        let nz = corner[2];
        let mut wx = m[0] * nx + m[4] * ny + m[8] * nz + m[12];
        let mut wy = m[1] * nx + m[5] * ny + m[9] * nz + m[13];
        let mut wz = m[2] * nx + m[6] * ny + m[10] * nz + m[14];
        let ww = m[3] * nx + m[7] * ny + m[11] * nz + m[15];
        if ww != 0.0 {
            let inv_w = 1.0 / ww;
            wx *= inv_w;
            wy *= inv_w;
            wz *= inv_w;
        }
        results[index] = [wx, wy, wz];
        index += 1;
    }
    index = 0;
    while index < 8 {
        out[index].x = results[index][0];
        out[index].y = results[index][1];
        out[index].z = results[index][2];
        index += 1;
    }
    return true;
}
