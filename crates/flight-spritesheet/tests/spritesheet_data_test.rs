use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

mod create_spritesheet_animation_data {
    use super::*;

    #[test]
    fn creates_with_all_defaults_when_no_argument_is_passed() {
        let animation = create_spritesheet_animation_data(None);
        assert_eq!(animation.direction, SpritesheetAnimationDirection::Forward);
        assert_eq!(animation.frame_duration, 100.0);
        assert!(animation.frame_durations.is_none() && animation.frame_names.is_empty());
        assert_eq!(
            (
                animation.name.as_str(),
                animation.origin_x,
                animation.origin_y,
                animation.repeat_count
            ),
            ("", 0.0, 0.0, -1)
        );
    }

    #[test]
    fn applies_provided_partial_fields_and_per_frame_durations() {
        let animation = create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
            direction: Some(SpritesheetAnimationDirection::Pingpong),
            frame_duration: Some(80.0),
            frame_durations: Some(vec![100.0, 200.0, 150.0]),
            frame_names: Some(vec!["a".into(), "b".into(), "c".into()]),
            name: Some("walk".into()),
            origin_x: Some(0.5),
            origin_y: Some(1.0),
            repeat_count: Some(3),
        }));
        assert_eq!(animation.direction, SpritesheetAnimationDirection::Pingpong);
        assert_eq!(
            (animation.frame_duration, animation.repeat_count),
            (80.0, 3)
        );
        assert_eq!(animation.frame_durations, Some(vec![100.0, 200.0, 150.0]));
        assert_eq!(animation.frame_names, vec!["a", "b", "c"]);
        assert_eq!(
            (
                animation.name.as_str(),
                animation.origin_x,
                animation.origin_y
            ),
            ("walk", 0.5, 1.0)
        );
    }

    #[test]
    fn accepts_all_direction_values() {
        for direction in [
            SpritesheetAnimationDirection::Forward,
            SpritesheetAnimationDirection::Reverse,
            SpritesheetAnimationDirection::Pingpong,
            SpritesheetAnimationDirection::PingpongReverse,
        ] {
            let data = create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
                direction: Some(direction),
                ..animation_data_options()
            }));
            assert_eq!(data.direction, direction);
        }
    }

    #[test]
    fn does_not_share_the_frame_names_between_instances() {
        let mut a = create_spritesheet_animation_data(None);
        let b = create_spritesheet_animation_data(None);
        a.frame_names.push("x".into());
        assert!(b.frame_names.is_empty());
    }
}

mod create_spritesheet_data {
    use super::*;

    #[test]
    fn creates_with_all_defaults_when_no_argument_is_passed() {
        let data = create_spritesheet_data(None);
        assert!(data.animations.is_empty() && data.frames.is_empty());
        assert_eq!(
            (
                data.image_file.as_str(),
                data.image_height,
                data.image_width,
                data.scale
            ),
            ("", 0.0, 0.0, 1.0)
        );
    }

    #[test]
    fn applies_provided_partial_fields_and_stores_frames_and_animations() {
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            image_file: Some("atlas.png".into()),
            image_height: Some(512.0),
            image_width: Some(256.0),
            scale: Some(2.0),
            animations: Some(vec![named_animation_data("run", &[])]),
            frames: Some(vec![named_frame_data("hero")]),
        }));
        assert_eq!(
            (
                data.image_file.as_str(),
                data.image_height,
                data.image_width,
                data.scale
            ),
            ("atlas.png", 512.0, 256.0, 2.0)
        );
        assert_eq!((data.frames.len(), data.animations.len()), (1, 1));
    }

    #[test]
    fn does_not_share_vectors_between_instances() {
        let mut a = create_spritesheet_data(None);
        let b = create_spritesheet_data(None);
        a.frames.push(create_spritesheet_frame_data(None));
        assert!(b.frames.is_empty());
    }
}

mod create_spritesheet_frame_data {
    use super::*;

    #[test]
    fn creates_with_all_defaults_when_no_argument_is_passed() {
        let frame = create_spritesheet_frame_data(None);
        assert_eq!(
            (
                frame.height,
                frame.name.as_str(),
                frame.offset_x,
                frame.offset_y
            ),
            (0.0, "", 0.0, 0.0)
        );
        assert!(frame.pivot_x.is_none() && frame.pivot_y.is_none() && !frame.rotated);
        assert_eq!(
            (
                frame.source_height,
                frame.source_width,
                frame.width,
                frame.x,
                frame.y
            ),
            (0.0, 0.0, 0.0, 0.0, 0.0)
        );
    }

    #[test]
    fn applies_all_provided_fields() {
        let frame = create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
            height: Some(64.0),
            name: Some("hero_idle".into()),
            offset_x: Some(2.0),
            offset_y: Some(4.0),
            pivot_x: Some(0.5),
            pivot_y: Some(1.0),
            rotated: Some(true),
            source_height: Some(72.0),
            source_width: Some(68.0),
            width: Some(60.0),
            x: Some(128.0),
            y: Some(64.0),
        }));
        assert_eq!(
            (
                frame.height,
                frame.name.as_str(),
                frame.offset_x,
                frame.offset_y
            ),
            (64.0, "hero_idle", 2.0, 4.0)
        );
        assert_eq!(
            (frame.pivot_x, frame.pivot_y, frame.rotated),
            (Some(0.5), Some(1.0), true)
        );
        assert_eq!(
            (
                frame.source_height,
                frame.source_width,
                frame.width,
                frame.x,
                frame.y
            ),
            (72.0, 68.0, 60.0, 128.0, 64.0)
        );
    }

    #[test]
    fn accepts_null_pivots_explicitly() {
        let frame = create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
            pivot_x: None,
            pivot_y: None,
            ..frame_data_options()
        }));
        assert!(frame.pivot_x.is_none() && frame.pivot_y.is_none());
    }
}

mod initialize_spritesheet_animation_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_restoring_defaults() {
        let mut data = named_animation_data("walk", &["a"]);
        initialize_spritesheet_animation_data(&mut data, None);
        assert_eq!(
            (
                data.name.as_str(),
                data.frame_names.len(),
                data.repeat_count,
                data.frame_duration
            ),
            ("", 0, -1, 100.0)
        );
    }
}

mod initialize_spritesheet_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_restoring_defaults() {
        let mut data = create_spritesheet_data(Some(SpritesheetDataOptions {
            scale: Some(3.0),
            ..data_options()
        }));
        initialize_spritesheet_data(&mut data, None);
        assert_eq!(data.scale, 1.0);
    }
}

mod initialize_spritesheet_frame_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_restoring_defaults() {
        let mut data = named_frame_data("hero");
        initialize_spritesheet_frame_data(&mut data, None);
        assert_eq!(data.name, "");
    }
}
