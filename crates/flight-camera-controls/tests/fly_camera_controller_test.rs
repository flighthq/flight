use std::sync::Arc;

use flight_camera::contract::set_camera_3d_view_matrix4_from_look_at;
use flight_camera_controls::contract::*;
use flight_entity::{
    allocate_entity, get_entity_id, get_entity_runtime, get_entity_uid, set_entity_uid,
};
use flight_geometry::create_vector3;

use crate::test_support::*;

fn options(
    max_pitch: Option<f32>,
    min_pitch: Option<f32>,
    pitch: Option<f32>,
    position: Option<(f32, f32, f32)>,
    smooth_time: Option<f32>,
    yaw: Option<f32>,
) -> FlyCameraControllerOptions {
    return FlyCameraControllerOptions {
        max_pitch,
        min_pitch,
        pitch,
        position: position.map(|value| create_vector3(value.0, value.1, value.2)),
        smooth_time,
        yaw,
    };
}

mod clone_fly_camera_controller {
    use super::*;

    #[test]
    fn creates_an_independent_controller_with_the_same_value_state() {
        let source = create_fly_camera_controller(Some(&options(
            None,
            None,
            Some(0.2),
            Some((1.0, 2.0, 3.0)),
            None,
            Some(0.4),
        )));
        let clone = clone_fly_camera_controller(&source);
        assert_eq!(clone.pitch, 0.2);
        assert_eq!(clone.yaw, 0.4);
        assert!(!Arc::ptr_eq(&clone.position, &source.position));
        clone.position.write().unwrap().x = 10.0;
        assert_eq!(source.position.read().unwrap().x, 1.0);
    }
}

mod copy_fly_camera_controller {
    use super::*;

    #[test]
    fn copies_value_state_without_sharing_position() {
        let source = create_fly_camera_controller(Some(&options(
            None,
            None,
            Some(0.2),
            Some((1.0, 2.0, 3.0)),
            None,
            Some(0.4),
        )));
        let mut out = create_fly_camera_controller(None);
        let retained = out.position.clone();
        set_entity_uid(&mut out, "copy-destination".to_string());
        let runtime = get_entity_runtime(&out).unwrap() as *const _;
        copy_fly_camera_controller(&mut out, &source);
        assert_eq!(get_entity_uid(&mut out), "copy-destination");
        assert_eq!(get_entity_runtime(&out).unwrap() as *const _, runtime);
        assert_eq!(out.pitch, 0.2);
        assert_eq!(out.yaw, 0.4);
        assert!(Arc::ptr_eq(&out.position, &retained));
        assert!(!Arc::ptr_eq(&out.position, &source.position));
    }
}

mod create_fly_camera_controller {
    use super::*;

    #[test]
    fn applies_documented_defaults_with_current_equal_to_goal() {
        let controller = create_fly_camera_controller(None);
        assert_eq!(controller.yaw, 0.0);
        assert_eq!(controller.pitch, 0.0);
        assert_eq!(controller.goal_yaw, controller.yaw);
        assert!(controller.max_pitch < std::f32::consts::FRAC_PI_2);
        assert!(controller.min_pitch > -std::f32::consts::FRAC_PI_2);
    }

    #[test]
    fn seeds_from_options() {
        let controller = create_fly_camera_controller(Some(&options(
            None,
            None,
            Some(0.25),
            Some((1.0, 2.0, 3.0)),
            None,
            Some(0.5),
        )));
        assert_eq!(controller.yaw, 0.5);
        assert_eq!(controller.position.read().unwrap().z, 3.0);
    }
}

mod initialize_fly_camera_controller {
    use super::*;

    #[test]
    fn derives_coupled_state_without_replacing_preallocated_entities_or_runtimes() {
        let mut seed = options(
            Some(1.2),
            Some(-1.1),
            Some(0.25),
            Some((4.0, 5.0, 6.0)),
            Some(0.4),
            Some(-0.5),
        );
        let mut controller: FlyCameraController = allocate_entity();
        let id = get_entity_id(&controller);
        set_entity_uid(&mut controller, "controller-under-construction".to_string());
        let runtime = get_entity_runtime(&controller).unwrap() as *const _;
        let retained = controller.position.clone();
        let vector_id = get_entity_id(&*retained.read().unwrap());
        set_entity_uid(&mut *retained.write().unwrap(), "owned-vector".to_string());
        let vector_runtime = get_entity_runtime(&*retained.read().unwrap()).unwrap() as *const _;
        initialize_fly_camera_controller(&mut controller, Some(&seed));
        assert_eq!(controller.pitch, 0.25);
        assert_eq!(controller.goal_pitch, controller.pitch);
        assert_eq!(controller.yaw, -0.5);
        assert_eq!(controller.goal_yaw, controller.yaw);
        assert_eq!(controller.max_pitch, 1.2);
        assert_eq!(controller.min_pitch, -1.1);
        assert_eq!(controller.smooth_time, 0.4);
        assert!(Arc::ptr_eq(&controller.position, &retained));
        assert_eq!(get_entity_id(&controller), id);
        assert_eq!(
            get_entity_uid(&mut controller),
            "controller-under-construction"
        );
        assert_eq!(
            get_entity_runtime(&controller).unwrap() as *const _,
            runtime
        );
        {
            let mut vector = controller.position.write().unwrap();
            assert_eq!(get_entity_id(&*vector), vector_id);
            assert_eq!(get_entity_uid(&mut *vector), "owned-vector");
            assert_eq!(
                get_entity_runtime(&*vector).unwrap() as *const _,
                vector_runtime
            );
            assert_eq!((vector.x, vector.y, vector.z), (4.0, 5.0, 6.0));
            assert_ne!(
                get_entity_id(&*vector),
                get_entity_id(seed.position.as_ref().unwrap())
            );
        }
        let second = create_fly_camera_controller(Some(&seed));
        assert!(!Arc::ptr_eq(&controller.position, &second.position));
        seed.position.as_mut().unwrap().x = 99.0;
        assert_eq!(controller.position.read().unwrap().x, 4.0);
        assert_eq!(second.position.read().unwrap().x, 4.0);
    }

