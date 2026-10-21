//! Planar-reflection camera and oblique near-clip-plane helpers (TS `reflection.ts`).

use flight_geometry::{Matrix4, Plane, create_matrix4, multiply_matrix4, set_matrix4};

use crate::types::*;

/// Modifies a projection matrix so the near clip plane aligns with an arbitrary plane in view space
/// (TS `applyObliqueNearClipPlane`, the Lengyel technique). `projection` is mutated in place.
pub fn apply_oblique_near_clip_plane(projection: &mut Matrix4, view_space_plane: &Plane) {
    let m = &mut projection.m;
    let cx = view_space_plane.a;
    let cy = view_space_plane.b;
    let cz = view_space_plane.c;
    let cw = view_space_plane.d;
    let qx = (camera_sign(cx) + m[8]) / m[0];
    let qy = (camera_sign(cy) + m[9]) / m[5];
    let qz = -1.0;
    let qw = (1.0 + m[10]) / m[14];
    let k = 2.0 / (cx * qx + cy * qy + cz * qz + cw * qw);
    m[2] = k * cx - m[3];
    m[6] = k * cy - m[7];
    m[10] = k * cz - m[11];
    m[14] = k * cw - m[15];
}

fn camera_sign(x: f32) -> f32 {
    return if x < 0.0 { -1.0 } else { 1.0 };
}

/// Computes a reflected camera view across an arbitrary world-space plane and writes the view, near,
/// far, jitter and projection into `out` (TS `reflectCamera3DByPlane`). Alias-safe: every input is
/// read before any output is written.
pub fn reflect_camera_3d_by_plane(out: &mut Camera3D, camera: &Camera3D, plane: &Plane) {
    let pa = plane.a;
    let pb = plane.b;
    let pc = plane.c;
    let pd = plane.d;
    let near = camera.near;
    let far = camera.far;
    let (jitter_x, jitter_y) = {
        let jitter = camera.jitter.read().unwrap();
        (jitter.x, jitter.y)
    };
    let projection = camera.projection.clone();
    let near_clip_plane = camera.near_clip_plane.clone();
    let view = {
        let current = camera.view.read().unwrap();
        let mut copy = create_matrix4();
        copy.m = current.m;
        copy
    };
    let mut reflection = create_matrix4();
    set_matrix4(
        &mut reflection,
        1.0 - 2.0 * pa * pa,
        -2.0 * pa * pb,
        -2.0 * pa * pc,
        0.0,
        -2.0 * pa * pb,
        1.0 - 2.0 * pb * pb,
        -2.0 * pb * pc,
        0.0,
        -2.0 * pa * pc,
        -2.0 * pb * pc,
        1.0 - 2.0 * pc * pc,
        0.0,
        -2.0 * pa * pd,
        -2.0 * pb * pd,
        -2.0 * pc * pd,
        1.0,
    );
    {
        let mut out_view = out.view.write().unwrap();
        multiply_matrix4(&mut out_view, &view, &reflection);
    }
    {
        let mut out_jitter = out.jitter.write().unwrap();
        out_jitter.x = jitter_x;
        out_jitter.y = jitter_y;
    }
    out.near = near;
    out.far = far;
    out.near_clip_plane = near_clip_plane;
    out.projection = projection;
}
