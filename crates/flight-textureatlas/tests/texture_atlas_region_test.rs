use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_geometry::{Rectangle, create_rectangle, create_vector2};
use flight_texture::{
    TextureSourceRef, TextureUvTransform, get_texture_source, transform_texture_uv,
};
use flight_textureatlas::contract::*;

use crate::texture_atlas_fixture::*;

fn named(atlas: &mut TextureAtlas, x: f32, name: &str) {
    add_texture_atlas_region(atlas, x, 0.0, 10.0, 10.0, None, None, Some(name));
}

fn region_at(atlas: &TextureAtlas, index: usize) -> TextureAtlasRegion {
    return atlas.regions[index].read().unwrap().clone();
}

fn names(regions: &[Ref<TextureAtlasRegion>]) -> Vec<String> {
    return regions
        .iter()
        .map(|region| region.read().unwrap().name.clone().unwrap_or_default())
        .collect();
}

fn region(options: TextureAtlasRegionOptions) -> TextureAtlasRegion {
    return create_texture_atlas_region(Some(&options))
        .read()
        .unwrap()
        .clone();
}

fn rect() -> Rectangle {
    return create_rectangle(0.0, 0.0, 0.0, 0.0);
}

fn image_page(
    width: u32,
    height: u32,
    common: flight_texture::CreateTextureCommonOptions,
) -> Ref<flight_texture::Texture2D> {
    return page(Some(image(width, height) as TextureSourceRef), common);
}

fn atlas_over(page: Ref<flight_texture::Texture2D>) -> TextureAtlas {
    return create_texture_atlas(Some(TextureAtlasOptions {
        texture: Some(page),
        ..atlas_options()
    }));
}

fn close(a: f32, b: f32) -> bool {
    return (a - b).abs() < 1e-5;
}

mod add_texture_atlas_region {
    use super::*;

    #[test]
    fn pushes_a_new_region_onto_the_atlas_with_the_given_coordinates() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 10.0, 20.0, 30.0, 40.0, None, None, None);
        assert_eq!(atlas.regions.len(), 1);
        let region = region_at(&atlas, 0);
        assert_eq!(
            (region.x, region.y, region.width, region.height),
            (10.0, 20.0, 30.0, 40.0)
        );
    }

    #[test]
    fn assigns_ids_in_order_on_a_fresh_atlas() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert_eq!((region_at(&atlas, 0).id, region_at(&atlas, 1).id), (0, 1));
    }

    #[test]
    fn sets_optional_pivot_values_and_name() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, Some(5.0), Some(5.0), None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, Some("hero"));
        assert_eq!(
            (region_at(&atlas, 0).pivot_x, region_at(&atlas, 0).pivot_y),
            (Some(5.0), Some(5.0))
        );
        assert_eq!(region_at(&atlas, 1).name.as_deref(), Some("hero"));
    }

    #[test]
    fn defaults_name_and_pivot_to_null_when_not_provided() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        let region = region_at(&atlas, 0);
        assert!(region.name.is_none() && region.pivot_x.is_none() && region.pivot_y.is_none());
    }

    #[test]
    fn does_not_collide_with_an_existing_non_sequential_id() {
        let make = |id: i32, name: &str, x: f32| {
            create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
                height: Some(1.0),
                id: Some(id),
                name: Some(name.to_string()),
                width: Some(1.0),
                x: Some(x),
                ..region_options()
            }))
        };
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            regions: Some(vec![make(5, "a", 0.0), make(2, "b", 1.0)]),
            ..atlas_options()
        }));
        add_texture_atlas_region(&mut atlas, 2.0, 0.0, 1.0, 1.0, None, None, Some("c"));
        let mut ids: Vec<i32> = atlas
            .regions
            .iter()
            .map(|region| region.read().unwrap().id)
            .collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 3);
        assert_eq!(
            get_texture_atlas_region_by_id(&atlas, 2)
                .unwrap()
                .read()
                .unwrap()
                .name
                .as_deref(),
            Some("b")
        );
        let c_id = get_texture_atlas_region_by_name(&atlas, "c")
            .unwrap()
            .read()
            .unwrap()
            .id;
        assert_eq!(
            get_texture_atlas_region_by_id(&atlas, c_id)
                .unwrap()
                .read()
                .unwrap()
                .name
                .as_deref(),
            Some("c")
        );
    }

    #[test]
    fn does_not_reuse_a_removed_region_id() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "a");
        named(&mut atlas, 1.0, "b");
        let removed = get_texture_atlas_region_by_name(&atlas, "b")
            .unwrap()
            .read()
            .unwrap()
            .id;
        remove_texture_atlas_region(&mut atlas, removed);
        named(&mut atlas, 2.0, "c");
        assert_ne!(
            get_texture_atlas_region_by_name(&atlas, "c")
                .unwrap()
                .read()
                .unwrap()
                .id,
            removed
        );
    }

    #[test]
    fn does_not_reuse_ids_after_clearing() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "a");
        named(&mut atlas, 1.0, "b");
        clear_texture_atlas_regions(&mut atlas);
        named(&mut atlas, 2.0, "c");
        assert_eq!(region_at(&atlas, 0).id, 2);
    }
}

mod add_texture_atlas_region_corners {
    use super::*;

    #[test]
    fn computes_width_and_height_from_corner_coordinates() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region_corners(&mut atlas, 5.0, 10.0, 25.0, 30.0, None, None, None);
        let region = region_at(&atlas, 0);
        assert_eq!(
            (region.x, region.y, region.width, region.height),
            (5.0, 10.0, 20.0, 20.0)
        );
    }

    #[test]
    fn sets_optional_name_and_pivot() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region_corners(
            &mut atlas,
            0.0,
            0.0,
            10.0,
            10.0,
            Some(1.0),
            Some(2.0),
            Some("tile_0"),
        );
        let region = region_at(&atlas, 0);
        assert_eq!(region.name.as_deref(), Some("tile_0"));
        assert_eq!((region.pivot_x, region.pivot_y), (Some(1.0), Some(2.0)));
    }
}

mod add_texture_atlas_region_rectangle {
    use super::*;

