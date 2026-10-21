use std::sync::RwLock;

use flight_entity::Ref;
use flight_geometry::create_vector2;
use flight_motionpath::contract::*;
use flight_path::{Path, append_path_line_to, append_path_move_to, create_path};

fn line() -> Ref<Path> {
    let mut path = create_path();
    append_path_move_to(&mut path, 0.0, 0.0);
    append_path_line_to(&mut path, 100.0, 0.0);
    return Ref::new(RwLock::new(path));
}

fn corner() -> Ref<Path> {
    let mut path = create_path();
    append_path_move_to(&mut path, 0.0, 0.0);
    append_path_line_to(&mut path, 100.0, 0.0);
    append_path_line_to(&mut path, 100.0, 100.0);
    return Ref::new(RwLock::new(path));
}

fn empty() -> Ref<Path> {
    return Ref::new(RwLock::new(create_path()));
}

fn configured_motion_path(
    path: &Ref<Path>,
    speed: Option<f64>,
    loop_mode: Option<MotionPathLoopMode>,
    tolerance: Option<f64>,
) -> MotionPath {
    let mut marker = create_motion_path();
    marker.length = flight_path::get_path_length(&path.read().unwrap(), tolerance);
    marker.loop_mode = loop_mode.unwrap_or(MotionPathLoopMode::Clamp);
    marker.path = path.clone();
    marker.speed = speed.unwrap_or(0.0);
    return marker;
}

mod create_motion_path {
    use super::*;

    #[test]
    fn caches_the_path_arc_length_measured_from_the_path() {
        let marker = configured_motion_path(&line(), None, None, None);
        assert!((marker.length - 100.0).abs() < 1e-6);
    }

    #[test]
    fn starts_at_the_path_start_forward_with_clamp_defaults() {
        let marker = create_motion_path();
        assert_eq!(marker.distance, 0.0);
        assert_eq!(marker.direction, MotionPathDirection::Forward);
        assert_eq!(marker.speed, 0.0);
        assert_eq!(marker.loop_mode, MotionPathLoopMode::Clamp);
        assert_eq!(marker.length, 0.0);
        assert!(marker.path.read().unwrap().commands.is_empty());
    }

    #[test]
    fn carries_the_provided_speed_and_loop_mode() {
        let marker = configured_motion_path(
            &line(),
            Some(50.0),
            Some(MotionPathLoopMode::PingPong),
            None,
        );
        assert_eq!(marker.speed, 50.0);
        assert_eq!(marker.loop_mode, MotionPathLoopMode::PingPong);
    }
}

mod get_motion_path_heading {
    use super::*;

    #[test]
    fn reads_zero_radians_along_a_rightward_line() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_distance(&mut marker, 50.0);
        assert!(get_motion_path_heading(&marker).abs() < 1e-6);
    }

    #[test]
    fn differs_before_and_after_a_corner() {
        let mut marker = configured_motion_path(&corner(), None, None, None);
        set_motion_path_distance(&mut marker, 50.0);
        let before = get_motion_path_heading(&marker);
        set_motion_path_distance(&mut marker, 150.0);
        let after = get_motion_path_heading(&marker);
        assert!(before.abs() < 1e-6);
        assert!((after - std::f64::consts::FRAC_PI_2).abs() < 1e-6);
        assert!((after - before).abs() > 1e-3);
    }
}

mod get_motion_path_position {
    use super::*;

    #[test]
    fn samples_the_point_and_tangent_at_the_current_distance() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_distance(&mut marker, 50.0);
        let mut point = create_vector2(0.0, 0.0);
        let mut tangent = create_vector2(0.0, 0.0);
        assert!(get_motion_path_position(&marker, &mut point, &mut tangent));
        assert!((point.x - 50.0).abs() < 1e-4);
        assert!(point.y.abs() < 1e-4);
        assert!((tangent.x - 1.0).abs() < 1e-4);
        assert!(tangent.y.abs() < 1e-4);
    }

    #[test]
    fn returns_false_and_leaves_the_point_unchanged_for_an_empty_path() {
        let marker = configured_motion_path(&empty(), None, None, None);
        let mut point = create_vector2(7.0, 8.0);
        let mut tangent = create_vector2(9.0, 9.0);
        assert!(!get_motion_path_position(&marker, &mut point, &mut tangent));
        assert_eq!(point.x, 7.0);
        assert_eq!(point.y, 8.0);
    }
}

