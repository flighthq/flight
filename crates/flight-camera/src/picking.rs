//! Screen-to-world rays and world-to-screen projection (TS `picking.ts`).

use flight_geometry::{
    Ray3D, Vector3, create_matrix4, create_vector3, inverse_matrix4, normalize_vector3,
    subtract_vector3,
};

use crate::camera::get_camera_3d_view_projection_matrix4;
use crate::types::*;

/// Writes the world-space ray from the camera through an NDC screen point into `out` and returns
/// true, or returns false (leaving `out` untouched) when the view-projection is non-invertible (TS
/// `getCamera3DScreenToWorldRay`). The origin is the near-plane world position and the direction is
/// normalized.
pub fn get_camera_3d_screen_to_world_ray(
    out: &mut Ray3D,
    camera: &Camera3D,
    ndc_x: f32,
    ndc_y: f32,
    aspect: f32,
) -> bool {
    let mut view_projection = create_matrix4();
    get_camera_3d_view_projection_matrix4(&mut view_projection, camera, aspect);
    let mut inverse = create_matrix4();
    if !inverse_matrix4(&mut inverse, &view_projection) {
        return false;
    }
    let m = inverse.m;
    let nx = ndc_x;
    let ny = ndc_y;
    let mut near_x = m[0] * nx + m[4] * ny + m[8] * -1.0 + m[12];
    let mut near_y = m[1] * nx + m[5] * ny + m[9] * -1.0 + m[13];
    let mut near_z = m[2] * nx + m[6] * ny + m[10] * -1.0 + m[14];
    let near_w = m[3] * nx + m[7] * ny + m[11] * -1.0 + m[15];
    if near_w != 0.0 {
        let inv_w = 1.0 / near_w;
        near_x *= inv_w;
        near_y *= inv_w;
        near_z *= inv_w;
    }
    let mut far_x = m[0] * nx + m[4] * ny + m[8] + m[12];
    let mut far_y = m[1] * nx + m[5] * ny + m[9] + m[13];
    let mut far_z = m[2] * nx + m[6] * ny + m[10] + m[14];
    let far_w = m[3] * nx + m[7] * ny + m[11] + m[15];
    if far_w != 0.0 {
        let inv_w = 1.0 / far_w;
        far_x *= inv_w;
        far_y *= inv_w;
        far_z *= inv_w;
    }
    let near_point = create_vector3(near_x, near_y, near_z);
    let far_point = create_vector3(far_x, far_y, far_z);
    let mut direction = create_vector3(0.0, 0.0, 0.0);
    subtract_vector3(&mut direction, &far_point, &near_point);
    let unnormalized = create_vector3(direction.x, direction.y, direction.z);
    normalize_vector3(&mut direction, &unnormalized);
    out.origin.x = near_x;
    out.origin.y = near_y;
    out.origin.z = near_z;
    out.direction.x = direction.x;
    out.direction.y = direction.y;
    out.direction.z = direction.z;
    return true;
}

/// Writes the NDC coordinates of a world-space point into `out` and returns true, or returns false
/// (leaving `out` untouched) when the point is behind the camera (TS
/// `getCamera3DWorldToScreen`).
pub fn get_camera_3d_world_to_screen(
    out: &mut Vector3,
    camera: &Camera3D,
    world_point: &Vector3,
    aspect: f32,
) -> bool {
    let mut view_projection = create_matrix4();
    get_camera_3d_view_projection_matrix4(&mut view_projection, camera, aspect);
    let m = view_projection.m;
    let wx = world_point.x;
    let wy = world_point.y;
    let wz = world_point.z;
    let clip_x = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
    let clip_y = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
    let clip_z = m[2] * wx + m[6] * wy + m[10] * wz + m[14];
    let clip_w = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
    if clip_w <= 0.0 {
        return false;
    }
    let inv_w = 1.0 / clip_w;
    out.x = clip_x * inv_w;
    out.y = clip_y * inv_w;
    out.z = clip_z * inv_w;
    return true;
}