    #[test]
    fn adds_a_region_from_a_rectangle_and_vector_pivot() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region_rectangle(
            &mut atlas,
            &create_rectangle(10.0, 20.0, 30.0, 40.0),
            Some(&create_vector2(5.0, 6.0)),
            None,
        );
        let region = region_at(&atlas, 0);
        assert_eq!(
            (region.x, region.y, region.width, region.height),
            (10.0, 20.0, 30.0, 40.0)
        );
        assert_eq!((region.pivot_x, region.pivot_y), (Some(5.0), Some(6.0)));
    }

    #[test]
    fn leaves_the_pivot_null_without_one_and_sets_optional_name() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region_rectangle(
            &mut atlas,
            &create_rectangle(0.0, 0.0, 10.0, 10.0),
            None,
            Some("frame_00"),
        );
        let region = region_at(&atlas, 0);
        assert_eq!(region.name.as_deref(), Some("frame_00"));
        assert!(region.pivot_x.is_none() && region.pivot_y.is_none());
    }
}

mod add_texture_atlas_region_vector2 {
    use super::*;

    #[test]
    fn computes_the_region_from_two_corner_points_with_a_pivot() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region_vector2(
            &mut atlas,
            &create_vector2(5.0, 10.0),
            &create_vector2(25.0, 30.0),
            Some(&create_vector2(3.0, 4.0)),
            None,
        );
        let region = region_at(&atlas, 0);
        assert_eq!(
            (region.x, region.y, region.width, region.height),
            (5.0, 10.0, 20.0, 20.0)
        );
        assert_eq!((region.pivot_x, region.pivot_y), (Some(3.0), Some(4.0)));
    }

    #[test]
    fn sets_optional_name() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region_vector2(
            &mut atlas,
            &create_vector2(0.0, 0.0),
            &create_vector2(10.0, 10.0),
            None,
            Some("walk_01"),
        );
        assert_eq!(region_at(&atlas, 0).name.as_deref(), Some("walk_01"));
    }
}

mod build_texture_atlas_region_index {
    use super::*;

    #[test]
    fn maps_every_named_region_to_itself() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "a");
        named(&mut atlas, 1.0, "b");
        let index = build_texture_atlas_region_index(&atlas);
        assert_eq!(index.len(), 2);
        assert!(Arc::ptr_eq(
            &index["a"],
            &get_texture_atlas_region_by_name(&atlas, "a").unwrap()
        ));
        assert!(Arc::ptr_eq(
            &index["b"],
            &get_texture_atlas_region_by_name(&atlas, "b").unwrap()
        ));
    }

    #[test]
    fn skips_unnamed_regions() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 1.0, 1.0, None, None, None);
        assert!(build_texture_atlas_region_index(&atlas).is_empty());
    }

    #[test]
    fn resolves_a_duplicate_name_the_same_way_the_linear_scan_does() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "dup");
        named(&mut atlas, 5.0, "dup");
        let index = build_texture_atlas_region_index(&atlas);
        assert!(Arc::ptr_eq(
            &index["dup"],
            &get_texture_atlas_region_by_name(&atlas, "dup").unwrap()
        ));
        assert_eq!(index["dup"].read().unwrap().x, 0.0);
    }

    #[test]
    fn is_a_snapshot_a_later_add_is_not_reflected() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "a");
        let index = build_texture_atlas_region_index(&atlas);
        named(&mut atlas, 1.0, "b");
        assert!(!index.contains_key("b"));
    }
}

mod clear_texture_atlas_regions {
    use super::*;

    #[test]
    fn empties_the_regions_and_leaves_the_atlas_reusable() {
        let page = empty_page();
        let mut atlas = atlas_over(page.clone());
        named(&mut atlas, 0.0, "a");
        clear_texture_atlas_regions(&mut atlas);
        assert_eq!(get_texture_atlas_region_count(&atlas), 0);
        assert!(Arc::ptr_eq(atlas.texture.as_ref().unwrap(), &page));
        named(&mut atlas, 0.0, "b");
        assert_eq!(get_texture_atlas_region_count(&atlas), 1);
    }

    #[test]
    fn is_a_no_op_on_an_empty_atlas() {
        let mut atlas = create_texture_atlas(None);
        clear_texture_atlas_regions(&mut atlas);
        assert_eq!(get_texture_atlas_region_count(&atlas), 0);
    }
}

mod create_texture_atlas_region {
    use super::*;

    #[test]
    fn allows_pre_defined_values() {
        let obj = region(TextureAtlasRegionOptions {
            x: Some(1.0),
            y: Some(2.0),
            width: Some(3.0),
            height: Some(4.0),
            id: Some(5),
            name: Some("hero".to_string()),
            pivot_x: Some(6.0),
            pivot_y: Some(7.0),
            ..region_options()
        });
        assert_eq!(
            (obj.x, obj.y, obj.width, obj.height, obj.id),
            (1.0, 2.0, 3.0, 4.0, 5)
        );
        assert_eq!(obj.name.as_deref(), Some("hero"));
        assert_eq!((obj.pivot_x, obj.pivot_y), (Some(6.0), Some(7.0)));
    }

    #[test]
    fn initializes_default_values() {
        let region = create_texture_atlas_region(None).read().unwrap().clone();
        assert_eq!(
            (region.x, region.y, region.width, region.height, region.id),
            (0.0, 0.0, 0.0, 0.0, -1)
        );
        assert!(
            region.name.is_none()
                && region.original_height.is_none()
                && region.original_width.is_none()
        );
        assert!(region.page_name.is_none() && region.pivot_x.is_none() && region.pivot_y.is_none());
        assert_eq!(region.rotation, TextureAtlasRotation::None);
        assert_eq!(
            (region.source_x, region.source_y, region.trimmed),
            (0.0, 0.0, false)
        );
    }

    #[test]
    fn initializes_trim_and_rotation_fields() {
        let trimmed = region(TextureAtlasRegionOptions {
            trimmed: Some(true),
            rotation: Some(TextureAtlasRotation::Clockwise90),
            source_x: Some(4.0),
            source_y: Some(8.0),
            original_width: Some(64.0),
            original_height: Some(32.0),
            page_name: Some("page2.png".to_string()),
            ..region_options()
        });
        assert!(trimmed.trimmed);
        assert_eq!(trimmed.rotation, TextureAtlasRotation::Clockwise90);
        assert_eq!((trimmed.source_x, trimmed.source_y), (4.0, 8.0));
        assert_eq!(
            (trimmed.original_width, trimmed.original_height),
            (Some(64.0), Some(32.0))
        );
        assert_eq!(trimmed.page_name.as_deref(), Some("page2.png"));
    }