mod get_motion_path_progress {
    use super::*;

    #[test]
    fn reports_distance_over_length() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_distance(&mut marker, 25.0);
        assert!((get_motion_path_progress(&marker) - 0.25).abs() < 1e-6);
    }

    #[test]
    fn reports_zero_for_a_zero_length_path() {
        let marker = configured_motion_path(&empty(), None, None, None);
        assert_eq!(get_motion_path_progress(&marker), 0.0);
    }
}

mod initialize_motion_path {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_motion_path() {
        let mut marker = flight_entity::allocate_entity::<MotionPath>();
        let id = flight_entity::get_entity_id(&marker);
        marker.direction = MotionPathDirection::Backward;
        marker.distance = 4.0;
        marker.length = 100.0;
        marker.loop_mode = MotionPathLoopMode::Loop;
        marker.path = line();
        marker.speed = 5.0;
        initialize_motion_path(&mut marker);
        assert_eq!(marker.direction, MotionPathDirection::Forward);
        assert_eq!(marker.distance, 0.0);
        assert_eq!(marker.length, 0.0);
        assert_eq!(marker.speed, 0.0);
        assert_eq!(marker.loop_mode, MotionPathLoopMode::Clamp);
        assert!(marker.path.read().unwrap().commands.is_empty());
        assert_eq!(flight_entity::get_entity_id(&marker), id);
    }
}

mod is_motion_path_at_end {
    use super::*;

    #[test]
    fn reports_the_terminal_edge_in_the_current_direction() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        assert!(!is_motion_path_at_end(&marker));
        set_motion_path_distance(&mut marker, 100.0);
        assert!(is_motion_path_at_end(&marker));
        set_motion_path_direction(&mut marker, MotionPathDirection::Backward);
        assert!(!is_motion_path_at_end(&marker));
        set_motion_path_distance(&mut marker, 0.0);
        assert!(is_motion_path_at_end(&marker));
    }
}

mod set_motion_path_direction {
    use super::*;

    #[test]
    fn changes_traversal_direction_without_changing_distance() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_distance(&mut marker, 25.0);
        set_motion_path_direction(&mut marker, MotionPathDirection::Backward);
        assert_eq!(marker.direction, MotionPathDirection::Backward);
        assert_eq!(marker.distance, 25.0);
    }
}

mod set_motion_path_distance {
    use super::*;

    #[test]
    fn seeks_to_an_absolute_arc_length_distance() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_distance(&mut marker, 25.0);
        assert_eq!(marker.distance, 25.0);
    }

    #[test]
    fn clamps_distances_above_the_length() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_distance(&mut marker, 150.0);
        assert_eq!(marker.distance, 100.0);
    }

    #[test]
    fn clamps_negative_distances_to_zero() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_distance(&mut marker, -10.0);
        assert_eq!(marker.distance, 0.0);
    }
}

mod set_motion_path_progress {
    use super::*;

    #[test]
    fn seeks_to_a_normalized_progress_along_the_path() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_progress(&mut marker, 0.25);
        assert!((marker.distance - 25.0).abs() < 1e-6);
    }

    #[test]
    fn clamps_progress_above_one_to_the_end() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_progress(&mut marker, 1.5);
        assert!((marker.distance - 100.0).abs() < 1e-6);
    }

    #[test]
    fn clamps_negative_progress_to_the_start() {
        let mut marker = configured_motion_path(&line(), None, None, None);
        set_motion_path_progress(&mut marker, -0.5);
        assert_eq!(marker.distance, 0.0);
    }
}

mod update_motion_path {
    use super::*;

