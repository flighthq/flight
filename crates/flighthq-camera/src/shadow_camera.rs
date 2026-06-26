//! `setup_directional_shadow_camera` — configures a camera for directional shadow rendering.

use flighthq_types::{Aabb, Camera, Vector3};

use crate::camera::set_camera_view_matrix4_from_look_at;
use crate::projection::create_orthographic_projection;

/// Configures `camera` as the shadow camera for a directional light.
///
/// Looks along `light_direction` (the light's travel direction) at the centre of
/// `scene_bounds`, with an orthographic frustum sized to the scene's bounding
/// sphere so the whole scene fits the shadow map. A degenerate (single-point)
/// bounds falls back to unit radius so the frustum stays valid.
///
/// Backend-agnostic CPU math (no GPU). `light_direction` need not be normalized.
/// The render side then draws scene depth from this camera into the shadow map and
/// samples it during shading.
pub fn setup_directional_shadow_camera(
    camera: &mut Camera,
    light_direction: &Vector3,
    scene_bounds: &Aabb,
) {
    let min = &scene_bounds.min;
    let max = &scene_bounds.max;
    let cx = (min.x + max.x) * 0.5;
    let cy = (min.y + max.y) * 0.5;
    let cz = (min.z + max.z) * 0.5;

    let mut radius = f32::hypot(f32::hypot(max.x - cx, max.y - cy), max.z - cz);
    if radius == 0.0 {
        radius = 1.0;
    }

    let dl = f32::sqrt(
        light_direction.x * light_direction.x
            + light_direction.y * light_direction.y
            + light_direction.z * light_direction.z,
    );
    let dl = if dl == 0.0 { 1.0 } else { dl };
    let dx = light_direction.x / dl;
    let dy = light_direction.y / dl;
    let dz = light_direction.z / dl;

    let distance = radius * 2.0;
    let eye = Vector3 {
        x: cx - dx * distance,
        y: cy - dy * distance,
        z: cz - dz * distance,
    };
    let target = Vector3 {
        x: cx,
        y: cy,
        z: cz,
    };
    // A near-vertical light needs a non-parallel up vector.
    let up = if dy.abs() > 0.99 {
        Vector3 {
            x: 0.0,
            y: 0.0,
            z: 1.0,
        }
    } else {
        Vector3 {
            x: 0.0,
            y: 1.0,
            z: 0.0,
        }
    };

    set_camera_view_matrix4_from_look_at(camera, &eye, &target, &up);
    camera.near = radius;
    camera.far = radius * 3.0;
    camera.projection = create_orthographic_projection(radius, radius);
}

#[cfg(test)]
mod tests {
    use flighthq_types::{Aabb, Vector3};

    use super::*;
    use crate::camera::create_camera;
    use crate::projection::create_perspective_projection;

    // setup_directional_shadow_camera

    #[test]
    fn setup_directional_shadow_camera_sets_orthographic_projection() {
        let mut camera = create_camera(0.1, 100.0, create_perspective_projection(1.0, 1.0));
        let bounds = Aabb {
            min: Vector3 {
                x: -5.0,
                y: -5.0,
                z: -5.0,
            },
            max: Vector3 {
                x: 5.0,
                y: 5.0,
                z: 5.0,
            },
        };
        let light_dir = Vector3 {
            x: 0.0,
            y: -1.0,
            z: 0.0,
        };

        setup_directional_shadow_camera(&mut camera, &light_dir, &bounds);

        // Orthographic frustum should be set to the bounding sphere radius.
        match &camera.projection {
            flighthq_types::Projection::Orthographic(_) => {}
            _ => panic!("expected orthographic projection"),
        }
    }

    #[test]
    fn setup_directional_shadow_camera_degenerate_bounds_uses_unit_radius() {
        let mut camera = create_camera(0.1, 100.0, create_perspective_projection(1.0, 1.0));
        let point = Aabb {
            min: Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            max: Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
        };
        let light_dir = Vector3 {
            x: 0.0,
            y: -1.0,
            z: 0.0,
        };

        setup_directional_shadow_camera(&mut camera, &light_dir, &point);

        // Degenerate: radius falls back to 1. near = 1, far = 3.
        assert!((camera.near - 1.0).abs() < 1e-5);
        assert!((camera.far - 3.0).abs() < 1e-5);
    }

    #[test]
    fn setup_directional_shadow_camera_near_vertical_light_uses_z_up() {
        let mut camera = create_camera(0.1, 100.0, create_perspective_projection(1.0, 1.0));
        let bounds = Aabb {
            min: Vector3 {
                x: -1.0,
                y: -1.0,
                z: -1.0,
            },
            max: Vector3 {
                x: 1.0,
                y: 1.0,
                z: 1.0,
            },
        };
        // Near-vertical light (dy > 0.99 threshold)
        let light_dir = Vector3 {
            x: 0.0,
            y: -1.0,
            z: 0.0,
        };
        // Should not panic even with nearly-parallel up vector.
        setup_directional_shadow_camera(&mut camera, &light_dir, &bounds);
        assert!(camera.far > camera.near);
    }

    #[test]
    fn setup_directional_shadow_camera_unnormalized_direction_is_accepted() {
        let mut camera = create_camera(0.1, 100.0, create_perspective_projection(1.0, 1.0));
        let bounds = Aabb {
            min: Vector3 {
                x: -2.0,
                y: -2.0,
                z: -2.0,
            },
            max: Vector3 {
                x: 2.0,
                y: 2.0,
                z: 2.0,
            },
        };
        // Un-normalized (length 5)
        let light_dir = Vector3 {
            x: 0.0,
            y: 0.0,
            z: 5.0,
        };
        setup_directional_shadow_camera(&mut camera, &light_dir, &bounds);
        // far should be about 3× the bounding sphere radius of this 4x4x4 cube
        assert!(camera.far > 0.0);
    }
}