    #[test]
    fn returns_a_distinct_region_each_call() {
        let options = region_options();
        assert!(!Arc::ptr_eq(
            &create_texture_atlas_region(Some(&options)),
            &create_texture_atlas_region(Some(&options))
        ));
    }

    #[test]
    fn keeps_the_rotation_discriminants_of_the_source_enum() {
        assert_eq!(TextureAtlasRotation::Counterclockwise90 as i32, -1);
        assert_eq!(TextureAtlasRotation::None as i32, 0);
        assert_eq!(TextureAtlasRotation::Clockwise90 as i32, 1);
    }
}

mod explain_texture_atlas_region_texture {
    use super::*;

    #[test]
    fn reports_missing_inputs_unsupported_page_rotation_and_readiness() {
        let mut atlas = create_texture_atlas(None);
        assert_eq!(
            explain_texture_atlas_region_texture(&atlas, 0).status,
            TextureAtlasRegionTextureStatus::MissingRegion
        );
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert_eq!(
            explain_texture_atlas_region_texture(&atlas, 0).status,
            TextureAtlasRegionTextureStatus::MissingTexture
        );
        let mut rotated = common();
        rotated.uv_rotation = Some(0.25);
        atlas.texture = Some(image_page(100, 50, rotated));
        assert_eq!(
            explain_texture_atlas_region_texture(&atlas, 0).status,
            TextureAtlasRegionTextureStatus::RotatedPage
        );
        atlas
            .texture
            .as_ref()
            .unwrap()
            .write()
            .unwrap()
            .texture_fields_mut()
            .uv_rotation = 0.0;
        assert_eq!(
            explain_texture_atlas_region_texture(&atlas, 0).status,
            TextureAtlasRegionTextureStatus::Ready
        );
    }
}

mod get_texture_atlas_region_by_id {
    use super::*;

    #[test]
    fn returns_null_for_an_empty_atlas_or_an_unknown_id() {
        let mut atlas = create_texture_atlas(None);
        assert!(get_texture_atlas_region_by_id(&atlas, 0).is_none());
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert!(get_texture_atlas_region_by_id(&atlas, 99).is_none());
    }

    #[test]
    fn returns_the_atlas_region_with_the_matching_id() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        add_texture_atlas_region(&mut atlas, 10.0, 0.0, 10.0, 10.0, None, None, None);
        let region = get_texture_atlas_region_by_id(&atlas, 1).unwrap();
        assert!(Arc::ptr_eq(&region, &atlas.regions[1]));
        assert_eq!(
            (region.read().unwrap().x, region.read().unwrap().id),
            (10.0, 1)
        );
    }
}

mod get_texture_atlas_region_by_name {
    use super::*;

    #[test]
    fn returns_null_for_an_empty_atlas_a_missing_name_or_an_unnamed_region() {
        let mut atlas = create_texture_atlas(None);
        assert!(get_texture_atlas_region_by_name(&atlas, "hero").is_none());
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert!(get_texture_atlas_region_by_name(&atlas, "").is_none());
        named(&mut atlas, 0.0, "hero");
        assert!(get_texture_atlas_region_by_name(&atlas, "villain").is_none());
    }

    #[test]
    fn returns_the_region_with_the_matching_name() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "hero_idle_0");
        named(&mut atlas, 10.0, "hero_walk_0");
        let region = get_texture_atlas_region_by_name(&atlas, "hero_walk_0").unwrap();
        assert_eq!(region.read().unwrap().x, 10.0);
    }

    #[test]
    fn is_case_sensitive() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "Hero");
        assert!(get_texture_atlas_region_by_name(&atlas, "hero").is_none());
        assert!(get_texture_atlas_region_by_name(&atlas, "Hero").is_some());
    }
}

mod get_texture_atlas_region_by_ordinal {
    use super::*;

    #[test]
    fn returns_the_region_carrying_that_frame_number() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "walk_01");
        named(&mut atlas, 10.0, "walk_02");
        assert_eq!(
            get_texture_atlas_region_by_ordinal(&atlas, "walk", 2.0)
                .unwrap()
                .read()
                .unwrap()
                .name
                .as_deref(),
            Some("walk_02")
        );
    }

    #[test]
    fn matches_the_ordinal_as_a_number_so_zero_padding_does_not_matter() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "walk_0007");
        assert!(get_texture_atlas_region_by_ordinal(&atlas, "walk", 7.0).is_some());
    }

    #[test]
    fn returns_null_for_a_missing_ordinal_or_a_different_prefix() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "walk_01");
        named(&mut atlas, 10.0, "idle_01");
        assert!(get_texture_atlas_region_by_ordinal(&atlas, "walk", 9.0).is_none());
        assert!(get_texture_atlas_region_by_ordinal(&atlas, "run", 1.0).is_none());
    }

    #[test]
    fn skips_unnamed_regions_rather_than_reading_an_ordinal_off_them() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert!(get_texture_atlas_region_by_ordinal(&atlas, "", -1.0).is_none());
    }

    #[test]
    fn reaches_a_longer_stem_sharing_the_prefix() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "walkFast_7");
        assert!(get_texture_atlas_region_by_ordinal(&atlas, "walk", 7.0).is_some());
    }
}

mod get_texture_atlas_region_count {
    use super::*;

    #[test]
    fn counts_the_regions() {
        let mut atlas = create_texture_atlas(None);
        assert_eq!(get_texture_atlas_region_count(&atlas), 0);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 1.0, 1.0, None, None, None);
        assert_eq!(get_texture_atlas_region_count(&atlas), 1);
    }
}

mod get_texture_atlas_region_frame {
    use super::*;

    fn frame(region: &TextureAtlasRegion) -> (f32, f32, f32, f32) {
        let mut out = rect();
        get_texture_atlas_region_frame(&mut out, region);
        return (out.x, out.y, out.width, out.height);
    }

