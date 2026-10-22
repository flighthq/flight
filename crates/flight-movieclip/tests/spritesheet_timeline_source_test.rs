use std::sync::{Arc, Mutex};

use flight_movieclip::contract::*;
use flight_node::{NodeRef, get_node_children};
use flight_scene2d::{Node2D, Node2DRef, Sprite, create_display_object};
use flight_spritesheet::contract::*;
use flight_texture::TextureUvTransform;
use flight_textureatlas::contract::*;
use flight_timeline::contract::{FrameConstruct, TimelineSource};

use crate::support::*;

fn construct(source: &flight_timeline::TimelineSourceRef) -> FrameConstruct {
    return source.read().unwrap().construct_frame.clone();
}

fn with_sprite<R>(target: &Node2DRef, visit: impl FnOnce(&Sprite) -> R) -> R {
    let children = {
        let mut collected = Vec::new();
        get_node_children(&mut collected, &(target.clone() as NodeRef));
        collected
    };
    assert_eq!(children.len(), 1);
    let child = children[0].read().unwrap();
    let sprite = child
        .as_any()
        .downcast_ref::<Sprite>()
        .expect("sprite child");
    return visit(sprite);
}

mod create_spritesheet_timeline_source {
    use super::*;

    #[test]
    fn reports_total_frames_and_frame_rate_from_frame_duration() {
        let sheet = sheet_with_frames(3);
        let animation = animation(vec![0.0, 1.0, 2.0], None);
        let guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let source = source.read().unwrap();
        assert_eq!(source.total_frames, 3);
        assert_eq!(source.frame_rate, Some(10.0));
    }

    #[test]
    fn lazily_creates_one_bitmap_child_on_the_target() {
        let sheet = sheet_with_frames(2);
        let animation = animation(vec![0.0, 1.0], None);
        let guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let target = create_display_object();
        let target_ref: Node2DRef = target.clone();
        let construct = construct(&source);
        construct(&target_ref, 1);
        construct(&target_ref, 2);
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_node_children(&mut collected, &(target_ref.clone() as NodeRef));
                collected
            }
            .len(),
            1
        );
    }

    #[test]
    fn applies_normalized_pivots_against_original_frame_size_and_clears_absent_pivots() {
        let sheet = sheet_with_frames(2);
        {
            let atlas = sheet.read().unwrap().atlas.clone().unwrap();
            atlas.write().unwrap().regions[0]
                .write()
                .unwrap()
                .original_width = Some(80.0);
            atlas.write().unwrap().regions[0]
                .write()
                .unwrap()
                .original_height = Some(40.0);
        }
        sheet.read().unwrap().frames[0].write().unwrap().pivot_x = Some(0.25);
        sheet.read().unwrap().frames[0].write().unwrap().pivot_y = Some(0.75);
        let animation = animation(vec![0.0, 1.0], None);
        let guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let target = create_display_object();
        let target_ref: Node2DRef = target.clone();
        let construct = construct(&source);
        construct(&target_ref, 1);
        with_sprite(&target_ref, |sprite| {
            assert_eq!(sprite.node2d_fields().pivot_x, 20.0);
            assert_eq!(sprite.node2d_fields().pivot_y, 30.0);
        });
        construct(&target_ref, 2);
        with_sprite(&target_ref, |sprite| {
            assert_eq!(sprite.node2d_fields().pivot_x, 0.0);
            assert_eq!(sprite.node2d_fields().pivot_y, 0.0);
        });
    }

    #[test]
    fn writes_the_frame_offsets_minus_the_animation_origin() {
        let sheet = sheet_with_frames(1);
        sheet.read().unwrap().frames[0].write().unwrap().offset_x = 12.0;
        sheet.read().unwrap().frames[0].write().unwrap().offset_y = 7.0;
        let animation = animation(vec![0.0], None);
        {
            let mut animation = animation.write().unwrap();
            animation.origin_x = 2.0;
            animation.origin_y = 1.0;
        }
        let guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let target = create_display_object();
        let target_ref: Node2DRef = target.clone();
        construct(&source)(&target_ref, 1);
        with_sprite(&target_ref, |sprite| {
            assert_eq!(sprite.node2d_fields().x, 10.0);
            assert_eq!(sprite.node2d_fields().y, 6.0);
        });
    }

    #[test]
    fn does_not_throw_without_an_atlas() {
        let sheet = std::sync::Arc::new(std::sync::RwLock::new(create_spritesheet()));
        let animation = animation(vec![0.0], None);
        let guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let target = create_display_object();
        let target_ref: Node2DRef = target.clone();
        construct(&source)(&target_ref, 1);
        assert!(
            {
                let mut collected = Vec::new();
                get_node_children(&mut collected, &(target_ref as NodeRef));
                collected
            }
            .is_empty()
        );
    }

    #[test]
    fn materializes_each_direction_as_an_exact_forward_sequence() {
        let cases = [
            (SpritesheetAnimationDirection::Forward, vec![0.0, 1.0, 2.0]),
            (SpritesheetAnimationDirection::Reverse, vec![2.0, 1.0, 0.0]),
            (
                SpritesheetAnimationDirection::Pingpong,
                vec![0.0, 1.0, 2.0, 1.0],
            ),
            (
                SpritesheetAnimationDirection::PingpongReverse,
                vec![2.0, 1.0, 0.0, 1.0],
            ),
        ];
        for (direction, expected) in cases {
            let sheet = sheet_with_frames(3);
            let animation = animation(vec![0.0, 1.0, 2.0], Some(direction));
            let guards = MovieClipGuardState {
                movie_clip_guards_enabled: false,
                spritesheet_timeline_source_guard: None,
            };
            let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
            assert_eq!(source.read().unwrap().total_frames, expected.len() as i32);
        }
    }

    #[test]
    fn shows_the_region_texture_for_each_materialized_frame() {
        let sheet = sheet_with_frames(3);
        let animation = animation(
            vec![0.0, 1.0, 2.0],
            Some(SpritesheetAnimationDirection::Reverse),
        );
        let guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let source = create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let target = create_display_object();
        let target_ref: Node2DRef = target.clone();
        let frame_construct = construct(&source);
        let atlas = sheet.read().unwrap().atlas.clone().unwrap();
        for frame in 1..=3 {
            frame_construct(&target_ref, frame);
            let index = 3 - frame;
            let expected = get_texture_atlas_region_texture(&atlas, index, None).unwrap();
            with_sprite(&target_ref, |sprite| {
                let texture = sprite.data.texture.as_ref().expect("texture");
                let texture = texture.read().unwrap();
                let expected = expected.read().unwrap();
                assert_eq!(texture.texture_fields(), expected.texture_fields());
            });
        }
    }
}

