//! The 3D camera lifecycle: allocation, view placement, aspect/jitter setters, view-projection
//! composition and the inverse-view-projection cache (TS `camera.ts`).

use std::sync::RwLock;

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{
    Matrix4, Vector3, create_matrix4, inverse_matrix4, multiply_matrix4, set_matrix4_look_at,
};

use crate::projection::set_projection_matrix4;
use crate::reflection::apply_oblique_near_clip_plane;
use crate::types::*;

/// Allocates a 3D camera (TS `createCamera3D`). The view matrix starts as identity, `jitter` at
/// zero and `inverse_view_projection` at identity; there is no separate transform — a `Matrix4` is
/// the only world-to-view representation.
pub fn create_camera_3d(opts: &Camera3DOptions) -> Camera3D {
    let mut out: Camera3D = allocate_entity();
    initialize_camera_3d(&mut out, opts);
    return out;
}

/// Builds a 3D camera under construction (TS `initializeCamera3D`).
// flight-lint: allow(conform-extra) D12: Camera3D extends Entity; the pinned TS index.ts exports no initializeCamera3D
pub fn initialize_camera_3d(out: &mut Camera3D, opts: &Camera3DOptions) {
    out.far = opts.far;
    out.inverse_view_projection = Ref::new(RwLock::new(create_matrix4()));
    out.jitter = Ref::new(RwLock::new(flight_geometry::create_vector2(0.0, 0.0)));
    out.near = opts.near;
    out.near_clip_plane = opts.near_clip_plane.clone();
    out.projection = opts.projection.clone();
    out.view = Ref::new(RwLock::new(create_matrix4()));
}

/// Applies an NDC translation to a projection matrix: clip.xy += jitter * clip.w (TS
/// `applyCamera3DProjectionJitter`). Row operations handle perspective and orthographic matrices
/// uniformly.
fn apply_camera_3d_projection_jitter(out: &mut Matrix4, x: f32, y: f32) {
    let m = &mut out.m;
    m[0] += x * m[3];
    m[4] += x * m[7];
    m[8] += x * m[11];
    m[12] += x * m[15];
    m[1] += y * m[3];
    m[5] += y * m[7];
    m[9] += y * m[11];
    m[13] += y * m[15];
}

/// Writes the inverse of the camera's view-projection matrix into `out` and returns true, or writes
/// NaN and returns false when the view-projection is non-invertible (TS
/// `getCamera3DInverseViewProjectionMatrix4`). `aspect` is viewport width / height. Alias-safe: the
/// camera fields are read before `out` is written.
pub fn get_camera_3d_inverse_view_projection_matrix4(
    out: &mut Matrix4,
    camera: &Camera3D,
    aspect: f32,
) -> bool {
    let mut view_projection = create_matrix4();
    get_camera_3d_view_projection_matrix4(&mut view_projection, camera, aspect);
    return inverse_matrix4(out, &view_projection);
}

/// Writes the camera's view-projection matrix (projection × view) into `out` (TS
/// `getCamera3DViewProjectionMatrix4`). Applies the per-frame jitter and, when present, the oblique
/// near clip plane. Alias-safe: the view matrix is copied before `out` is written.
pub fn get_camera_3d_view_projection_matrix4(out: &mut Matrix4, camera: &Camera3D, aspect: f32) {
    let mut projection = create_matrix4();
    set_projection_matrix4(
        &mut projection,
        &camera.projection,
        aspect,
        camera.near,
        camera.far,
    );
    let (jitter_x, jitter_y) = {
        let jitter = camera.jitter.read().unwrap();
        (jitter.x, jitter.y)
    };
    apply_camera_3d_projection_jitter(&mut projection, jitter_x, jitter_y);
    if let Some(near_clip_plane) = &camera.near_clip_plane {
        let plane = near_clip_plane.read().unwrap();
        apply_oblique_near_clip_plane(&mut projection, &plane);
    }
    let view = {
        let current = camera.view.read().unwrap();
        let mut copy = create_matrix4();
        copy.m = current.m;
        copy
    };
    multiply_matrix4(out, &projection, &view);
}

/// Sets the viewport aspect ratio on the camera's projection in place (TS `setCamera3DAspect`).
/// Perspective writes `aspect`; orthographic keeps `half_height` and sets
/// `half_width = half_height * aspect`; a raw projection is a no-op.
pub fn set_camera_3d_aspect(camera: &mut Camera3D, aspect: f32) {
    match &mut camera.projection {
        Projection::Perspective(projection) => {
            projection.write().unwrap().aspect = aspect;
        }
        Projection::Orthographic(projection) => {
            let half_height = projection.read().unwrap().half_height;
            projection.write().unwrap().half_width = half_height * aspect;
        }
        Projection::Raw(_) => {}
    }
}

/// Sets the camera's per-frame sub-pixel jitter offset (in NDC) in place (TS
/// `setCamera3DJitter`).
pub fn set_camera_3d_jitter(camera: &mut Camera3D, x: f32, y: f32) {
    let mut jitter = camera.jitter.write().unwrap();
    jitter.x = x;
    jitter.y = y;
}

/// Installs or removes the caller-owned view precondition hook (TS `setCamera3DViewGuard`). The
/// core module stays message-free; `enable_camera_guards` installs a logging adapter.
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState replaces the source module-level guard hook
pub fn set_camera_3d_view_guard(
    guard_state: &CameraGuardStateRef,
    guard: Option<Camera3DViewGuard>,
) {
    guard_state.write().unwrap().view_guard = guard;
}

/// Builds the camera's world-to-view matrix in place from an eye position, look-at target and up
/// vector (TS `setCamera3DViewMatrix4FromLookAt`). All vector inputs are read before writing.
pub fn set_camera_3d_view_matrix4_from_look_at(
    camera: &mut Camera3D,
    eye: &Vector3,
    target: &Vector3,
    up: &Vector3,
) {
    let mut view = camera.view.write().unwrap();
    set_matrix4_look_at(&mut view, eye, target, up);
}

/// Copies a precomputed world-to-view matrix into the camera in place (TS
/// `setCamera3DViewMatrix4FromMatrix4`). The source marks the view as needing to be orthonormal;
/// the hook reports misuse without enforcing it here.
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState replaces the source module-level guard hook
pub fn set_camera_3d_view_matrix4_from_matrix4(
    guard_state: &CameraGuardStateRef,
    camera: &mut Camera3D,
    view: &Matrix4,
) {
    camera.view.write().unwrap().m = view.m;
    let guard = {
        let current = guard_state.read().unwrap();
        current.view_guard.clone()
    };
    if let Some(guard) = guard {
        guard(camera);
    }
}

/// Refreshes the camera's inverse-view-projection cache for the supplied aspect (TS
/// `updateCamera3DInverseViewProjection`). Returns true on success; on failure the prior valid cache
/// is left untouched.
pub fn update_camera_3d_inverse_view_projection(camera: &Camera3D, aspect: f32) -> bool {
    let mut inverse = create_matrix4();
    let ok = get_camera_3d_inverse_view_projection_matrix4(&mut inverse, camera, aspect);
    if ok {
        camera.inverse_view_projection.write().unwrap().m = inverse.m;
    }
    return ok;
}
