use std::sync::RwLock;

use flight_entity::Ref;
use flight_motionpath::contract::*;
use flight_path::{append_path_line_to, append_path_move_to, create_path};

mod direction_values {
    use super::*;

    #[test]
    fn exposes_the_closed_forward_and_backward_representation() {
        assert_eq!(MotionPathDirection::Forward, MotionPathDirection::Forward);
        assert_eq!(MotionPathDirection::Backward, MotionPathDirection::Backward);
    }

    #[test]
    fn carries_the_source_numeric_values() {
        assert_eq!(MotionPathDirection::Forward as i8, 1);
        assert_eq!(MotionPathDirection::Backward as i8, -1);
    }

    #[test]
    fn is_copyable_and_comparable() {
        let direction = MotionPathDirection::Backward;
        assert_eq!(direction, MotionPathDirection::Backward);
        assert_ne!(direction, MotionPathDirection::Forward);
    }
}

mod entity_defaults {
    use super::*;

    #[test]
    fn a_fresh_marker_has_neutral_bootstrap_state_and_retains_a_path_handle() {
        let marker = flight_entity::allocate_entity::<MotionPath>();
        assert_eq!(marker.distance, 0.0);
        assert_eq!(marker.length, 0.0);
        assert_eq!(marker.speed, 0.0);
        assert_eq!(marker.direction, MotionPathDirection::Forward);
        assert_eq!(marker.loop_mode, MotionPathLoopMode::Clamp);
        assert!(marker.path.read().unwrap().commands.is_empty());
    }
}

mod get_motion_path_loop_mode_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_motion_path_loop_mode_string(MotionPathLoopMode::Clamp),
            "clamp"
        );
        assert_eq!(
            get_motion_path_loop_mode_string(MotionPathLoopMode::Loop),
            "loop"
        );
        assert_eq!(
            get_motion_path_loop_mode_string(MotionPathLoopMode::PingPong),
            "pingpong"
        );
    }
}

mod parse_motion_path_loop_mode {
    use super::*;

    #[test]
    fn round_trips_every_mode() {
        for mode in [
            MotionPathLoopMode::Clamp,
            MotionPathLoopMode::Loop,
            MotionPathLoopMode::PingPong,
        ] {
            assert_eq!(
                parse_motion_path_loop_mode(get_motion_path_loop_mode_string(mode)),
                Some(mode)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_motion_path_loop_mode("bounce"), None);
    }
}

mod path_identity {
    use super::*;

    #[test]
    fn retains_the_source_path_object_reference() {
        let mut path = create_path(flight_path::PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let handle = Ref::new(RwLock::new(path));
        let marker = create_motion_path(handle.clone(), 0.0, MotionPathLoopMode::Clamp, None);
        assert!(std::sync::Arc::ptr_eq(&marker.path, &handle));
    }
}
