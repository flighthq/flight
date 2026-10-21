//! Camera ray companions: rays through bounding spheres and ray-plane hits (TS `intersection.ts`).

use flight_geometry::{BoundingSphere, Plane, Ray3D, Vector3, create_vector3};

use crate::picking::{get_camera_3d_screen_to_world_ray, get_camera_3d_world_to_screen};
use crate::types::*;

/// Returns the world-space ray from the camera through the center of a bounding sphere and writes
/// it into `out` (TS `getCamera3DRayThroughBoundingSphere`). Returns false for an empty sphere, a
/// center at or behind the camera, or a non-invertible view-projection.
pub fn get_camera_3d_ray_through_bounding_sphere(
    out: &mut Ray3D,
    camera: &Camera3D,
    sphere: &BoundingSphere,
    aspect: f32,
) -> bool {
    if sphere.radius < 0.0 {
        return false;
    }
    let mut ndc = create_vector3(0.0, 0.0, 0.0);
    if !get_camera_3d_world_to_screen(&mut ndc, camera, &sphere.center, aspect) {
        return false;
    }
    return get_camera_3d_screen_to_world_ray(out, camera, ndc.x, ndc.y, aspect);
}

/// Computes the intersection of a ray with an infinite plane and writes the hit point into `out`
/// (TS `intersectCamera3DRayWithPlane`). Returns false for a parallel ray, a hit behind the origin,
/// or a zero normal.
pub fn intersect_camera_3d_ray_with_plane(out: &mut Vector3, ray: &Ray3D, plane: &Plane) -> bool {
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let a = plane.a;
    let b = plane.b;
    let c = plane.c;
    let d = plane.d;
    let denominator = a * dx + b * dy + c * dz;
    if denominator == 0.0 {
        return false;
    }
    let t = -(a * ox + b * oy + c * oz + d) / denominator;
    if t < 0.0 {
        return false;
    }
    out.x = ox + t * dx;
    out.y = oy + t * dy;
    out.z = oz + t * dz;
    return true;
}
