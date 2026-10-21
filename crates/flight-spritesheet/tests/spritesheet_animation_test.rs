use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

/// The source's makeSheet: regions walk_0, walk_1, run_0 and an unnamed one, frames 0..4.
fn named_sheet() -> Spritesheet {
    let shared = atlas();
    push_region(&shared, 0, Some("walk_0"), 0.0);
    push_region(&shared, 1, Some("walk_1"), 32.0);
    push_region(&shared, 2, Some("run_0"), 64.0);
    push_region(&shared, 3, None, 96.0);
    let mut sheet = create_spritesheet(Some(SpritesheetOptions {
        atlas: Some(shared),
        ..sheet_options()
    }));
    for i in 0..4 {
        sheet.frames.push(frame(i));
    }
    return sheet;
}

fn name(value: &str) -> SpritesheetFramePattern {
    return SpritesheetFramePattern::Name(SpritesheetFramePatternName {
        value: value.to_string(),
    });
}

fn frames_of(animation: &Option<Ref<SpritesheetAnimation>>) -> Vec<f64> {
    return animation.as_ref().unwrap().read().unwrap().frames.clone();
}

mod create_spritesheet_animation {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let shared = create_spritesheet_animation(None);
        let animation = shared.read().unwrap();
        assert_eq!(animation.direction, SpritesheetAnimationDirection::Forward);
        assert!(animation.frame_durations.is_none());
        assert_eq!(
            (
                animation.frame_duration,
                animation.origin_x,
                animation.origin_y,
                animation.repeat_count
            ),
            (0.0, 0.0, 0.0, 0)
        );
        assert!(animation.frames.is_empty());
    }

    #[test]
    fn applies_partial_overrides() {
        let shared = create_spritesheet_animation(Some(&SpritesheetAnimationOptions {
            frame_duration: Some(100.0),
            frames: Some(vec![0.0, 1.0, 2.0]),
            repeat_count: Some(2),
            origin_x: Some(16.0),
            origin_y: Some(32.0),
            ..animation_options()
        }));
        let animation = shared.read().unwrap();
        assert_eq!(
            (animation.frame_duration, animation.repeat_count),
            (100.0, 2)
        );
        assert_eq!(animation.frames, vec![0.0, 1.0, 2.0]);
        assert_eq!((animation.origin_x, animation.origin_y), (16.0, 32.0));
    }

    #[test]
    fn returns_a_new_animation_with_its_own_frames_each_call() {
        let (a, b) = (
            create_spritesheet_animation(None),
            create_spritesheet_animation(None),
        );
        assert!(!Arc::ptr_eq(&a, &b));
        a.write().unwrap().frames.push(99.0);
        assert!(b.read().unwrap().frames.is_empty());
    }
}

mod create_spritesheet_animation_from_frame_names {
    use super::*;

    #[test]
    fn applies_options_to_the_returned_animation() {
        let options = SpritesheetAnimationFrameNameOptions {
            direction: Some(SpritesheetAnimationDirection::Pingpong),
            frame_duration: Some(80.0),
            repeat_count: Some(-1),
            ..frame_name_options()
        };
        let animation = create_spritesheet_animation_from_frame_names(
            &named_sheet(),
            &name("walk_"),
            Some(&options),
        )
        .unwrap();
        let animation = animation.read().unwrap();
        assert_eq!(
            (
                animation.direction,
                animation.frame_duration,
                animation.repeat_count
            ),
            (SpritesheetAnimationDirection::Pingpong, 80.0, -1)
        );
    }

    #[test]
    fn returns_null_without_a_match_or_an_atlas() {
        assert!(
            create_spritesheet_animation_from_frame_names(&named_sheet(), &name("jump_"), None)
                .is_none()
        );
        assert!(
            create_spritesheet_animation_from_frame_names(
                &create_spritesheet(None),
                &name("walk_"),
                None
            )
            .is_none()
        );
    }

    #[test]
    fn selects_frames_matching_a_test_pattern() {
        let pattern = SpritesheetFramePattern::Test(SpritesheetFramePatternTest {
            test: Arc::new(|name| name.starts_with("walk_")),
        });
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &pattern,
                None
            )),
            vec![0.0, 1.0]
        );
    }

    #[test]
    fn selects_frames_by_prefix_or_exact_name() {
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &name("walk_"),
                None
            )),
            vec![0.0, 1.0]
        );
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &name("run_0"),
                None
            )),
            vec![2.0]
        );
    }

    #[test]
    fn skips_frames_whose_region_has_a_null_name_and_calls_the_test_once_per_named_region_in_order()
    {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let pattern = SpritesheetFramePattern::Test(SpritesheetFramePatternTest {
            test: Arc::new(move |name| {
                record.lock().unwrap().push(name.to_string());
                return true;
            }),
        });
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &pattern,
                None
            )),
            vec![0.0, 1.0, 2.0]
        );
        assert_eq!(*seen.lock().unwrap(), vec!["walk_0", "walk_1", "run_0"]);
    }

    #[test]
    fn looks_regions_up_by_frame_id_as_an_index_and_skips_missing_ones() {
        let mut sheet = named_sheet();
        sheet.frames = vec![frame(2), frame(9), frame(-1), frame(0)];
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &sheet,
                &name(""),
                None
            )),
            vec![0.0, 3.0]
        );
    }
}

mod get_spritesheet_animation_direction_string {
    use super::*;

    #[test]
    fn round_trips_every_direction() {
        for (value, text) in [
            (SpritesheetAnimationDirection::Forward, "forward"),
            (SpritesheetAnimationDirection::Pingpong, "pingpong"),
            (
                SpritesheetAnimationDirection::PingpongReverse,
                "pingpong_reverse",
            ),
            (SpritesheetAnimationDirection::Reverse, "reverse"),
        ] {
            assert_eq!(get_spritesheet_animation_direction_string(value), text);
            assert_eq!(parse_spritesheet_animation_direction(text), Some(value));
        }
    }
}

mod initialize_spritesheet_animation {
    use super::*;

    #[test]
    fn is_the_construction_initializer_resetting_unset_fields() {
        let shared = animation(&[0.0, 1.0], 100.0, 3);
        initialize_spritesheet_animation(&mut shared.write().unwrap(), None);
        let animation = shared.read().unwrap();
        assert!(animation.frames.is_empty());
        assert_eq!((animation.frame_duration, animation.repeat_count), (0.0, 0));
    }
}

mod parse_spritesheet_animation_direction {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(
            parse_spritesheet_animation_direction("pingpong-reverse"),
            None
        );
    }
}
