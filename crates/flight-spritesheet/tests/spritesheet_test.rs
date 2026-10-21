use std::sync::Arc;

use flight_entity::{Record, Ref, get_record_keys, get_record_value, set_record_value};
use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

mod clone_spritesheet {
    use super::*;

    #[test]
    fn returns_a_distinct_sheet_with_copies_of_all_frames_sharing_atlas_and_animations() {
        let mut sheet = create_spritesheet(Some(SpritesheetOptions {
            atlas: Some(atlas()),
            ..sheet_options()
        }));
        sheet
            .frames
            .push(create_spritesheet_frame(Some(&SpritesheetFrameOptions {
                id: Some(1),
                offset_x: Some(5.0),
                offset_y: Some(10.0),
                pivot_x: Some(2.0),
                pivot_y: Some(3.0),
                rotated: Some(true),
            })));
        set_record_value(
            &mut sheet.animations,
            "walk".to_string(),
            create_spritesheet_animation(None),
        );
        let clone = clone_spritesheet(&sheet);
        assert!(!Arc::ptr_eq(&clone.frames[0], &sheet.frames[0]));
        assert_eq!(
            *clone.frames[0].read().unwrap(),
            *sheet.frames[0].read().unwrap()
        );
        let walk = |s: &Spritesheet| get_record_value(&s.animations, "walk").unwrap().clone();
        assert!(Arc::ptr_eq(&walk(&clone), &walk(&sheet)));
        assert!(Arc::ptr_eq(
            clone.atlas.as_ref().unwrap(),
            sheet.atlas.as_ref().unwrap()
        ));
    }

    #[test]
    fn copies_the_animation_table_shallowly() {
        let mut sheet = create_spritesheet(None);
        set_record_value(
            &mut sheet.animations,
            "a".to_string(),
            create_spritesheet_animation(None),
        );
        let mut clone = clone_spritesheet(&sheet);
        set_record_value(
            &mut clone.animations,
            "b".to_string(),
            create_spritesheet_animation(None),
        );
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &sheet.animations);
                collected
            },
            vec!["a"]
        );
        assert!(clone_spritesheet(&create_spritesheet(None)).atlas.is_none());
    }
}

mod create_spritesheet {
    use super::*;

    #[test]
    fn initializes_with_null_atlas_and_empty_animations_and_frames() {
        let sheet = create_spritesheet(None);
        assert!(sheet.atlas.is_none());
        assert!(sheet.frames.is_empty());
        assert!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &sheet.animations);
                collected
            }
            .is_empty()
        );
    }

    #[test]
    fn uses_provided_animations_and_frames_directly() {
        let idle = create_spritesheet_animation(None);
        let make: fn() -> Record<Ref<SpritesheetAnimation>> = Record::default;
        let mut animations = make();
        set_record_value(&mut animations, "idle".to_string(), idle.clone());
        let frames = vec![frame(0)];
        let address = frames.as_ptr();
        let sheet = create_spritesheet(Some(SpritesheetOptions {
            animations: Some(animations),
            frames: Some(frames),
            ..sheet_options()
        }));
        assert_eq!(sheet.frames.as_ptr(), address);
        assert!(Arc::ptr_eq(
            get_record_value(&sheet.animations, "idle").unwrap(),
            &idle
        ));
    }
}

mod get_spritesheet_animation {
    use super::*;

    #[test]
    fn returns_null_when_no_animation_matches() {
        let mut sheet = create_spritesheet(None);
        assert!(get_spritesheet_animation(&sheet, "walk").is_none());
        set_record_value(
            &mut sheet.animations,
            "idle".to_string(),
            create_spritesheet_animation(None),
        );
        assert!(get_spritesheet_animation(&sheet, "walk").is_none());
    }

    #[test]
    fn returns_the_matching_animation_by_label() {
        let mut sheet = create_spritesheet(None);
        let walk = create_spritesheet_animation(None);
        set_record_value(
            &mut sheet.animations,
            "idle".to_string(),
            create_spritesheet_animation(None),
        );
        set_record_value(&mut sheet.animations, "walk".to_string(), walk.clone());
        assert!(Arc::ptr_eq(
            &get_spritesheet_animation(&sheet, "walk").unwrap(),
            &walk
        ));
    }
}

mod initialize_spritesheet {
    use super::*;

    #[test]
    fn is_the_construction_initializer_replacing_every_field() {
        let mut sheet = sheet(2);
        initialize_spritesheet(&mut sheet, None);
        assert!(sheet.frames.is_empty() && sheet.atlas.is_none());
    }
}