    #[test]
    fn reports_the_trim_offset_and_the_original_extent_for_a_trimmed_region() {
        let trimmed = region(TextureAtlasRegionOptions {
            height: Some(20.0),
            original_height: Some(64.0),
            original_width: Some(64.0),
            source_x: Some(8.0),
            source_y: Some(12.0),
            trimmed: Some(true),
            width: Some(30.0),
            x: Some(100.0),
            y: Some(200.0),
            ..region_options()
        });
        assert_eq!(frame(&trimmed), (8.0, 12.0, 64.0, 64.0));
    }

    #[test]
    fn falls_back_to_the_packed_extent_for_an_untrimmed_region() {
        let packed = region(TextureAtlasRegionOptions {
            height: Some(20.0),
            width: Some(30.0),
            x: Some(100.0),
            y: Some(200.0),
            ..region_options()
        });
        assert_eq!(frame(&packed), (0.0, 0.0, 30.0, 20.0));
    }

    #[test]
    fn falls_back_to_the_upright_logical_extent_for_an_untrimmed_rotated_region() {
        for rotation in [
            TextureAtlasRotation::Clockwise90,
            TextureAtlasRotation::Counterclockwise90,
        ] {
            let rotated = region(TextureAtlasRegionOptions {
                height: Some(20.0),
                rotation: Some(rotation),
                width: Some(30.0),
                ..region_options()
            });
            assert_eq!(frame(&rotated), (0.0, 0.0, 20.0, 30.0));
        }
    }

    #[test]
    fn falls_back_per_axis_when_only_one_original_size_is_recorded() {
        let partial = region(TextureAtlasRegionOptions {
            height: Some(20.0),
            original_width: Some(50.0),
            width: Some(30.0),
            ..region_options()
        });
        assert_eq!(frame(&partial), (0.0, 0.0, 50.0, 20.0));
    }
}

mod get_texture_atlas_region_ordinal {
    use super::*;

    fn ordinal(name: Option<&str>) -> f64 {
        return get_texture_atlas_region_ordinal(&region(TextureAtlasRegionOptions {
            name: name.map(str::to_string),
            ..region_options()
        }));
    }

    #[test]
    fn reads_the_trailing_frame_number_ignoring_leading_zeros() {
        assert_eq!(ordinal(Some("walk_12")), 12.0);
        assert_eq!(ordinal(Some("walk_007")), 7.0);
        assert_eq!(ordinal(Some("walk12")), 12.0);
        assert_eq!(ordinal(Some("10")), 10.0);
    }

    #[test]
    fn returns_minus_one_without_trailing_digits() {
        assert_eq!(ordinal(Some("walk_10a")), -1.0);
        assert_eq!(ordinal(Some("walk")), -1.0);
        assert_eq!(ordinal(Some("")), -1.0);
        assert_eq!(ordinal(None), -1.0);
    }

    #[test]
    fn reads_digits_after_a_multi_byte_character() {
        assert_eq!(ordinal(Some("走_3")), 3.0);
    }
}

mod get_texture_atlas_region_sequence {
    use super::*;

    fn sequence(atlas: &TextureAtlas, prefix: &str) -> Vec<String> {
        let mut out = Vec::new();
        get_texture_atlas_region_sequence(&mut out, atlas, prefix);
        return names(&out);
    }

    fn atlas_named(list: &[&str]) -> TextureAtlas {
        let mut atlas = create_texture_atlas(None);
        for (i, name) in list.iter().enumerate() {
            named(&mut atlas, i as f32, name);
        }
        return atlas;
    }

    #[test]
    fn leaves_out_empty_when_the_atlas_has_no_regions_or_no_match() {
        assert!(sequence(&create_texture_atlas(None), "walk").is_empty());
        assert!(sequence(&atlas_named(&["idle_01"]), "walk").is_empty());
    }

    #[test]
    fn collects_regions_whose_names_start_with_the_prefix_and_skips_unnamed() {
        let mut atlas = atlas_named(&["walk_01", "walk_02", "idle_01"]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert_eq!(sequence(&atlas, "walk"), vec!["walk_01", "walk_02"]);
    }

    #[test]
    fn orders_by_frame_number_rather_than_insertion_order() {
        assert_eq!(
            sequence(&atlas_named(&["run_03", "run_01", "run_02"]), "run"),
            vec!["run_01", "run_02", "run_03"]
        );
    }

    #[test]
    fn orders_unpadded_frame_numbers_numerically_not_as_text() {
        let atlas = atlas_named(&["walk_1", "walk_10", "walk_2", "walk_11"]);
        assert_eq!(
            sequence(&atlas, "walk"),
            vec!["walk_1", "walk_2", "walk_10", "walk_11"]
        );
    }

    #[test]
    fn sorts_a_region_with_no_frame_number_after_the_numbered_run() {
        assert_eq!(
            sequence(&atlas_named(&["run", "run_02", "run_01"]), "run"),
            vec!["run_01", "run_02", "run"]
        );
    }

    #[test]
    fn keeps_insertion_order_among_shared_ordinals_and_unnumbered_regions() {
        let shared = atlas_named(&["runFast_01", "runSlow_01", "run_00"]);
        assert_eq!(
            sequence(&shared, "run"),
            vec!["run_00", "runFast_01", "runSlow_01"]
        );
        assert_eq!(
            sequence(&atlas_named(&["runB", "runA"]), "run"),
            vec!["runB", "runA"]
        );
    }

    #[test]
    fn resets_out_so_one_vector_can_be_reused_across_calls() {
        let atlas = atlas_named(&["walk_01", "idle_01"]);
        let mut out = Vec::new();
        get_texture_atlas_region_sequence(&mut out, &atlas, "walk");
        assert_eq!(names(&out), vec!["walk_01"]);
        get_texture_atlas_region_sequence(&mut out, &atlas, "idle");
        assert_eq!(names(&out), vec!["idle_01"]);
        assert!(Arc::ptr_eq(&out[0], &atlas.regions[1]));
    }
}

mod get_texture_atlas_region_texture {
    use super::*;

