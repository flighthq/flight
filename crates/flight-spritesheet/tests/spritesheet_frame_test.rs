use std::sync::Arc;

use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

mod create_spritesheet_frame {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let frame = create_spritesheet_frame(None);
        let frame = frame.read().unwrap();
        assert_eq!((frame.id, frame.offset_x, frame.offset_y), (0, 0.0, 0.0));
        assert!(frame.pivot_x.is_none() && frame.pivot_y.is_none());
        assert!(!frame.rotated);
    }

    #[test]
    fn applies_partial_overrides() {
        let frame = create_spritesheet_frame(Some(&SpritesheetFrameOptions {
            id: Some(5),
            offset_x: Some(10.0),
            offset_y: Some(20.0),
            ..frame_options()
        }));
        let frame = frame.read().unwrap();
        assert_eq!((frame.id, frame.offset_x, frame.offset_y), (5, 10.0, 20.0));
        let only_id = create_spritesheet_frame(Some(&SpritesheetFrameOptions {
            id: Some(3),
            ..frame_options()
        }));
        assert_eq!(
            (only_id.read().unwrap().id, only_id.read().unwrap().offset_x),
            (3, 0.0)
        );
    }

    #[test]
    fn stores_pivot_and_rotated_values() {
        let frame = create_spritesheet_frame(Some(&SpritesheetFrameOptions {
            id: Some(2),
            pivot_x: Some(8.0),
            pivot_y: Some(16.0),
            rotated: Some(true),
            ..frame_options()
        }));
        let frame = frame.read().unwrap();
        assert_eq!(
            (frame.pivot_x, frame.pivot_y, frame.rotated),
            (Some(8.0), Some(16.0), true)
        );
    }

    #[test]
    fn returns_a_new_frame_for_each_call() {
        assert!(!Arc::ptr_eq(
            &create_spritesheet_frame(None),
            &create_spritesheet_frame(None)
        ));
    }
}

mod initialize_spritesheet_frame {
    use super::*;

    #[test]
    fn is_the_construction_initializer_resetting_unset_fields() {
        let shared = create_spritesheet_frame(Some(&SpritesheetFrameOptions {
            id: Some(9),
            rotated: Some(true),
            pivot_x: Some(1.0),
            ..frame_options()
        }));
        initialize_spritesheet_frame(
            &mut shared.write().unwrap(),
            Some(&SpritesheetFrameOptions {
                offset_x: Some(4.0),
                ..frame_options()
            }),
        );
        let frame = shared.read().unwrap();
        assert_eq!(
            (frame.id, frame.offset_x, frame.rotated, frame.pivot_x),
            (0, 4.0, false, None)
        );
    }
}
