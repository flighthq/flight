use std::sync::Arc;

use flight_entity::{Ref, get_entity_id};
use flight_regexp::create_reg_exp;
use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

/// The source's makeSheet: regions walk_0, walk_1, run_0 and an unnamed one, frames 0..4.
fn named_sheet() -> Spritesheet {
    let shared = atlas();
    push_region(&shared, 0, Some("walk_0"), 0.0);
    push_region(&shared, 1, Some("walk_1"), 32.0);
    push_region(&shared, 2, Some("run_0"), 64.0);
    push_region(&shared, 3, None, 96.0);
    let mut sheet = create_spritesheet();
    sheet.atlas = Some(shared);
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

fn reg_exp(source: &str, flags: &str) -> SpritesheetFramePattern {
    return SpritesheetFramePattern::Pattern(SpritesheetFramePatternRegExp {
        value: create_reg_exp(source, flags),
    });
}

mod create_spritesheet_animation {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let shared = create_spritesheet_animation();
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
    fn accepts_authored_fields_after_canonical_construction() {
        let shared = create_spritesheet_animation();
        {
            let mut animation = shared.write().unwrap();
            animation.frame_duration = 100.0;
            animation.frames = vec![0.0, 1.0, 2.0];
            animation.repeat_count = 2;
            animation.origin_x = 16.0;
            animation.origin_y = 32.0;
        }
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
            create_spritesheet_animation(),
            create_spritesheet_animation(),
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
                &create_spritesheet(),
                &name("walk_"),
                None
            )
            .is_none()
        );
    }

    #[test]
    fn selects_frames_matching_a_reg_exp_pattern() {
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &reg_exp("^walk_", ""),
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
    fn skips_frames_whose_atlas_region_has_a_null_name() {
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &reg_exp(".", ""),
                None
            )),
            vec![0.0, 1.0, 2.0]
        );
    }

    #[test]
    fn tests_a_global_reg_exp_once_per_named_region_in_atlas_order_with_live_last_index() {
        let expression = create_reg_exp("_0", "g");
        let pattern = SpritesheetFramePattern::Pattern(SpritesheetFramePatternRegExp {
            value: expression.clone(),
        });
        // walk_0 matches (lastIndex 6), walk_1 fails from 6 (reset to 0), run_0 matches (lastIndex 5).
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &pattern,
                None
            )),
            vec![0.0, 2.0]
        );
        assert_eq!(expression.read().unwrap().last_index, 5);
    }

    #[test]
    fn starts_from_the_callers_last_index_on_the_shared_expression() {
        let expression = create_reg_exp("walk", "g");
        expression.write().unwrap().last_index = 5;
        let pattern = SpritesheetFramePattern::Pattern(SpritesheetFramePatternRegExp {
            value: expression.clone(),
        });
        // walk_0 fails from 5 (reset to 0), walk_1 matches (lastIndex 4), run_0 fails from 4 (reset).
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &pattern,
                None
            )),
            vec![1.0]
        );
        assert_eq!(expression.read().unwrap().last_index, 0);
    }

    #[test]
    fn anchors_a_sticky_reg_exp_at_its_live_last_index_for_each_region() {
        let expression = create_reg_exp("run", "y");
        let pattern = SpritesheetFramePattern::Pattern(SpritesheetFramePatternRegExp {
            value: expression.clone(),
        });
        // walk_0 and walk_1 fail at index 0 (lastIndex stays 0); run_0 matches there (lastIndex 3).
        assert_eq!(
            frames_of(&create_spritesheet_animation_from_frame_names(
                &named_sheet(),
                &pattern,
                None
            )),
            vec![2.0]
        );
        assert_eq!(expression.read().unwrap().last_index, 3);
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
        let entity_id = get_entity_id(&*shared.read().unwrap());
        initialize_spritesheet_animation(&mut shared.write().unwrap());
        let animation = shared.read().unwrap();
        assert_eq!(get_entity_id(&*animation), entity_id);
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
