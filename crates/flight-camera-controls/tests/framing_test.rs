use flight_camera::contract::{
    OrthographicProjection, Projection, create_orthographic_projection,
    create_perspective_projection,
};
use flight_camera_controls::contract::*;
use flight_geometry::create_bounding_sphere;

use crate::test_support::*;

fn perspective(aspect: f32, fov_y: f32) -> Projection {
    let projection = create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = aspect;
        projection.fov_y = fov_y;
    }
    return Projection::Perspective(projection);
}

fn orthographic(half_height: f32, half_width: f32) -> Projection {
    let projection = create_orthographic_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.half_height = half_height;
        projection.half_width = half_width;
    }
    return Projection::Orthographic(projection);
}

fn orthographic_halves(projection: &Projection) -> (f32, f32) {
    return match projection {
        Projection::Orthographic(value) => {
            let borrowed = value.read().unwrap();
            (borrowed.half_height, borrowed.half_width)
        }
        _ => panic!("expected an orthographic projection"),
    };
}

mod frame_orbit_camera_controller_to_sphere {
    use super::*;

    #[test]
    fn targets_the_center_and_changes_only_goal_distance_for_perspective() {
        let options = OrbitCameraControllerOptions {
            azimuth: None,
            distance: Some(10.0),
            max_distance: None,
            max_polar: None,
            min_distance: None,
            min_polar: None,
            polar: None,
            smooth_time: None,
            target: None,
        };
        let mut controller = create_orbit_camera_controller(Some(&options));
        let projection = perspective(1.0, std::f32::consts::FRAC_PI_2);
        let sphere = create_bounding_sphere(1.0, 2.0, 3.0, 2.0);
        assert!(frame_orbit_camera_controller_to_sphere(
            &mut controller,
            &projection,
            &sphere,
            1.0,
            None,
        ));
        let target = controller.target.read().unwrap();
        assert_eq!(target.x, 1.0);
        assert_eq!(target.y, 2.0);
        assert_eq!(target.z, 3.0);
        assert_eq!(controller.distance, 10.0);
        assert_close(
            controller.goal_distance,
            2.0 / (std::f32::consts::FRAC_PI_4).sin(),
        );
    }

    #[test]
    fn targets_the_center_and_changes_only_projection_extent_for_orthographic() {
        let options = OrbitCameraControllerOptions {
            azimuth: None,
            distance: Some(10.0),
            max_distance: None,
            max_polar: None,
            min_distance: None,
            min_polar: None,
            polar: None,
            smooth_time: None,
            target: None,
        };
        let mut controller = create_orbit_camera_controller(Some(&options));
        let projection = orthographic(1.0, 1.0);
        let sphere = create_bounding_sphere(1.0, 2.0, 3.0, 2.0);
        assert!(frame_orbit_camera_controller_to_sphere(
            &mut controller,
            &projection,
            &sphere,
            2.0,
            None,
        ));
        let target = controller.target.read().unwrap();
        assert_eq!(target.x, 1.0);
        assert_eq!(controller.goal_distance, 10.0);
        drop(target);
        assert_eq!(orthographic_halves(&projection), (2.0, 4.0));
    }

    #[test]
    fn does_not_mutate_for_empty_spheres_or_invalid_viewports() {
        let options = OrbitCameraControllerOptions {
            azimuth: None,
            distance: None,
            max_distance: None,
            max_polar: None,
            min_distance: None,
            min_polar: None,
            polar: None,
            smooth_time: None,
            target: Some(flight_geometry::create_vector3(1.0, 2.0, 3.0)),
        };
        let mut controller = create_orbit_camera_controller(Some(&options));
        let projection = perspective(1.0, std::f32::consts::FRAC_PI_2);
        assert!(!frame_orbit_camera_controller_to_sphere(
            &mut controller,
            &projection,
            &create_bounding_sphere(0.0, 0.0, 0.0, -1.0),
            1.0,
            None,
        ));
        assert!(!frame_orbit_camera_controller_to_sphere(
            &mut controller,
            &projection,
            &create_bounding_sphere(0.0, 0.0, 0.0, 2.0),
            0.0,
            None,
        ));
        let target = controller.target.read().unwrap();
        assert_eq!(target.x, 1.0);
        assert_eq!(target.y, 2.0);
        assert_eq!(target.z, 3.0);
    }
}

mod get_perspective_projection_frame_distance_to_sphere {
    use super::*;

    #[test]
    fn uses_the_limiting_vertical_field_for_a_wide_viewport() {
        let projection = perspective(2.0, std::f32::consts::FRAC_PI_2);
        match &projection {
            Projection::Perspective(value) => {
                let borrowed = value.read().unwrap();
                assert_close(
                    get_perspective_projection_frame_distance_to_sphere(&borrowed, 2.0, 2.0, None),
                    2.0 / (std::f32::consts::FRAC_PI_4).sin(),
                );
            }
            _ => panic!("expected a perspective projection"),
        }
    }

    #[test]
    fn uses_the_limiting_horizontal_field_for_a_tall_viewport() {
        let projection = perspective(0.5, std::f32::consts::FRAC_PI_2);
        match &projection {
            Projection::Perspective(value) => {
                let borrowed = value.read().unwrap();
                let horizontal_half_fov = 0.5_f32.atan();
                assert_close(
                    get_perspective_projection_frame_distance_to_sphere(&borrowed, 2.0, 0.5, None),
                    2.0 / horizontal_half_fov.sin(),
                );
            }
            _ => panic!("expected a perspective projection"),
        }
    }
}

mod set_orthographic_projection_frame_to_sphere {
    use super::*;

    #[test]
    fn preserves_wide_and_tall_viewport_aspect_while_containing_the_sphere() {
        let mut wide: OrthographicProjection = flight_entity::allocate_entity();
        set_orthographic_projection_frame_to_sphere(&mut wide, 2.0, 2.0, Some(1.5));
        assert_close(wide.half_height, 3.0);
        assert_close(wide.half_width, 6.0);

        let mut tall: OrthographicProjection = flight_entity::allocate_entity();
        set_orthographic_projection_frame_to_sphere(&mut tall, 2.0, 0.5, Some(1.5));
        assert_close(tall.half_height, 6.0);
        assert_close(tall.half_width, 3.0);
    }
}