    #[test]
    fn advances_distance_by_speed_times_delta_time() {
        let mut marker = configured_motion_path(&line(), Some(50.0), None, None);
        update_motion_path(&mut marker, 1.0);
        assert!((marker.distance - 50.0).abs() < 1e-6);
        assert!((get_motion_path_progress(&marker) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn clamp_stops_at_the_end_and_stays_there() {
        let mut marker =
            configured_motion_path(&line(), Some(50.0), Some(MotionPathLoopMode::Clamp), None);
        update_motion_path(&mut marker, 10.0);
        assert!((marker.distance - 100.0).abs() < 1e-6);
        assert!((get_motion_path_progress(&marker) - 1.0).abs() < 1e-6);
        update_motion_path(&mut marker, 5.0);
        assert!((marker.distance - 100.0).abs() < 1e-6);
    }

    #[test]
    fn loop_wraps_past_the_end_modulo_length() {
        let mut marker =
            configured_motion_path(&line(), Some(30.0), Some(MotionPathLoopMode::Loop), None);
        update_motion_path(&mut marker, 4.0);
        assert!((marker.distance - 20.0).abs() < 1e-6);
    }

    #[test]
    fn loop_wraps_backward_into_the_valid_range() {
        let mut marker =
            configured_motion_path(&line(), Some(30.0), Some(MotionPathLoopMode::Loop), None);
        set_motion_path_direction(&mut marker, MotionPathDirection::Backward);
        update_motion_path(&mut marker, 4.0);
        assert!((marker.distance - 80.0).abs() < 1e-6);
    }

    #[test]
    fn pingpong_reflects_at_the_end_and_flips_direction_to_backward() {
        let mut marker = configured_motion_path(
            &line(),
            Some(30.0),
            Some(MotionPathLoopMode::PingPong),
            None,
        );
        set_motion_path_distance(&mut marker, 90.0);
        update_motion_path(&mut marker, 1.0);
        assert!((marker.distance - 80.0).abs() < 1e-6);
        assert_eq!(marker.direction, MotionPathDirection::Backward);
    }

    #[test]
    fn pingpong_then_travels_back_toward_the_start() {
        let mut marker = configured_motion_path(
            &line(),
            Some(30.0),
            Some(MotionPathLoopMode::PingPong),
            None,
        );
        set_motion_path_distance(&mut marker, 90.0);
        update_motion_path(&mut marker, 1.0);
        update_motion_path(&mut marker, 1.0);
        assert!((marker.distance - 50.0).abs() < 1e-6);
        assert_eq!(marker.direction, MotionPathDirection::Backward);
    }

    #[test]
    fn loop_wraps_a_single_large_step_across_the_path_multiple_times() {
        let mut marker =
            configured_motion_path(&line(), Some(250.0), Some(MotionPathLoopMode::Loop), None);
        update_motion_path(&mut marker, 1.0);
        assert!((marker.distance - 50.0).abs() < 1e-6);
    }

    #[test]
    fn pingpong_resolves_a_single_large_step_that_crosses_the_path_several_times() {
        let mut marker = configured_motion_path(
            &line(),
            Some(250.0),
            Some(MotionPathLoopMode::PingPong),
            None,
        );
        update_motion_path(&mut marker, 1.0);
        assert!((marker.distance - 50.0).abs() < 1e-6);
        assert_eq!(marker.direction, MotionPathDirection::Forward);
    }

    #[test]
    fn pingpong_reflects_again_at_the_start_and_flips_direction_back() {
        let mut marker = configured_motion_path(
            &line(),
            Some(80.0),
            Some(MotionPathLoopMode::PingPong),
            None,
        );
        set_motion_path_distance(&mut marker, 50.0);
        set_motion_path_direction(&mut marker, MotionPathDirection::Backward);
        update_motion_path(&mut marker, 1.0);
        assert!((marker.distance - 30.0).abs() < 1e-6);
        assert_eq!(marker.direction, MotionPathDirection::Forward);
    }

    #[test]
    fn a_non_positive_delta_time_is_a_no_op() {
        let mut marker = configured_motion_path(&line(), Some(50.0), None, None);
        update_motion_path(&mut marker, 0.0);
        assert_eq!(marker.distance, 0.0);
        update_motion_path(&mut marker, -1.0);
        assert_eq!(marker.distance, 0.0);
    }

    #[test]
    fn a_zero_length_path_is_a_no_op() {
        let mut marker = configured_motion_path(&empty(), Some(50.0), None, None);
        assert_eq!(marker.length, 0.0);
        update_motion_path(&mut marker, 1.0);
        assert_eq!(marker.distance, 0.0);
    }
}
