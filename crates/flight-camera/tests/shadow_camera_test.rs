use flight_camera::contract::*;
use flight_geometry::{create_aabb, create_vector3};

use crate::test_support::*;

fn camera() -> Camera3D {
    return camera_3d(0.1, 100.0, 1.0);
}

fn bounds() -> flight_geometry::Aabb {
    return create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
}

fn orthographic(projection: &Projection) -> (f32, f32) {
    return match projection {
        Projection::Orthographic(value) => {
            let borrowed = value.read().unwrap();
            (borrowed.half_width, borrowed.half_height)
        }
        _ => panic!("expected an orthographic projection"),
    };
}

mod configure_directional_shadow_camera_3d {
    use super::*;

    #[test]
    fn switches_the_camera_to_an_orthographic_frustum_sized_to_the_scene_sphere() {
        let mut camera = camera();
        configure_directional_shadow_camera_3d(
            &mut camera,
            &create_vector3(0.0, -1.0, 0.0),
            &bounds(),
        );
        assert!(camera.projection.is_orthographic());
        let radius = 1.0_f32.hypot(1.0).hypot(1.0);
        let (half_width, _half_height) = orthographic(&camera.projection);
        assert_close(half_width, radius);
        assert_close(camera.near, radius);
        assert_close(camera.far, radius * 3.0);
    }

    #[test]
    fn places_the_scene_center_two_radii_in_front_along_the_light_direction() {
        let mut camera = camera();
        configure_directional_shadow_camera_3d(
            &mut camera,
            &create_vector3(0.0, -1.0, 0.0),
            &bounds(),
        );
        let distance = 1.0_f32.hypot(1.0).hypot(1.0) * 2.0;
        let view = camera.view.read().unwrap();
        assert_close(view.m[12], 0.0);
        assert_close(view.m[13], 0.0);
        assert_close(view.m[14], -distance);
    }
}

mod configure_directional_shadow_camera_3d_tight_fit {
    use super::*;

    #[test]
    fn fits_light_space_extents_more_tightly_than_the_sphere_fit() {
        let mut sphere_camera = camera();
        let mut tight_camera = camera();
        let scene_bounds = create_aabb(-10.0, -1.0, -2.0, 10.0, 1.0, 2.0);
        let light = create_vector3(0.0, -1.0, 0.0);
        configure_directional_shadow_camera_3d(&mut sphere_camera, &light, &scene_bounds);
        configure_directional_shadow_camera_3d_tight_fit(
            &mut tight_camera,
            &light,
            &scene_bounds,
            None,
        );
        let (sphere_width, sphere_height) = orthographic(&sphere_camera.projection);
        let (tight_width, tight_height) = orthographic(&tight_camera.projection);
        assert_close(tight_width, 10.0);
        assert_close(tight_height, 2.0);
        assert!(tight_width < sphere_width);
        assert!(tight_height < sphere_height);
    }

    #[test]
    fn multiplies_fitted_extents_by_padding() {
        let mut camera = camera();
        configure_directional_shadow_camera_3d_tight_fit(
            &mut camera,
            &create_vector3(0.0, -1.0, 0.0),
            &bounds(),
            Some(1.5),
        );
        let (half_width, half_height) = orthographic(&camera.projection);
        assert_close(half_width, 1.5);
        assert_close(half_height, 1.5);
        assert!(camera.near > 0.0);
        assert!(camera.far > camera.near);
    }

    #[test]
    fn falls_back_to_a_valid_unit_fit_for_empty_bounds_and_a_zero_direction() {
        let mut camera = camera();
        configure_directional_shadow_camera_3d_tight_fit(
            &mut camera,
            &create_vector3(0.0, 0.0, 0.0),
            &create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
            None,
        );
        let (half_width, half_height) = orthographic(&camera.projection);
        assert!(half_width > 0.0);
        assert!(half_height > 0.0);
        assert!(camera.near > 0.0);
        assert!(camera.far > camera.near);
    }
}
