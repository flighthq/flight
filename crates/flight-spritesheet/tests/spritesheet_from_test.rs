use std::sync::Arc;

use flight_entity::{get_record_keys, get_record_value};
use flight_spritesheet::contract::*;
use flight_textureatlas::GridSliceOptions;

use crate::spritesheet_fixture::*;

fn grid(columns: i32, rows: i32, image_width: f32, image_height: f32) -> GridSliceOptions {
    let make: fn() -> GridSliceOptions = GridSliceOptions::default;
    let mut options = make();
    options.columns = columns;
    options.rows = rows;
    options.image_file = "sheet.png".to_string();
    options.image_width = image_width;
    options.image_height = image_height;
    return options;
}

fn ids(sheet: &Spritesheet) -> Vec<i32> {
    return sheet
        .frames
        .iter()
        .map(|frame| frame.read().unwrap().id)
        .collect();
}

mod create_spritesheet_from_data {
    use super::*;

    #[test]
    fn builds_one_frame_per_frame_data_entry_and_shares_the_atlas() {
        let shared = atlas();
        push_region(&shared, 0, Some("hero_0"), 0.0);
        push_region(&shared, 1, Some("hero_1"), 32.0);
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            frames: Some(vec![
                named_frame_data("hero_0"),
                create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
                    name: Some("hero_1".into()),
                    offset_x: Some(4.0),
                    ..frame_data_options()
                })),
            ]),
            image_file: Some("hero.png".into()),
            ..data_options()
        }));
        let sheet = create_spritesheet_from_data(&data, &shared);
        assert_eq!(ids(&sheet), vec![0, 1]);
        assert_eq!(sheet.frames[1].read().unwrap().offset_x, 4.0);
        assert!(Arc::ptr_eq(sheet.atlas.as_ref().unwrap(), &shared));
    }

    #[test]
    fn resolves_frame_region_ids_by_name_with_the_last_region_of_a_name_winning() {
        let shared = atlas();
        push_region(&shared, 5, Some("walk_0"), 0.0);
        push_region(&shared, 8, Some("walk_0"), 32.0);
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            frames: Some(vec![named_frame_data("walk_0")]),
            ..data_options()
        }));
        assert_eq!(ids(&create_spritesheet_from_data(&data, &shared)), vec![8]);
    }

    #[test]
    fn falls_back_to_the_position_for_an_empty_or_unknown_name() {
        let shared = atlas();
        push_region(&shared, 7, None, 0.0);
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            frames: Some(vec![named_frame_data(""), named_frame_data("missing")]),
            ..data_options()
        }));
        assert_eq!(
            ids(&create_spritesheet_from_data(&data, &shared)),
            vec![0, 1]
        );
    }

    #[test]
    fn builds_animations_keyed_by_name_with_direction_and_frame_durations() {
        let shared = atlas();
        push_region(&shared, 0, Some("f0"), 0.0);
        push_region(&shared, 1, Some("f1"), 32.0);
        let walk = create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
            name: Some("walk".into()),
            direction: Some(SpritesheetAnimationDirection::Pingpong),
            frame_duration: Some(100.0),
            frame_durations: Some(vec![80.0, 120.0]),
            frame_names: Some(vec!["f0".into(), "f1".into()]),
            repeat_count: Some(3),
            ..animation_data_options()
        }));
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            animations: Some(vec![walk]),
            frames: Some(vec![named_frame_data("f0"), named_frame_data("f1")]),
            ..data_options()
        }));
        let sheet = create_spritesheet_from_data(&data, &shared);
        let animation = get_record_value(&sheet.animations, "walk")
            .unwrap()
            .read()
            .unwrap();
        assert_eq!(animation.direction, SpritesheetAnimationDirection::Pingpong);
        assert_eq!(animation.frame_durations, Some(vec![80.0, 120.0]));
        assert_eq!(animation.frames, vec![0.0, 1.0]);
        assert_eq!(
            (animation.repeat_count, animation.frame_duration),
            (3, 100.0)
        );
    }

    #[test]
    fn carries_pivot_and_rotated_onto_runtime_frames() {
        let shared = atlas();
        push_region(&shared, 0, Some("r0"), 0.0);
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            frames: Some(vec![create_spritesheet_frame_data(Some(
                SpritesheetFrameDataOptions {
                    name: Some("r0".into()),
                    pivot_x: Some(8.0),
                    pivot_y: Some(16.0),
                    rotated: Some(true),
                    ..frame_data_options()
                },
            ))]),
            ..data_options()
        }));
        let sheet = create_spritesheet_from_data(&data, &shared);
        let frame = sheet.frames[0].read().unwrap();
        assert_eq!(
            (frame.pivot_x, frame.pivot_y, frame.rotated),
            (Some(8.0), Some(16.0), true)
        );
    }

    #[test]
    fn uses_all_data_frames_when_an_animation_has_no_frame_names() {
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            animations: Some(vec![named_animation_data("idle", &[])]),
            frames: Some(vec![named_frame_data(""), named_frame_data("")]),
            ..data_options()
        }));
        let sheet = create_spritesheet_from_data(&data, &atlas());
        assert_eq!(
            get_record_value(&sheet.animations, "idle")
                .unwrap()
                .read()
                .unwrap()
                .frames,
            vec![0.0, 1.0]
        );
    }

    #[test]
    fn drops_unknown_frame_names_and_resolves_duplicates_to_the_last_frame() {
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            animations: Some(vec![named_animation_data("a", &["x", "missing", "y"])]),
            frames: Some(vec![
                named_frame_data("x"),
                named_frame_data("y"),
                named_frame_data("x"),
            ]),
            ..data_options()
        }));
        let sheet = create_spritesheet_from_data(&data, &atlas());
        assert_eq!(
            get_record_value(&sheet.animations, "a")
                .unwrap()
                .read()
                .unwrap()
                .frames,
            vec![2.0, 1.0]
        );
    }

    #[test]
    fn a_repeated_animation_name_keeps_its_first_position_and_the_last_definition() {
        let data = create_spritesheet_data(Some(SpritesheetDataOptions {
            animations: Some(vec![
                named_animation_data("walk", &["a"]),
                named_animation_data("idle", &[]),
                named_animation_data("walk", &[]),
            ]),
            frames: Some(vec![named_frame_data("a"), named_frame_data("b")]),
            ..data_options()
        }));
        let sheet = create_spritesheet_from_data(&data, &atlas());
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &sheet.animations);
                collected
            },
            vec!["walk", "idle"]
        );
        assert_eq!(
            get_record_value(&sheet.animations, "walk")
                .unwrap()
                .read()
                .unwrap()
                .frames,
            vec![0.0, 1.0]
        );
    }
}

