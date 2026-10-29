//! flight-compiler: string-union PathWinding

use std::sync::{Arc, RwLock};

use flight_motionpath::contract::*;
use flight_path::{PathWinding, append_path_line_to, append_path_move_to, create_path};

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
            get_motion_path_loop_mode_string(MotionPathLoopMode::Pingpong),
            "pingpong"
        );
    }
}

mod parse_motion_path_loop_mode {
    use super::*;

    #[test]
    fn round_trips_every_mode() {
        let modes: [MotionPathLoopMode; 3] = [
            MotionPathLoopMode::Clamp,
            MotionPathLoopMode::Loop,
            MotionPathLoopMode::Pingpong,
        ];
        for mode in modes {
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
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let handle = Arc::new(RwLock::new(path));
        let marker = create_motion_path(handle.clone(), Some(0.0), None, None);
        assert!(Arc::ptr_eq(&marker.path, &handle));
    }
}