    #[test]
    fn is_the_construction_initializer_of_create_fly_camera_controller() {
        let mut controller = flight_entity::allocate_entity::<FlyCameraController>();
        initialize_fly_camera_controller(&mut controller, None);
        assert_eq!(controller.goal_pitch, 0.0);
        assert_eq!(controller.pitch, 0.0);
    }
}

mod look_fly_camera_controller {
    use super::*;

    #[test]
    fn adds_to_the_goal_angles_and_clamps_pitch() {
        let mut controller = create_fly_camera_controller(Some(&options(
            Some(1.0),
            Some(-1.0),
            None,
            None,
            None,
            None,
        )));
        look_fly_camera_controller(&mut controller, 0.5, 2.0);
        assert_eq!(controller.goal_yaw, 0.5);
        assert_eq!(controller.goal_pitch, 1.0);
    }
}

mod move_fly_camera_controller {
    use super::*;

    #[test]
    fn translates_along_the_horizontal_heading_at_yaw_zero() {
        let mut controller = create_fly_camera_controller(None);
        move_fly_camera_controller(&mut controller, 2.0, 3.0, 1.0);
        let position = controller.position.read().unwrap();
        assert_close(position.x, 3.0);
        assert_close(position.y, 1.0);
        assert_close(position.z, -2.0);
    }
}

mod reset_fly_camera_controller {
    use super::*;

    #[test]
    fn resets_all_coupled_state_from_a_seed() {
        let mut controller = create_fly_camera_controller(Some(&options(
            None,
            None,
            None,
            Some((1.0, 2.0, 3.0)),
            None,
            Some(1.0),
        )));
        reset_fly_camera_controller(
            &mut controller,
            Some(&options(
                Some(0.5),
                None,
                Some(0.25),
                Some((4.0, 5.0, 6.0)),
                None,
                Some(-1.0),
            )),
        );
        assert_eq!(controller.goal_pitch, 0.25);
        assert_eq!(controller.goal_yaw, -1.0);
        assert_eq!(controller.pitch, 0.25);
        assert_eq!(controller.yaw, -1.0);
        let position = controller.position.read().unwrap();
        assert_eq!(position.x, 4.0);
        assert_eq!(position.y, 5.0);
        assert_eq!(position.z, 6.0);
    }
}

mod snap_fly_camera_controller {
    use super::*;

    #[test]
    fn snaps_current_angles_to_clamped_goals() {
        let mut controller =
            create_fly_camera_controller(Some(&options(Some(0.5), None, None, None, None, None)));
        controller.goal_pitch = 2.0;
        controller.goal_yaw = 3.0;
        snap_fly_camera_controller(&mut controller);
        assert_eq!(controller.pitch, 0.5);
        assert_eq!(controller.yaw, 3.0);
    }
}

mod update_fly_camera_controller {
    use super::*;

    #[test]
    fn snaps_to_the_goal_when_smooth_time_is_zero_and_writes_the_look_at_view() {
        let mut controller = create_fly_camera_controller(Some(&options(
            None,
            None,
            None,
            Some((0.0, 0.0, 5.0)),
            None,
            None,
        )));
        let mut camera = test_camera();
        update_fly_camera_controller(&mut controller, &mut camera, 0.016);
        assert_eq!(controller.yaw, controller.goal_yaw);
        let mut expected = test_camera();
        let eye = create_vector3(0.0, 0.0, 5.0);
        let target = create_vector3(0.0, 0.0, 4.0);
        let up = create_vector3(0.0, 1.0, 0.0);
        set_camera_3d_view_matrix4_from_look_at(&mut expected, &eye, &target, &up);
        assert_mat4_close(&camera.view.read().unwrap(), &expected.view.read().unwrap());
    }

    #[test]
    fn eases_toward_the_goal_when_smooth_time_is_positive() {
        let mut controller =
            create_fly_camera_controller(Some(&options(None, None, None, None, Some(0.5), None)));
        look_fly_camera_controller(&mut controller, 1.0, 0.0);
        let mut camera = test_camera();
        update_fly_camera_controller(&mut controller, &mut camera, 0.016);
        assert!(controller.yaw > 0.0);
        assert!(controller.yaw < 1.0);
    }

    #[test]
    fn takes_the_shortest_arc_across_the_wrapped_yaw_seam() {
        let mut controller = create_fly_camera_controller(Some(&options(
            None,
            None,
            None,
            None,
            Some(0.5),
            Some(std::f32::consts::PI - 0.05),
        )));
        controller.goal_yaw = -std::f32::consts::PI + 0.05;
        let mut camera = test_camera();
        update_fly_camera_controller(&mut controller, &mut camera, 0.016);
        assert!(controller.yaw > std::f32::consts::PI - 0.05);
        assert!(controller.yaw < std::f32::consts::PI + 0.05);
    }
}
