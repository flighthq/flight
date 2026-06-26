//! Screen-to-world ray unprojection and world-to-screen projection.
//!
//! Port of `picking.ts` from `@flighthq/camera`.

use flighthq_geometry::{inverse_matrix4, normalize_vector3, subtract_vector3};
use flighthq_types::{Camera, Matrix4Like, Ray3D, Vector3Like};

use crate::camera::get_camera_view_projection_matrix4;

/// Writes the world-space ray from the camera through an NDC screen point
/// into `out` and returns `true`. Returns `false` (leaving `out` untouched)
/// when the view-projection is non-invertible.
///
/// `ndc_x` / `ndc_y` are normalized device coordinates in `[-1, 1]`
/// (center = 0, top-right = (1, 1)). `aspect` is viewport width / height.
///
/// The returned ray's origin is the near-plane world position and its
/// direction is the normalized world-space direction from near through far.
///
/// Alias-safe: reads all inputs before writing `out`.
pub fn get_camera_screen_to_world_ray(
    out: &mut Ray3D,
    camera: &Camera,
    ndc_x: f32,
    ndc_y: f32,
    aspect: f32,
) -> bool {
    let mut vp = Matrix4Like::default();
    let mut inv_vp = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut vp, camera, aspect);
    if !inverse_matrix4(&mut inv_vp, &vp) {
        return false;
    }
    let m = &inv_vp.m;
    let nx = ndc_x;
    let ny = ndc_y;

    // Unproject near-plane point (nx, ny, -1, 1)
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

    // Unproject far-plane point (nx, ny, 1, 1)
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

    // Direction: from near to far, normalized. Stack scratch values.
    let near_like = Vector3Like {
        x: near_x,
        y: near_y,
        z: near_z,
    };
    let far_like = Vector3Like {
        x: far_x,
        y: far_y,
        z: far_z,
    };
    let mut dir = Vector3Like::default();
    subtract_vector3(&mut dir, &far_like, &near_like);
    let dir_copy = Vector3Like {
        x: dir.x,
        y: dir.y,
        z: dir.z,
    };
    normalize_vector3(&mut dir, &dir_copy);

    out.origin.x = near_x;
    out.origin.y = near_y;
    out.origin.z = near_z;
    out.direction.x = dir.x;
    out.direction.y = dir.y;
    out.direction.z = dir.z;
    true
}

/// Writes the NDC coordinates `(x, y in [-1, 1], z = clip-space depth)` of a
/// world-space point into `out`. Returns `false` (leaving `out` untouched) when
/// the point is behind the camera (`w <= 0`). `aspect` is viewport width / height.
///
/// Alias-safe: reads all inputs before writing `out`.
pub fn get_camera_world_to_screen(
    out: &mut Vector3Like,
    camera: &Camera,
    world_point: &Vector3Like,
    aspect: f32,
) -> bool {
    let mut vp = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut vp, camera, aspect);
    let m = &vp.m;
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
    true
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::create_vector3;

    use super::*;
    use crate::camera::{create_camera, set_camera_view_matrix4_from_look_at};
    use crate::projection::create_perspective_projection;

    fn make_camera() -> Camera {
        let projection = create_perspective_projection(std::f32::consts::FRAC_PI_3, 1.0);
        let mut camera = create_camera(0.1, 100.0, projection);
        set_camera_view_matrix4_from_look_at(
            &mut camera,
            &create_vector3(0.0, 0.0, 5.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        camera
    }

    mod get_camera_screen_to_world_ray {
        use super::*;

        #[test]
        fn center_ndc_origin_z_is_less_than_far() {
            let camera = make_camera();
            let mut ray = Ray3D::default();
            let ok = get_camera_screen_to_world_ray(&mut ray, &camera, 0.0, 0.0, 1.0);
            assert!(ok, "expected invertible view-projection");
            assert!(
                ray.origin.z < camera.far,
                "origin.z ({}) should be less than far ({})",
                ray.origin.z,
                camera.far
            );
        }

        #[test]
        fn direction_is_unit_length() {
            let camera = make_camera();
            let mut ray = Ray3D::default();
            assert!(get_camera_screen_to_world_ray(
                &mut ray, &camera, 0.0, 0.0, 1.0
            ));
            let len = (ray.direction.x * ray.direction.x
                + ray.direction.y * ray.direction.y
                + ray.direction.z * ray.direction.z)
                .sqrt();
            assert!(
                (len - 1.0).abs() < 1e-5,
                "direction not normalized: len={len}"
            );
        }
    }

    mod get_camera_world_to_screen {
        use super::*;

        #[test]
        fn look_at_target_projects_to_ndc_center() {
            let camera = make_camera();
            // The look-at target (origin) should project to approximately NDC (0, 0).
            let world = Vector3Like {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            };
            let mut ndc = Vector3Like::default();
            assert!(get_camera_world_to_screen(&mut ndc, &camera, &world, 1.0));
            assert!((ndc.x).abs() < 1e-4, "expected ndc.x near 0, got {}", ndc.x);
            assert!((ndc.y).abs() < 1e-4, "expected ndc.y near 0, got {}", ndc.y);
        }

        #[test]
        fn returns_false_for_point_behind_camera() {
            let camera = make_camera();
            // Eye is at z=5; a point at z=200 is behind the camera.
            let world = Vector3Like {
                x: 0.0,
                y: 0.0,
                z: 200.0,
            };
            let mut ndc = Vector3Like::default();
            assert!(
                !get_camera_world_to_screen(&mut ndc, &camera, &world, 1.0),
                "expected false for point behind camera"
            );
        }
    }
}
