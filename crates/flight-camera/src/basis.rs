//! Camera basis and eye extraction from the view matrix (TS `basis.ts`).

use flight_geometry::Vector3;

use crate::types::*;

/// Extracts the camera's world-space forward direction from the view matrix and writes it into
/// `out` (TS `getCamera3DForward`). It is the negated third row of the view matrix.
pub fn get_camera_3d_forward(out: &mut Vector3, camera: &Camera3D) {
    let m = camera.view.read().unwrap().m;
    out.x = -m[2];
    out.y = -m[6];
    out.z = -m[10];
}

/// Extracts the camera's world-space eye position from the view matrix and writes it into `out`
/// (TS `getCamera3DPosition`): `eye = -(R^T · t)` for an orthonormal view.
pub fn get_camera_3d_position(out: &mut Vector3, camera: &Camera3D) {
    let m = camera.view.read().unwrap().m;
    let m00 = m[0];
    let m01 = m[1];
    let m02 = m[2];
    let m10 = m[4];
    let m11 = m[5];
    let m12 = m[6];
    let m20 = m[8];
    let m21 = m[9];
    let m22 = m[10];
    let tx = m[12];
    let ty = m[13];
    let tz = m[14];
    out.x = -(m00 * tx + m01 * ty + m02 * tz);
    out.y = -(m10 * tx + m11 * ty + m12 * tz);
    out.z = -(m20 * tx + m21 * ty + m22 * tz);
}

/// Extracts the camera's world-space right direction from the view matrix into `out` (TS
/// `getCamera3DRight`). It is the first row of the view matrix.
pub fn get_camera_3d_right(out: &mut Vector3, camera: &Camera3D) {
    let m = camera.view.read().unwrap().m;
    out.x = m[0];
    out.y = m[4];
    out.z = m[8];
}

/// Extracts the camera's world-space up direction from the view matrix into `out` (TS
/// `getCamera3DUp`). It is the second row of the view matrix.
pub fn get_camera_3d_up(out: &mut Vector3, camera: &Camera3D) {
    let m = camera.view.read().unwrap().m;
    out.x = m[1];
    out.y = m[5];
    out.z = m[9];
}