    #[test]
    fn returns_one_cached_texture_per_distinct_region_over_the_shared_atlas_image() {
        let source = image(100, 50);
        let mut atlas = atlas_over(page(Some(source.clone() as TextureSourceRef), common()));
        add_texture_atlas_region(&mut atlas, 10.0, 5.0, 20.0, 15.0, None, None, None);
        add_texture_atlas_region(&mut atlas, 30.0, 5.0, 20.0, 15.0, None, None, None);
        let first = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        let again = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        let second = get_texture_atlas_region_texture(&atlas, 1, None).unwrap();
        assert!(Arc::ptr_eq(&first, &again));
        assert!(!Arc::ptr_eq(&second, &first));
        let shared = get_texture_source(&*first.read().unwrap()).unwrap();
        assert_eq!(
            Arc::as_ptr(&shared) as *const (),
            Arc::as_ptr(&source) as *const ()
        );
        let fields = first.read().unwrap().texture_fields().clone();
        assert!(close(fields.uv_offset.x, 0.1) && close(fields.uv_offset.y, 0.1));
        assert!(close(fields.uv_scale.x, 0.2) && close(fields.uv_scale.y, 0.3));
    }

    #[test]
    fn re_derives_the_window_on_every_call_so_an_in_place_region_edit_is_picked_up() {
        let mut atlas = atlas_over(image_page(100, 50, common()));
        add_texture_atlas_region(&mut atlas, 10.0, 5.0, 20.0, 15.0, None, None, None);
        let before = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        assert!(close(
            before.read().unwrap().texture_fields().uv_offset.x,
            0.1
        ));
        let edit = TextureAtlasRegionOptions {
            height: Some(25.0),
            id: Some(0),
            width: Some(40.0),
            x: Some(50.0),
            y: Some(25.0),
            ..region_options()
        };
        set_texture_atlas_region(
            &mut get_texture_atlas_region_by_id(&atlas, 0)
                .unwrap()
                .write()
                .unwrap(),
            &edit,
        );
        let after = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        assert!(Arc::ptr_eq(&after, &before));
        let fields = after.read().unwrap().texture_fields().clone();
        assert!(close(fields.uv_offset.x, 0.5) && close(fields.uv_offset.y, 0.5));
        assert!(close(fields.uv_scale.x, 0.4) && close(fields.uv_scale.y, 0.5));
    }

    #[test]
    fn rewrites_a_previously_returned_reference_rather_than_minting_a_second_view() {
        let mut atlas = atlas_over(image_page(100, 50, common()));
        add_texture_atlas_region(&mut atlas, 10.0, 5.0, 20.0, 15.0, None, None, None);
        let held = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        let edit = TextureAtlasRegionOptions {
            height: Some(25.0),
            id: Some(0),
            width: Some(40.0),
            x: Some(50.0),
            y: Some(25.0),
            ..region_options()
        };
        set_texture_atlas_region(&mut atlas.regions[0].write().unwrap(), &edit);
        get_texture_atlas_region_texture(&atlas, 0, None);
        let fields = held.read().unwrap().texture_fields().clone();
        assert!(close(fields.uv_offset.x, 0.5) && close(fields.uv_offset.y, 0.5));
    }

    #[test]
    fn picks_up_a_page_whose_window_moved_and_copies_page_sampling() {
        let mut atlas = atlas_over(image_page(100, 50, common()));
        add_texture_atlas_region(&mut atlas, 10.0, 5.0, 20.0, 15.0, None, None, None);
        let texture = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        {
            let mut page = atlas.texture.as_ref().unwrap().write().unwrap();
            page.texture_fields_mut().uv_offset.x = 0.5;
            page.texture_fields_mut().sampler.anisotropy = 8.0;
        }
        get_texture_atlas_region_texture(&atlas, 0, None);
        let fields = texture.read().unwrap().texture_fields().clone();
        assert!(close(fields.uv_offset.x, 0.6));
        assert_eq!(fields.sampler.anisotropy, 8.0);
    }

    #[test]
    fn returns_null_without_an_image_or_matching_region() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert!(get_texture_atlas_region_texture(&atlas, 0, None).is_none());
        atlas.texture = Some(image_page(10, 10, common()));
        assert!(get_texture_atlas_region_texture(&atlas, 99, None).is_none());
    }

    #[test]
    fn composes_a_region_in_pixel_space_against_a_windowed_page() {
        let mut window = common();
        window.uv_offset = Some(create_vector2(0.25, 0.1));
        window.uv_scale = Some(create_vector2(0.5, 0.8));
        let mut atlas = atlas_over(image_page(200, 100, window));
        add_texture_atlas_region(&mut atlas, 10.0, 5.0, 20.0, 15.0, None, None, None);
        let texture = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        let fields = texture.read().unwrap().texture_fields().clone();
        assert!(close(fields.uv_offset.x, 0.3) && close(fields.uv_offset.y, 0.15));
        assert!(close(fields.uv_scale.x, 0.1) && close(fields.uv_scale.y, 0.15));
    }

    #[test]
    fn folds_page_flips_and_packed_region_rotation_into_the_minted_view() {
        let mut flipped = common();
        flipped.flip_x = Some(true);
        flipped.flip_y = Some(true);
        let mut atlas = atlas_over(image_page(100, 50, flipped));
        atlas.regions.push(create_texture_atlas_region(Some(
            &TextureAtlasRegionOptions {
                height: Some(15.0),
                id: Some(0),
                rotation: Some(TextureAtlasRotation::Clockwise90),
                width: Some(20.0),
                x: Some(10.0),
                y: Some(5.0),
                ..region_options()
            },
        )));
        let texture = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        let guard = texture.read().unwrap();
        let mut top_left = create_vector2(0.0, 0.0);
        let mut bottom_right = create_vector2(0.0, 0.0);
        transform_texture_uv(&mut top_left, &*guard, 0.0, 0.0);
        transform_texture_uv(&mut bottom_right, &*guard, 1.0, 1.0);
        assert!(guard.texture_fields().flip_x && guard.texture_fields().flip_y);
        assert!(close(
            guard.texture_fields().uv_rotation,
            std::f32::consts::PI / 2.0
        ));
        assert!(close(top_left.x, 0.7) && close(top_left.y, 0.9));
        assert!(close(bottom_right.x, 0.9) && close(bottom_right.y, 0.6));
    }