mod create_spritesheet_from_grid {
    use super::*;

    #[test]
    fn creates_one_frame_per_cell_with_sequential_ids() {
        let sheet = create_spritesheet_from_grid(&grid(4, 2, 128.0, 64.0));
        assert_eq!(sheet.frames.len(), 8);
        assert_eq!(
            sheet.atlas.as_ref().unwrap().read().unwrap().regions.len(),
            8
        );
        assert_eq!(
            ids(&create_spritesheet_from_grid(&grid(2, 1, 64.0, 32.0))),
            vec![0, 1]
        );
    }

    #[test]
    fn computes_cell_positions_with_and_without_margins_and_spacing() {
        let sheet = create_spritesheet_from_grid(&grid(2, 2, 64.0, 64.0));
        let positions: Vec<(f32, f32)> = sheet
            .atlas
            .as_ref()
            .unwrap()
            .read()
            .unwrap()
            .regions
            .iter()
            .map(|r| (r.read().unwrap().x, r.read().unwrap().y))
            .collect();
        assert_eq!(
            positions,
            vec![(0.0, 0.0), (32.0, 0.0), (0.0, 32.0), (32.0, 32.0)]
        );
        let mut spaced = grid(2, 1, 74.0, 36.0);
        spaced.frame_width = Some(32.0);
        spaced.frame_height = Some(32.0);
        spaced.margin_x = Some(2.0);
        spaced.margin_y = Some(2.0);
        spaced.spacing_x = Some(4.0);
        spaced.spacing_y = Some(0.0);
        let sheet = create_spritesheet_from_grid(&spaced);
        let positions: Vec<(f32, f32)> = sheet
            .atlas
            .as_ref()
            .unwrap()
            .read()
            .unwrap()
            .regions
            .iter()
            .map(|r| (r.read().unwrap().x, r.read().unwrap().y))
            .collect();
        assert_eq!(positions, vec![(2.0, 2.0), (38.0, 2.0)]);
    }

    #[test]
    fn uses_a_custom_name_prefix_and_explicit_frame_size() {
        let mut options = grid(2, 1, 80.0, 40.0);
        options.name_prefix = Some("hero_".to_string());
        options.frame_width = Some(30.0);
        options.frame_height = Some(40.0);
        let sheet = create_spritesheet_from_grid(&options);
        let atlas = sheet.atlas.as_ref().unwrap().read().unwrap();
        let first = atlas.regions[0].read().unwrap();
        assert_eq!(
            (first.name.as_deref(), first.width, first.height),
            (Some("hero_0"), 30.0, 40.0)
        );
        assert_eq!(
            atlas.regions[1].read().unwrap().name.as_deref(),
            Some("hero_1")
        );
    }

    #[test]
    fn creates_an_atlas_with_no_texture() {
        let sheet = create_spritesheet_from_grid(&grid(1, 1, 32.0, 32.0));
        assert!(
            sheet
                .atlas
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture
                .is_none()
        );
        assert!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &sheet.animations);
                collected
            }
            .is_empty()
        );
    }
}
