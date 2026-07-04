//! Ray construction through a bounding sphere and ray-plane intersection.

use flighthq_types::{BoundingSphere, Camera, Plane, Ray3D, Vector3Like};

use crate::picking::{get_camera_screen_to_world_ray, get_camera_world_to_screen};

/// Returns the world-space ray from the camera through the center of a bounding
/// sphere, writing the result into `out` and returning `true`. The ray is
/// suitable for picking and hover-highlight queries.
///
/// Returns `false` when:
///   - The sphere is empty (negative radius).
///   - The sphere center is at or behind the camera (`w <= 0` in clip space).
///   - The view-projection is non-invertible.
///
/// `aspect` is viewport width / height.
///
/// Reads all inputs before writing `out`, so it is alias-safe.
pub fn get_camera_ray_through_bounding_sphere(
    out: &mut Ray3D,
    camera: &Camera,
    sphere: &BoundingSphere,
    aspect: f32,
) -> bool {
    if sphere.radius < 0.0 {
        return false;
    }
    // Project sphere center to NDC.
    let center = Vector3Like {
        x: sphere.center.x,
        y: sphere.center.y,
        z: sphere.center.z,
    };
    let mut ndc = Vector3Like::default();
    if !get_camera_world_to_screen(&mut ndc, camera, &center, aspect) {
        return false;
    }
    // Unproject those NDC coords back to a world-space ray.
    get_camera_screen_to_world_ray(out, camera, ndc.x, ndc.y, aspect)
}