    #[test]
    fn places_a_counterclockwise_packed_region_from_its_bottom_left() {
        let mut atlas = atlas_over(image_page(100, 50, common()));
        atlas.regions.push(create_texture_atlas_region(Some(
            &TextureAtlasRegionOptions {
                height: Some(15.0),
                id: Some(0),
                rotation: Some(TextureAtlasRotation::Counterclockwise90),
                width: Some(20.0),
                x: Some(10.0),
                y: Some(5.0),
                ..region_options()
            },
        )));
        let texture = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        let fields = texture.read().unwrap().texture_fields().clone();
        assert!(close(fields.uv_offset.x, 0.1) && close(fields.uv_offset.y, 0.4));
        assert!(close(fields.uv_rotation, -std::f32::consts::PI / 2.0));
        assert!(close(fields.uv_scale.x, 0.3) && close(fields.uv_scale.y, 0.2));
    }

    #[test]
    fn zeroes_the_window_for_a_page_without_measured_size() {
        let mut atlas = atlas_over(image_page(0, 0, common()));
        add_texture_atlas_region(&mut atlas, 10.0, 5.0, 20.0, 15.0, None, None, None);
        let texture = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        let fields = texture.read().unwrap().texture_fields().clone();
        assert_eq!(
            (fields.uv_offset.x, fields.uv_scale.x, fields.uv_rotation),
            (0.0, 0.0, 0.0)
        );
        assert!(!fields.flip_x && !fields.flip_y);
    }

    #[test]
    fn refuses_a_rotated_page() {
        let mut rotated = common();
        rotated.uv_rotation = Some(0.25);
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        atlas.texture = Some(image_page(100, 50, rotated));
        assert!(get_texture_atlas_region_texture(&atlas, 0, None).is_none());
        atlas
            .texture
            .as_ref()
            .unwrap()
            .write()
            .unwrap()
            .texture_fields_mut()
            .uv_rotation = 0.0;
        assert!(get_texture_atlas_region_texture(&atlas, 0, None).is_some());
    }

    #[test]
    fn mints_a_fresh_view_for_a_region_that_replaced_a_dropped_one() {
        let mut atlas = atlas_over(image_page(100, 50, common()));
        add_texture_atlas_region(&mut atlas, 10.0, 5.0, 20.0, 15.0, None, None, None);
        let first = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        atlas.regions[0] = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
            id: Some(0),
            width: Some(10.0),
            height: Some(10.0),
            ..region_options()
        }));
        let second = get_texture_atlas_region_texture(&atlas, 0, None).unwrap();
        assert!(!Arc::ptr_eq(&first, &second));
    }
}

mod get_texture_atlas_region_texture_status_string {
    use super::*;

    #[test]
    fn round_trips_every_status() {
        for (value, text) in [
            (
                TextureAtlasRegionTextureStatus::MissingRegion,
                "missing-region",
            ),
            (
                TextureAtlasRegionTextureStatus::MissingTexture,
                "missing-texture",
            ),
            (TextureAtlasRegionTextureStatus::Ready, "ready"),
            (TextureAtlasRegionTextureStatus::RotatedPage, "rotated-page"),
        ] {
            assert_eq!(get_texture_atlas_region_texture_status_string(value), text);
            assert_eq!(parse_texture_atlas_region_texture_status(text), Some(value));
        }
    }
}

mod get_texture_atlas_region_uv {
    use super::*;

    fn uv(region: &TextureAtlasRegion, width: f32, height: f32) -> (f32, f32, f32, f32) {
        let mut out = create_rectangle(1.0, 1.0, 1.0, 1.0);
        get_texture_atlas_region_uv(&mut out, region, width, height);
        return (out.x, out.y, out.width, out.height);
    }

    fn sized(x: f32, y: f32, width: f32, height: f32) -> TextureAtlasRegion {
        return region(TextureAtlasRegionOptions {
            x: Some(x),
            y: Some(y),
            width: Some(width),
            height: Some(height),
            ..region_options()
        });
    }