mod explain_spritesheet_timeline_source {
    use super::*;

    #[test]
    fn reports_only_fields_the_source_cannot_carry() {
        let uniform = animation(
            vec![0.0, 1.0, 2.0],
            Some(SpritesheetAnimationDirection::Pingpong),
        );
        uniform.write().unwrap().repeat_count = 3;
        let variable = animation(
            vec![0.0, 1.0, 2.0],
            Some(SpritesheetAnimationDirection::PingpongReverse),
        );
        {
            let mut variable = variable.write().unwrap();
            variable.frame_durations = Some(vec![50.0, 100.0, 200.0]);
            variable.repeat_count = -1;
        }
        assert_eq!(
            explain_spritesheet_timeline_source(&uniform),
            SpritesheetTimelineSourceExplanation {
                direction_materialized: true,
                unsupported_fields: vec![SpritesheetTimelineSourceUnsupportedField::RepeatCount],
            }
        );
        assert_eq!(
            explain_spritesheet_timeline_source(&variable),
            SpritesheetTimelineSourceExplanation {
                direction_materialized: true,
                unsupported_fields: vec![
                    SpritesheetTimelineSourceUnsupportedField::FrameDurations,
                    SpritesheetTimelineSourceUnsupportedField::RepeatCount,
                ],
            }
        );
    }
}

mod initialize_spritesheet_timeline_source {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_spritesheet_timeline_source() {
        let sheet = sheet_with_frames(1);
        let animation = animation(vec![0.0], None);
        let guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        let mut out = flight_entity::allocate_entity::<TimelineSource>();
        initialize_spritesheet_timeline_source(&mut out, &guards, &sheet, &animation);
        assert_eq!(out.total_frames, 1);
    }
}

mod set_spritesheet_timeline_source_guard {
    use super::*;

    #[test]
    fn receives_the_animation_and_explanation_only_while_installed() {
        let sheet = sheet_with_frames(1);
        let animation = animation(vec![0.0], None);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let seen_guard = seen.clone();
        let mut guards = MovieClipGuardState {
            movie_clip_guards_enabled: false,
            spritesheet_timeline_source_guard: None,
        };
        set_spritesheet_timeline_source_guard(
            &mut guards,
            Some(Arc::new(move |animation, explanation| {
                seen_guard.lock().unwrap().push((
                    animation.read().unwrap().frames.clone(),
                    explanation.clone(),
                ));
            })),
        );
        create_spritesheet_timeline_source(&guards, &sheet, &animation);
        set_spritesheet_timeline_source_guard(&mut guards, None);
        create_spritesheet_timeline_source(&guards, &sheet, &animation);
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, vec![0.0]);
        assert_eq!(
            seen[0].1.unsupported_fields,
            vec![SpritesheetTimelineSourceUnsupportedField::RepeatCount]
        );
    }
}
