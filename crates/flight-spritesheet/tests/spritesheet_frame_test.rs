use std::sync::Arc;

use flight_entity::get_entity_id;
use flight_spritesheet::contract::*;

mod create_spritesheet_frame {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let frame = create_spritesheet_frame();
        let frame = frame.read().unwrap();
        assert_eq!((frame.id, frame.offset_x, frame.offset_y), (0, 0.0, 0.0));
        assert!(frame.pivot_x.is_none() && frame.pivot_y.is_none());
        assert!(!frame.rotated);
    }

    #[test]
    fn accepts_authored_fields_after_canonical_construction() {
        let frame = create_spritesheet_frame();
        {
            let mut frame = frame.write().unwrap();
            frame.id = 5;
            frame.offset_x = 10.0;
            frame.offset_y = 20.0;
        }
        let frame = frame.read().unwrap();
        assert_eq!((frame.id, frame.offset_x, frame.offset_y), (5, 10.0, 20.0));
        drop(frame);
        let only_id = create_spritesheet_frame();
        only_id.write().unwrap().id = 3;
        assert_eq!(
            (only_id.read().unwrap().id, only_id.read().unwrap().offset_x),
            (3, 0.0)
        );
    }

    #[test]
    fn stores_pivot_and_rotated_values() {
        let frame = create_spritesheet_frame();
        {
            let mut frame = frame.write().unwrap();
            frame.id = 2;
            frame.pivot_x = Some(8.0);
            frame.pivot_y = Some(16.0);
            frame.rotated = true;
        }
        let frame = frame.read().unwrap();
        assert_eq!(
            (frame.pivot_x, frame.pivot_y, frame.rotated),
            (Some(8.0), Some(16.0), true)
        );
    }

    #[test]
    fn returns_a_new_frame_for_each_call() {
        assert!(!Arc::ptr_eq(
            &create_spritesheet_frame(),
            &create_spritesheet_frame()
        ));
    }
}

mod initialize_spritesheet_frame {
    use super::*;

    #[test]
    fn is_the_construction_initializer_resetting_unset_fields() {
        let shared = create_spritesheet_frame();
        {
            let mut frame = shared.write().unwrap();
            frame.id = 9;
            frame.rotated = true;
            frame.pivot_x = Some(1.0);
            frame.offset_x = 4.0;
        }
        let entity_id = get_entity_id(&*shared.read().unwrap());
        initialize_spritesheet_frame(&mut shared.write().unwrap());
        let frame = shared.read().unwrap();
        assert_eq!(get_entity_id(&*frame), entity_id);
        assert_eq!(
            (frame.id, frame.offset_x, frame.rotated, frame.pivot_x),
            (0, 0.0, false, None)
        );
    }
}
