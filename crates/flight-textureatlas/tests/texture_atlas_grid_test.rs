use std::sync::Arc;

use flight_textureatlas::contract::*;

use crate::texture_atlas_fixture::*;

fn grid(columns: i32, rows: i32, image_width: f32, image_height: f32) -> GridSliceOptions {
    let make: fn() -> GridSliceOptions = GridSliceOptions::default;
    let mut options = make();
    options.columns = columns;
    options.rows = rows;
    options.image_width = image_width;
    options.image_height = image_height;
    return options;
}

fn rects(atlas: &TextureAtlas) -> Vec<(f32, f32, f32, f32)> {
    return atlas
        .regions
        .iter()
        .map(|region| {
            let region = region.read().unwrap();
            (region.x, region.y, region.width, region.height)
        })
        .collect();
}

mod create_texture_atlas_from_grid {
    use super::*;

    #[test]
    fn attaches_the_optional_texture() {
        let texture = empty_page();
        let atlas = create_texture_atlas_from_grid(&grid(1, 1, 32.0, 32.0), Some(texture.clone()));
        assert!(Arc::ptr_eq(atlas.texture.as_ref().unwrap(), &texture));
        assert!(
            create_texture_atlas_from_grid(&grid(1, 1, 32.0, 32.0), None)
                .texture
                .is_none()
        );
    }

    #[test]
    fn derives_cells_after_per_axis_margins_and_spacing() {
        let mut options = grid(2, 1, 74.0, 38.0);
        options.margin_x = Some(2.0);
        options.margin_y = Some(3.0);
        options.spacing_x = Some(4.0);
        options.spacing_y = Some(2.0);
        let atlas = create_texture_atlas_from_grid(&options, None);
        assert_eq!(
            rects(&atlas),
            vec![(2.0, 3.0, 33.0, 32.0), (39.0, 3.0, 33.0, 32.0)]
        );
    }

    #[test]
    fn honors_explicit_cell_dimensions_without_admitting_partial_trailing_cells() {
        let mut options = grid(2, 1, 69.0, 35.0);
        options.frame_width = Some(32.0);
        options.frame_height = Some(32.0);
        options.margin_x = Some(1.0);
        options.margin_y = Some(1.0);
        options.spacing_x = Some(2.0);
        let atlas = create_texture_atlas_from_grid(&options, None);
        assert_eq!(
            rects(&atlas),
            vec![(1.0, 1.0, 32.0, 32.0), (35.0, 1.0, 32.0, 32.0)]
        );
    }

    #[test]
    fn numbers_and_names_regions_in_row_major_order() {
        let mut options = grid(2, 2, 16.0, 16.0);
        options.name_prefix = Some("tile_".to_string());
        let atlas = create_texture_atlas_from_grid(&options, None);
        let cells: Vec<(i32, Option<String>, f32, f32)> = atlas
            .regions
            .iter()
            .map(|region| {
                let region = region.read().unwrap();
                (region.id, region.name.clone(), region.x, region.y)
            })
            .collect();
        assert_eq!(
            cells,
            vec![
                (0, Some("tile_0".to_string()), 0.0, 0.0),
                (1, Some("tile_1".to_string()), 8.0, 0.0),
                (2, Some("tile_2".to_string()), 0.0, 8.0),
                (3, Some("tile_3".to_string()), 8.0, 8.0),
            ]
        );
    }

    #[test]
    fn defaults_the_name_prefix_to_frame_and_floors_derived_sizes() {
        let atlas = create_texture_atlas_from_grid(&grid(3, 1, 10.0, 5.0), None);
        let region = atlas.regions[2].read().unwrap();
        assert_eq!(region.name.as_deref(), Some("frame_2"));
        assert_eq!((region.width, region.height, region.x), (3.0, 5.0, 6.0));
    }

    #[test]
    fn produces_no_regions_for_a_zero_or_negative_count() {
        assert!(
            create_texture_atlas_from_grid(&grid(0, 2, 16.0, 16.0), None)
                .regions
                .is_empty()
        );
        assert!(
            create_texture_atlas_from_grid(&grid(2, -1, 16.0, 16.0), None)
                .regions
                .is_empty()
        );
    }

    #[test]
    fn a_later_add_continues_past_the_grid_ids() {
        let mut atlas = create_texture_atlas_from_grid(&grid(2, 1, 16.0, 16.0), None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 1.0, 1.0, None, None, None);
        assert_eq!(atlas.regions[2].read().unwrap().id, 2);
    }
}
