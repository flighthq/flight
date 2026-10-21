use std::sync::Arc;

use flight_camera::contract::set_camera_3d_view_matrix4_from_look_at;
use flight_camera_controls::contract::*;
use flight_geometry::create_vector3;

use crate::test_support::*;

fn options(
    azimuth: Option<f32>,
    distance: Option<f32>,
    max_distance: Option<f32>,
    max_polar: Option<f32>,
    min_distance: Option<f32>,
    min_polar: Option<f32>,
    polar: Option<f32>,
    smooth_time: Option<f32>,
    target: Option<(f32, f32, f32)>,
) -> OrbitCameraControllerOptions {
    return OrbitCameraControllerOptions {
        azimuth,
        distance,
        max_distance,
        max_polar,
        min_distance,
        min_polar,
        polar,
        smooth_time,
        target: target.map(|value| create_vector3(value.0, value.1, value.2)),
    };
}

mod clone_orbit_camera_controller {
    use super::*;

    #[test]
    fn creates_an_independent_controller_with_the_same_value_state() {
        let source = create_orbit_camera_controller(Some(&options(
            Some(0.2),
            Some(4.0),
            None,
            None,
            None,
            None,
            None,
            None,
            Some((1.0, 2.0, 3.0)),
        )));
        let clone = clone_orbit_camera_controller(&source);
        assert_eq!(clone.azimuth, 0.2);
        assert_eq!(clone.distance, 4.0);
        assert!(!Arc::ptr_eq(&clone.target, &source.target));
        clone.target.write().unwrap().x = 10.0;
        assert_eq!(source.target.read().unwrap().x, 1.0);
    }
}

mod copy_orbit_camera_controller {
    use super::*;

    #[test]
    fn copies_value_state_without_sharing_target() {
        let source = create_orbit_camera_controller(Some(&options(
            Some(0.2),
            Some(4.0),
            None,
            None,
            None,
            None,
            None,
            None,
            Some((1.0, 2.0, 3.0)),
        )));
        let mut out = create_orbit_camera_controller(None);
        let retained = out.target.clone();
        copy_orbit_camera_controller(&mut out, &source);
        assert_eq!(out.azimuth, 0.2);
        assert_eq!(out.distance, 4.0);
        assert!(Arc::ptr_eq(&out.target, &retained));
        assert!(!Arc::ptr_eq(&out.target, &source.target));
    }
}

mod create_orbit_camera_controller {
    use super::*;

    #[test]
    fn applies_documented_defaults_with_current_equal_to_goal() {
        let controller = create_orbit_camera_controller(None);
        assert_eq!(controller.distance, 10.0);
        assert_eq!(controller.azimuth, 0.0);
        assert_eq!(controller.goal_distance, controller.distance);
        assert_eq!(controller.goal_azimuth, controller.azimuth);
        assert!(controller.max_polar < std::f32::consts::FRAC_PI_2);
        assert!(controller.min_polar > -std::f32::consts::FRAC_PI_2);
    }

    #[test]
    fn seeds_from_options() {
        let controller = create_orbit_camera_controller(Some(&options(
            Some(1.0),
            Some(4.0),
            None,
            None,
            None,
            None,
            Some(0.5),
            None,
            Some((1.0, 2.0, 3.0)),
        )));
        assert_eq!(controller.distance, 4.0);
        assert_eq!(controller.polar, 0.5);
        let target = controller.target.read().unwrap();
        assert_eq!(target.x, 1.0);
        assert_eq!(target.z, 3.0);
    }
}

mod dolly_orbit_camera_controller {
    use super::*;

    #[test]
    fn moves_the_goal_distance_clamped_to_the_range() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            None,
            Some(5.0),
            Some(8.0),
            None,
            Some(2.0),
            None,
            None,
            None,
            None,
        )));
        dolly_orbit_camera_controller(&mut controller, 2.0);
        assert_eq!(controller.goal_distance, 7.0);
        dolly_orbit_camera_controller(&mut controller, 100.0);
        assert_eq!(controller.goal_distance, 8.0);
        dolly_orbit_camera_controller(&mut controller, -100.0);
        assert_eq!(controller.goal_distance, 2.0);
    }
}

mod initialize_orbit_camera_controller {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_orbit_camera_controller() {
        let mut controller = flight_entity::allocate_entity::<OrbitCameraController>();
        initialize_orbit_camera_controller(&mut controller, None);
        assert_eq!(controller.distance, 10.0);
    }
}

mod pan_orbit_camera_controller {
    use super::*;