    #[test]
    fn returns_a_zero_rect_when_an_image_dimension_is_zero() {
        assert_eq!(
            uv(&sized(10.0, 20.0, 30.0, 40.0), 0.0, 100.0),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(
            uv(&sized(10.0, 20.0, 30.0, 40.0), 100.0, 0.0),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(
            uv(&sized(10.0, 20.0, 30.0, 40.0), -1.0, 100.0),
            (0.0, 0.0, 0.0, 0.0)
        );
    }

    #[test]
    fn computes_normalized_uv_coordinates() {
        assert_eq!(
            uv(&sized(0.0, 0.0, 128.0, 64.0), 256.0, 256.0),
            (0.0, 0.0, 0.5, 0.25)
        );
        assert_eq!(
            uv(&sized(128.0, 64.0, 64.0, 64.0), 256.0, 256.0),
            (0.5, 0.25, 0.25, 0.25)
        );
    }

    #[test]
    fn covers_the_packed_rect_of_a_rotated_region_unchanged() {
        let mut rotated = sized(0.0, 0.0, 50.0, 25.0);
        rotated.rotation = TextureAtlasRotation::Clockwise90;
        assert_eq!(uv(&rotated, 100.0, 100.0), (0.0, 0.0, 0.5, 0.25));
    }
}

mod get_texture_atlas_region_uv_quad {
    use super::*;

    fn quad(rotation: TextureAtlasRotation, x: f32, y: f32, width: f32, height: f32) -> Vec<f32> {
        let region = region(TextureAtlasRegionOptions {
            height: Some(height),
            rotation: Some(rotation),
            width: Some(width),
            x: Some(x),
            y: Some(y),
            ..region_options()
        });
        let mut out = Vec::new();
        get_texture_atlas_region_uv_quad(&mut out, &region, 100.0, 100.0);
        return out;
    }

    #[test]
    fn walks_an_unrotated_region_top_left_top_right_bottom_right_bottom_left() {
        assert_eq!(
            quad(TextureAtlasRotation::None, 0.0, 0.0, 50.0, 25.0),
            vec![0.0, 0.0, 0.5, 0.0, 0.5, 0.25, 0.0, 0.25]
        );
    }

    #[test]
    fn undoes_a_clockwise_packed_quarter_turn() {
        assert_eq!(
            quad(TextureAtlasRotation::Clockwise90, 0.0, 0.0, 50.0, 25.0),
            vec![0.5, 0.0, 0.5, 0.25, 0.0, 0.25, 0.0, 0.0]
        );
    }

    #[test]
    fn preserves_the_opposite_libgdx_packed_quarter_turn_explicitly() {
        assert_eq!(
            quad(
                TextureAtlasRotation::Counterclockwise90,
                0.0,
                0.0,
                50.0,
                25.0
            ),
            vec![0.0, 0.25, 0.0, 0.0, 0.5, 0.0, 0.5, 0.25]
        );
    }

    #[test]
    fn covers_the_same_four_corners_either_way_only_in_a_different_order() {
        let pairs = |values: Vec<f32>| {
            let mut pairs: Vec<String> = values
                .chunks(2)
                .map(|pair| format!("{},{}", pair[0], pair[1]))
                .collect();
            pairs.sort();
            pairs
        };
        let upright = pairs(quad(TextureAtlasRotation::None, 10.0, 20.0, 50.0, 25.0));
        assert_eq!(
            pairs(quad(
                TextureAtlasRotation::Clockwise90,
                10.0,
                20.0,
                50.0,
                25.0
            )),
            upright
        );
        assert_eq!(
            pairs(quad(
                TextureAtlasRotation::Counterclockwise90,
                10.0,
                20.0,
                50.0,
                25.0
            )),
            upright
        );
    }

    #[test]
    fn writes_eight_zeros_for_a_zero_sized_image_resizing_out() {
        let packed = region(TextureAtlasRegionOptions {
            height: Some(25.0),
            width: Some(50.0),
            ..region_options()
        });
        let mut out = vec![1.0, 2.0, 3.0];
        get_texture_atlas_region_uv_quad(&mut out, &packed, 0.0, 100.0);
        assert_eq!(out, vec![0.0; 8]);
        let mut long = vec![9.0; 12];
        get_texture_atlas_region_uv_quad(&mut long, &packed, 100.0, 100.0);
        assert_eq!(long.len(), 8);
    }

    #[test]
    fn agrees_with_get_texture_atlas_region_uv_on_the_unrotated_packed_rect() {
        let packed = region(TextureAtlasRegionOptions {
            height: Some(25.0),
            width: Some(50.0),
            x: Some(10.0),
            y: Some(20.0),
            ..region_options()
        });
        let mut uv = rect();
        get_texture_atlas_region_uv(&mut uv, &packed, 100.0, 100.0);
        let mut quad = Vec::new();
        get_texture_atlas_region_uv_quad(&mut quad, &packed, 100.0, 100.0);
        assert!(close(quad[0], uv.x) && close(quad[1], uv.y));
        assert!(close(quad[4], uv.x + uv.width) && close(quad[5], uv.y + uv.height));
    }
}

mod has_texture_atlas_region {
    use super::*;

    #[test]
    fn is_true_for_a_present_name_and_false_otherwise_case_sensitively() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "Hero");
        assert!(has_texture_atlas_region(&atlas, "Hero"));
        assert!(!has_texture_atlas_region(&atlas, "hero"));
        assert!(!has_texture_atlas_region(&atlas, "missing"));
    }
}

mod initialize_texture_atlas_region {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_texture_atlas_region() {
        let shared = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
            name: Some("old".to_string()),
            trimmed: Some(true),
            ..region_options()
        }));
        initialize_texture_atlas_region(&mut shared.write().unwrap(), None);
        let region = shared.read().unwrap().clone();
        assert!(region.name.is_none() && !region.trimmed && region.id == -1);
    }
}

mod parse_texture_atlas_region_texture_status {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_texture_atlas_region_texture_status("Ready"), None);
        assert_eq!(parse_texture_atlas_region_texture_status(""), None);
    }
}

mod remove_texture_atlas_region {
    use super::*;

    #[test]
    fn removes_the_region_and_reports_it() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "a");
        let id = get_texture_atlas_region_by_name(&atlas, "a")
            .unwrap()
            .read()
            .unwrap()
            .id;
        assert!(remove_texture_atlas_region(&mut atlas, id));
        assert!(get_texture_atlas_region_by_id(&atlas, id).is_none());
        assert_eq!(get_texture_atlas_region_count(&atlas), 0);
    }

    #[test]
    fn reports_false_for_an_id_no_region_holds() {
        assert!(!remove_texture_atlas_region(
            &mut create_texture_atlas(None),
            99
        ));
    }

    #[test]
    fn leaves_the_remaining_regions_findable_by_their_original_ids() {
        let mut atlas = create_texture_atlas(None);
        named(&mut atlas, 0.0, "a");
        named(&mut atlas, 1.0, "b");
        named(&mut atlas, 2.0, "c");
        let id_c = get_texture_atlas_region_by_name(&atlas, "c")
            .unwrap()
            .read()
            .unwrap()
            .id;
        let id_a = get_texture_atlas_region_by_name(&atlas, "a")
            .unwrap()
            .read()
            .unwrap()
            .id;
        remove_texture_atlas_region(&mut atlas, id_a);
        assert_eq!(
            get_texture_atlas_region_by_id(&atlas, id_c)
                .unwrap()
                .read()
                .unwrap()
                .name
                .as_deref(),
            Some("c")
        );
    }

    #[test]
    fn removes_only_the_first_region_holding_a_duplicated_id() {
        let make = |name: &str| {
            create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
                id: Some(3),
                name: Some(name.to_string()),
                ..region_options()
            }))
        };
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            regions: Some(vec![make("first"), make("second")]),
            ..atlas_options()
        }));
        assert!(remove_texture_atlas_region(&mut atlas, 3));
        assert_eq!(names(&atlas.regions), vec!["second"]);
    }
}

mod set_texture_atlas_region {
    use super::*;

    fn full() -> TextureAtlasRegionOptions {
        return TextureAtlasRegionOptions {
            height: Some(40.0),
            id: Some(7),
            name: Some("hero".to_string()),
            original_height: Some(200.0),
            original_width: Some(100.0),
            page_name: Some("page.png".to_string()),
            pivot_x: Some(0.5),
            pivot_y: Some(0.5),
            rotation: Some(TextureAtlasRotation::Counterclockwise90),
            source_x: Some(5.0),
            source_y: Some(6.0),
            trimmed: Some(true),
            width: Some(30.0),
            x: Some(10.0),
            y: Some(20.0),
        };
    }

    fn rect_options(x: f32, y: f32, width: f32, height: f32) -> TextureAtlasRegionOptions {
        return TextureAtlasRegionOptions {
            height: Some(height),
            width: Some(width),
            x: Some(x),
            y: Some(y),
            ..region_options()
        };
    }