/// Computes the intersection of a ray with an infinite plane, writing the hit
/// point into `out` and returning `true`. Returns `false` when:
///   - The ray direction is parallel to the plane (`dot(normal, direction) = 0`).
///   - The intersection is behind the ray origin (`t < 0`).
///   - The plane normal is zero.
///
/// The plane is given in the form `a*x + b*y + c*z + d = 0`. The normal
/// `(a, b, c)` does not need to be unit length. The ray direction does not need
/// to be unit length either.
///
/// Reads all inputs before writing `out`, so it is alias-safe.
pub fn intersect_camera_ray_with_plane(out: &mut Vector3Like, ray: &Ray3D, plane: &Plane) -> bool {
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
    let denom = a * dx + b * dy + c * dz;
    if denom == 0.0 {
        return false;
    }
    let t = -(a * ox + b * oy + c * oz + d) / denom;
    if t < 0.0 {
        return false;
    }
    out.x = ox + t * dx;
    out.y = oy + t * dy;
    out.z = oz + t * dz;
    true
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::create_vector3;
    use flighthq_types::{BoundingSphere, Plane, Ray3D, Vector3, Vector3Like};

    use super::*;
    use crate::camera::{create_camera, set_camera_view_matrix4_from_look_at};
    use crate::projection::create_perspective_projection;

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 1e-3, "{a} not close to {b}");
    }

    fn make_camera() -> Camera {
        let projection = create_perspective_projection(std::f32::consts::FRAC_PI_2, 1.0);
        let mut camera = create_camera(0.1, 100.0, projection);
        set_camera_view_matrix4_from_look_at(
            &mut camera,
            &create_vector3(0.0, 0.0, 10.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        camera
    }

    mod get_camera_ray_through_bounding_sphere {
        use super::*;

        #[test]
        fn returns_true_for_a_sphere_in_front_of_the_camera() {
            let camera = make_camera();
            let sphere = BoundingSphere {
                center: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 5.0,
                },
                radius: 1.0,
            };
            let mut ray = Ray3D::default();
            assert!(get_camera_ray_through_bounding_sphere(
                &mut ray, &camera, &sphere, 1.0
            ));
        }

        #[test]
        fn returns_a_ray_pointing_from_the_camera_toward_the_sphere_center() {
            let camera = make_camera();
            let sphere = BoundingSphere {
                center: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                radius: 1.0,
            };
            let mut ray = Ray3D::default();
            get_camera_ray_through_bounding_sphere(&mut ray, &camera, &sphere, 1.0);
            close(ray.direction.x, 0.0);
            close(ray.direction.y, 0.0);
            close(ray.direction.z, -1.0);
        }

        #[test]
        fn returns_false_for_an_empty_sphere() {
            let camera = make_camera();
            let sphere = BoundingSphere {
                center: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 5.0,
                },
                radius: -1.0,
            };
            let mut ray = Ray3D::default();
            assert!(!get_camera_ray_through_bounding_sphere(
                &mut ray, &camera, &sphere, 1.0
            ));
        }

        #[test]
        fn returns_false_when_the_sphere_center_is_behind_the_camera() {
            let camera = make_camera();
            let sphere = BoundingSphere {
                center: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 15.0,
                },
                radius: 1.0,
            };
            let mut ray = Ray3D::default();
            assert!(!get_camera_ray_through_bounding_sphere(
                &mut ray, &camera, &sphere, 1.0
            ));
        }
    }

    mod intersect_camera_ray_with_plane {
        use super::*;

        #[test]
        fn returns_the_hit_point_for_a_ray_pointing_straight_down() {
            let ray = Ray3D {
                origin: Vector3 {
                    x: 0.0,
                    y: 5.0,
                    z: 0.0,
                },
                direction: Vector3 {
                    x: 0.0,
                    y: -1.0,
                    z: 0.0,
                },
            };
            let plane = Plane {
                a: 0.0,
                b: 1.0,
                c: 0.0,
                d: 0.0,
            };
            let mut hit = Vector3Like::default();
            assert!(intersect_camera_ray_with_plane(&mut hit, &ray, &plane));
            close(hit.x, 0.0);
            close(hit.y, 0.0);
            close(hit.z, 0.0);
        }

        #[test]
        fn returns_false_when_the_ray_is_parallel_to_the_plane() {
            let ray = Ray3D {
                origin: Vector3 {
                    x: 0.0,
                    y: 1.0,
                    z: 0.0,
                },
                direction: Vector3 {
                    x: 1.0,
                    y: 0.0,
                    z: 0.0,
                },
            };
            let plane = Plane {
                a: 0.0,
                b: 1.0,
                c: 0.0,
                d: -1.0,
            };
            let mut hit = Vector3Like::default();
            assert!(!intersect_camera_ray_with_plane(&mut hit, &ray, &plane));
        }

        #[test]
        fn returns_false_when_the_intersection_is_behind_the_ray_origin() {
            let ray = Ray3D {
                origin: Vector3 {
                    x: 0.0,
                    y: -5.0,
                    z: 0.0,
                },
                direction: Vector3 {
                    x: 0.0,
                    y: 1.0,
                    z: 0.0,
                },
            };
            let plane = Plane {
                a: 0.0,
                b: 1.0,
                c: 0.0,
                d: 10.0,
            };
            let mut hit = Vector3Like::default();
            assert!(!intersect_camera_ray_with_plane(&mut hit, &ray, &plane));
        }

        #[test]
        fn computes_the_correct_hit_point_for_a_diagonal_ray() {
            let ray = Ray3D {
                origin: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                direction: Vector3 {
                    x: 1.0,
                    y: 1.0,
                    z: 0.0,
                },
            };
            let plane = Plane {
                a: 1.0,
                b: 1.0,
                c: 0.0,
                d: -4.0,
            };
            let mut hit = Vector3Like::default();
            assert!(intersect_camera_ray_with_plane(&mut hit, &ray, &plane));
            close(hit.x, 2.0);
            close(hit.y, 2.0);
            close(hit.z, 0.0);
        }

        #[test]
        fn is_alias_safe_when_out_is_the_ray_origin() {
            let ray = Ray3D {
                origin: Vector3 {
                    x: 0.0,
                    y: 5.0,
                    z: 0.0,
                },
                direction: Vector3 {
                    x: 0.0,
                    y: -1.0,
                    z: 0.0,
                },
            };
            let plane = Plane {
                a: 0.0,
                b: 1.0,
                c: 0.0,
                d: 0.0,
            };
            // Write into a separate out to test alias-safety pattern.
            let mut hit = Vector3Like {
                x: ray.origin.x,
                y: ray.origin.y,
                z: ray.origin.z,
            };
            assert!(intersect_camera_ray_with_plane(&mut hit, &ray, &plane));
            close(hit.y, 0.0);
        }
    }
}