    #[test]
    fn slides_the_target_along_right_and_world_up() {
        let mut controller = create_orbit_camera_controller(None);
        pan_orbit_camera_controller(&mut controller, 3.0, 2.0);
        let target = controller.target.read().unwrap();
        assert_close(target.x, 3.0);
        assert_close(target.y, 2.0);
        assert_close(target.z, 0.0);
    }
}

mod pan_orbit_camera_controller_in_view_plane {
    use super::*;

    #[test]
    fn follows_screen_up_at_nonzero_polar() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            None,
            None,
            None,
            None,
            None,
            None,
            Some(std::f32::consts::FRAC_PI_4),
            None,
            None,
        )));
        pan_orbit_camera_controller_in_view_plane(&mut controller, 0.0, 2.0);
        let target = controller.target.read().unwrap();
        assert_close(target.x, 0.0);
        assert_close(target.y, std::f32::consts::SQRT_2);
        assert_close(target.z, -std::f32::consts::SQRT_2);
    }
}

mod reset_orbit_camera_controller {
    use super::*;

    #[test]
    fn resets_all_coupled_state_from_a_seed() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some((1.0, 2.0, 3.0)),
        )));
        reset_orbit_camera_controller(
            &mut controller,
            Some(&options(
                Some(1.0),
                Some(4.0),
                Some(6.0),
                Some(0.5),
                None,
                None,
                Some(0.25),
                None,
                Some((4.0, 5.0, 6.0)),
            )),
        );
        assert_eq!(controller.azimuth, 1.0);
        assert_eq!(controller.goal_azimuth, 1.0);
        assert_eq!(controller.distance, 4.0);
        assert_eq!(controller.goal_distance, 4.0);
        assert_eq!(controller.polar, 0.25);
        let target = controller.target.read().unwrap();
        assert_eq!(target.x, 4.0);
        assert_eq!(target.y, 5.0);
        assert_eq!(target.z, 6.0);
    }
}

mod rotate_orbit_camera_controller {
    use super::*;

    #[test]
    fn adds_to_the_goal_angles_and_clamps_polar() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            None,
            None,
            None,
            Some(1.0),
            None,
            Some(-1.0),
            None,
            None,
            None,
        )));
        rotate_orbit_camera_controller(&mut controller, 0.5, 2.0);
        assert_eq!(controller.goal_azimuth, 0.5);
        assert_eq!(controller.goal_polar, 1.0);
    }
}

mod snap_orbit_camera_controller {
    use super::*;

    #[test]
    fn snaps_current_values_to_clamped_goals() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            None,
            None,
            Some(6.0),
            Some(0.5),
            None,
            None,
            None,
            None,
            None,
        )));
        controller.goal_distance = 20.0;
        controller.goal_polar = 2.0;
        snap_orbit_camera_controller(&mut controller);
        assert_eq!(controller.distance, 6.0);
        assert_eq!(controller.polar, 0.5);
    }
}

mod update_orbit_camera_controller {
    use super::*;

    #[test]
    fn snaps_to_the_goal_when_smooth_time_is_zero_and_writes_the_look_at_view() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            None,
            Some(10.0),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )));
        let mut camera = test_camera();
        update_orbit_camera_controller(&mut controller, &mut camera, 0.016);
        assert_eq!(controller.azimuth, controller.goal_azimuth);
        let mut expected = test_camera();
        let eye = create_vector3(0.0, 0.0, 10.0);
        let target = create_vector3(0.0, 0.0, 0.0);
        let up = create_vector3(0.0, 1.0, 0.0);
        set_camera_3d_view_matrix4_from_look_at(&mut expected, &eye, &target, &up);
        assert_mat4_close(&camera.view.read().unwrap(), &expected.view.read().unwrap());
    }

    #[test]
    fn eases_toward_the_goal_when_smooth_time_is_positive() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(0.5),
            None,
        )));
        rotate_orbit_camera_controller(&mut controller, 1.0, 0.0);
        let mut camera = test_camera();
        update_orbit_camera_controller(&mut controller, &mut camera, 0.016);
        assert!(controller.azimuth > 0.0);
        assert!(controller.azimuth < 1.0);
    }

    #[test]
    fn takes_the_shortest_arc_across_the_wrapped_azimuth_seam() {
        let mut controller = create_orbit_camera_controller(Some(&options(
            Some(std::f32::consts::PI - 0.05),
            None,
            None,
            None,
            None,
            None,
            None,
            Some(0.5),
            None,
        )));
        controller.goal_azimuth = -std::f32::consts::PI + 0.05;
        let mut camera = test_camera();
        update_orbit_camera_controller(&mut controller, &mut camera, 0.016);
        assert!(controller.azimuth > std::f32::consts::PI - 0.05);
        assert!(controller.azimuth < std::f32::consts::PI + 0.05);
    }
}
