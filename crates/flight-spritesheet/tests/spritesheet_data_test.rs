use flight_entity::get_entity_id;
use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

mod create_spritesheet_animation_data {
    use super::*;

    #[test]
    fn creates_with_all_defaults_when_no_argument_is_passed() {
        let animation = create_spritesheet_animation_data();
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
    fn accepts_authored_fields_after_canonical_construction() {
        let mut animation = create_spritesheet_animation_data();
        animation.direction = SpritesheetAnimationDirection::Pingpong;
        animation.frame_duration = 80.0;
        animation.frame_durations = Some(vec![100.0, 200.0, 150.0]);
        animation.frame_names = vec!["a".into(), "b".into(), "c".into()];
        animation.name = "walk".into();
        animation.origin_x = 0.5;
        animation.origin_y = 1.0;
        animation.repeat_count = 3;
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
            let mut data = create_spritesheet_animation_data();
            data.direction = direction;
            assert_eq!(data.direction, direction);
        }
    }

    #[test]
    fn does_not_share_the_frame_names_between_instances() {
        let mut a = create_spritesheet_animation_data();
        let b = create_spritesheet_animation_data();
        a.frame_names.push("x".into());
        assert!(b.frame_names.is_empty());
    }
}

mod create_spritesheet_data {
    use super::*;

    #[test]
    fn creates_with_all_defaults_when_no_argument_is_passed() {
        let data = create_spritesheet_data();
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
    fn accepts_authored_fields_after_canonical_construction() {
        let mut data = create_spritesheet_data();
        data.image_file = "atlas.png".into();
        data.image_height = 512.0;
        data.image_width = 256.0;
        data.scale = 2.0;
        data.animations = vec![named_animation_data("run", &[])];
        data.frames = vec![named_frame_data("hero")];
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
        let mut a = create_spritesheet_data();
        let b = create_spritesheet_data();
        a.frames.push(create_spritesheet_frame_data());
        assert!(b.frames.is_empty());
    }
}

mod create_spritesheet_frame_data {
    use super::*;

    #[test]
    fn creates_with_all_defaults_when_no_argument_is_passed() {
        let frame = create_spritesheet_frame_data();
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
    fn accepts_authored_fields_after_canonical_construction() {
        let mut frame = create_spritesheet_frame_data();
        frame.height = 64.0;
        frame.name = "hero_idle".into();
        frame.offset_x = 2.0;
        frame.offset_y = 4.0;
        frame.pivot_x = Some(0.5);
        frame.pivot_y = Some(1.0);
        frame.rotated = true;
        frame.source_height = 72.0;
        frame.source_width = 68.0;
        frame.width = 60.0;
        frame.x = 128.0;
        frame.y = 64.0;
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
        let mut frame = create_spritesheet_frame_data();
        frame.pivot_x = None;
        frame.pivot_y = None;
        assert!(frame.pivot_x.is_none() && frame.pivot_y.is_none());
    }
}

mod initialize_spritesheet_animation_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_restoring_defaults() {
        let mut data = named_animation_data("walk", &["a"]);
        let entity_id = get_entity_id(&data);
        initialize_spritesheet_animation_data(&mut data);
        assert_eq!(get_entity_id(&data), entity_id);
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
        let mut data = create_spritesheet_data();
        data.scale = 3.0;
        let entity_id = get_entity_id(&data);
        initialize_spritesheet_data(&mut data);
        assert_eq!(get_entity_id(&data), entity_id);
        assert_eq!(data.scale, 1.0);
    }
}

mod initialize_spritesheet_frame_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_restoring_defaults() {
        let mut data = named_frame_data("hero");
        let entity_id = get_entity_id(&data);
        initialize_spritesheet_frame_data(&mut data);
        assert_eq!(get_entity_id(&data), entity_id);
        assert_eq!(data.name, "");
    }
}