    #[test]
    fn overwrites_every_field_leaving_nothing_from_the_region_it_previously_described() {
        let mut region = region(full());
        set_texture_atlas_region(&mut region, &rect_options(1.0, 2.0, 3.0, 4.0));
        assert_eq!(
            (region.x, region.y, region.width, region.height),
            (1.0, 2.0, 3.0, 4.0)
        );
        assert_eq!(region.id, -1);
        assert!(region.name.is_none() && region.page_name.is_none());
        assert_eq!(region.rotation, TextureAtlasRotation::None);
        assert!(!region.trimmed);
        assert_eq!((region.source_x, region.source_y), (0.0, 0.0));
        assert!(region.original_width.is_none() && region.original_height.is_none());
        assert!(region.pivot_x.is_none() && region.pivot_y.is_none());
    }

    #[test]
    fn lands_exactly_where_create_texture_atlas_region_would_for_the_same_source() {
        let source = TextureAtlasRegionOptions {
            name: Some("frame".to_string()),
            rotation: Some(TextureAtlasRotation::Clockwise90),
            source_x: Some(3.0),
            trimmed: Some(true),
            height: Some(4.0),
            width: Some(3.0),
            x: Some(1.0),
            y: Some(2.0),
            ..region_options()
        };
        let built = region(source.clone());
        let mut set = region(TextureAtlasRegionOptions {
            name: Some("stale".to_string()),
            width: Some(99.0),
            x: Some(99.0),
            ..region_options()
        });
        set_texture_atlas_region(&mut set, &source);
        assert_eq!(set, built);
    }

    #[test]
    fn carries_an_explicit_pivot_through_and_round_trips_an_unset_one_as_null() {
        let mut region = region(region_options());
        let mut options = rect_options(10.0, 20.0, 30.0, 40.0);
        options.pivot_x = Some(5.0);
        options.pivot_y = Some(6.0);
        set_texture_atlas_region(&mut region, &options);
        assert_eq!((region.pivot_x, region.pivot_y), (Some(5.0), Some(6.0)));
        set_texture_atlas_region(&mut region, &rect_options(0.0, 0.0, 1.0, 1.0));
        assert!(region.pivot_x.is_none() && region.pivot_y.is_none());
    }

    #[test]
    fn reuses_the_existing_shared_region_rather_than_replacing_it() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 1.0, 1.0, None, None, None);
        let shared = atlas.regions[0].clone();
        set_texture_atlas_region(
            &mut shared.write().unwrap(),
            &rect_options(10.0, 20.0, 30.0, 40.0),
        );
        assert!(Arc::ptr_eq(&shared, &atlas.regions[0]));
        assert_eq!(atlas.regions[0].read().unwrap().width, 30.0);
    }

    #[test]
    fn rewriting_a_region_from_its_own_fields_keeps_them() {
        // The source also passes the region as its own source; Rust borrows cannot alias the two, so
        // the region's fields are read into the options first, exactly what the alias-safe source does.
        let mut region = region(TextureAtlasRegionOptions {
            height: Some(40.0),
            name: Some("keep".to_string()),
            rotation: Some(TextureAtlasRotation::Clockwise90),
            source_x: Some(7.0),
            width: Some(30.0),
            x: Some(10.0),
            y: Some(20.0),
            ..region_options()
        });
        let own = TextureAtlasRegionOptions {
            height: Some(region.height),
            id: Some(region.id),
            name: region.name.clone(),
            original_height: region.original_height,
            original_width: region.original_width,
            page_name: region.page_name.clone(),
            pivot_x: region.pivot_x,
            pivot_y: region.pivot_y,
            rotation: Some(region.rotation),
            source_x: Some(region.source_x),
            source_y: Some(region.source_y),
            trimmed: Some(region.trimmed),
            width: Some(region.width),
            x: Some(region.x),
            y: Some(region.y),
        };
        let before = region.clone();
        set_texture_atlas_region(&mut region, &own);
        assert_eq!(region, before);
    }
}

mod set_texture_atlas_region_texture_guard {
    use super::*;

    #[test]
    fn installs_and_removes_the_null_result_diagnostics_hook() {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        let seen: Arc<Mutex<Vec<(usize, i32, TextureAtlasRegionTextureStatus)>>> =
            Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let make: fn() -> TextureAtlasGuardState = TextureAtlasGuardState::default;
        let mut state = make();
        set_texture_atlas_region_texture_guard(
            &mut state,
            Some(Arc::new(
                move |atlas: &TextureAtlas,
                      region_id,
                      explanation: &TextureAtlasRegionTextureExplanation| {
                    record.lock().unwrap().push((
                        atlas as *const TextureAtlas as usize,
                        region_id,
                        explanation.status,
                    ));
                },
            )),
        );
        assert!(get_texture_atlas_region_texture(&atlas, 0, Some(&state)).is_none());
        assert_eq!(
            *seen.lock().unwrap(),
            vec![(
                &atlas as *const TextureAtlas as usize,
                0,
                TextureAtlasRegionTextureStatus::MissingTexture
            )]
        );
        set_texture_atlas_region_texture_guard(&mut state, None);
        assert!(get_texture_atlas_region_texture(&atlas, 0, Some(&state)).is_none());
        assert_eq!(seen.lock().unwrap().len(), 1);
        assert!(!state.enabled);
    }

    #[test]
    fn is_not_consulted_when_minting_succeeds_or_without_state() {
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        let make: fn() -> TextureAtlasGuardState = TextureAtlasGuardState::default;
        let mut state = make();
        set_texture_atlas_region_texture_guard(
            &mut state,
            Some(Arc::new(
                move |_atlas: &TextureAtlas,
                      _id,
                      _explanation: &TextureAtlasRegionTextureExplanation| {
                    *count.lock().unwrap() += 1;
                },
            )),
        );
        let mut atlas = atlas_over(image_page(10, 10, common()));
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 5.0, 5.0, None, None, None);
        assert!(get_texture_atlas_region_texture(&atlas, 0, Some(&state)).is_some());
        assert!(get_texture_atlas_region_texture(&atlas, 9, None).is_none());
        assert_eq!(*calls.lock().unwrap(), 0);
    }
}
