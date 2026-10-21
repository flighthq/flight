//! Camera frustum extraction and culling tests (TS `culling.ts`).

use flight_geometry::{
    Aabb, BoundingSphere, Frustum, Vector3, create_frustum, create_matrix4,
    is_frustum_containing_point, is_frustum_intersecting_aabb, is_frustum_intersecting_sphere,
    set_frustum_from_matrix4,
};

use crate::camera::get_camera_3d_view_projection_matrix4;
use crate::types::*;

/// Extracts the six clip planes of the camera's view frustum into `out` (TS `getCamera3DFrustum`).
/// The planes are normalized with inward-pointing normals.
pub fn get_camera_3d_frustum(out: &mut Frustum, camera: &Camera3D, aspect: f32) {
    let mut view_projection = create_matrix4();
    get_camera_3d_view_projection_matrix4(&mut view_projection, camera, aspect);
    set_frustum_from_matrix4(out, &view_projection);
}

/// Returns true when an axis-aligned bounding box intersects or is contained by the camera frustum
/// (TS `isBoxInCamera3DFrustum`). Conservative: no false negatives.
pub fn is_box_in_camera_3d_frustum(camera: &Camera3D, aabb: &Aabb, aspect: f32) -> bool {
    let mut frustum = create_frustum();
    get_camera_3d_frustum(&mut frustum, camera, aspect);
    return is_frustum_intersecting_aabb(&frustum, aabb);
}

/// Returns true when a world-space point lies inside the camera frustum (TS
/// `isPointInCamera3DFrustum`).
pub fn is_point_in_camera_3d_frustum(camera: &Camera3D, point: &Vector3, aspect: f32) -> bool {
    let mut frustum = create_frustum();
    get_camera_3d_frustum(&mut frustum, camera, aspect);
    return is_frustum_containing_point(&frustum, point);
}

/// Returns true when a bounding sphere intersects or is contained by the camera frustum (TS
/// `isSphereInCamera3DFrustum`). An empty sphere always returns false.
pub fn is_sphere_in_camera_3d_frustum(
    camera: &Camera3D,
    sphere: &BoundingSphere,
    aspect: f32,
) -> bool {
    let mut frustum = create_frustum();
    get_camera_3d_frustum(&mut frustum, camera, aspect);
    return is_frustum_intersecting_sphere(&frustum, sphere);
}
