//! flight-compiler: rust-only — asserts the Rust `Default` bootstrap state of an uninitialized marker (a TS `allocateEntity` has no field values until its initializer runs) and the Rust-only numeric entity id.

use std::sync::{Arc, RwLock};

use flight_motionpath::contract::*;
use flight_path::{PathWinding, create_path};

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

mod initialize_motion_path {
    use super::*;

    #[test]
    fn keeps_the_entity_identity_of_the_marker_it_initializes() {
        let path = Arc::new(RwLock::new(create_path(Some(PathWinding::NonZero))));
        let mut marker = create_motion_path(path.clone(), None, None, None);
        let id = flight_entity::get_entity_id(&marker);
        initialize_motion_path(&mut marker, path, Some(5.0), None, None);
        assert_eq!(flight_entity::get_entity_id(&marker), id);
    }
}
