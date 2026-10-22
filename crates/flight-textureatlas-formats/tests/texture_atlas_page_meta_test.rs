use std::sync::Arc;

use flight_textureatlas::{
    TextureAtlasOptions, TextureAtlasRegionOptions, set_texture_atlas_region,
};
use flight_textureatlas_formats::*;

fn create_texture_atlas(obj: Option<TextureAtlasOptions>) -> flight_textureatlas::TextureAtlas {
    let atlas = flight_textureatlas::create_texture_atlas();
    if let Some(obj) = obj {
        let mut atlas = atlas.write().unwrap();
        atlas.image_height = obj.image_height.unwrap_or(0.0);
        atlas.image_name = obj.image_name;
        atlas.image_width = obj.image_width.unwrap_or(0.0);
        atlas.regions = obj.regions.unwrap_or_default();
        atlas.scale = obj.scale.unwrap_or(1.0);
        atlas.texture = obj.texture;
    }
    return Arc::try_unwrap(atlas).unwrap().into_inner().unwrap();
}

fn create_texture_atlas_region(
    obj: Option<&TextureAtlasRegionOptions>,
) -> flight_entity::Ref<flight_textureatlas::TextureAtlasRegion> {
    let region = flight_textureatlas::create_texture_atlas_region();
    if let Some(obj) = obj {
        set_texture_atlas_region(&mut region.write().unwrap(), obj);
    }
    return region;
}

mod read_texture_atlas_scale {
    use super::*;

    #[test]
    fn accepts_positive_finite_number_and_string_values() {
        assert_eq!(
            read_texture_atlas_scale(Some(&TextureAtlasScale::String(TextureAtlasScaleString {
                value: "0.5".to_string(),
            },))),
            0.5
        );
        assert_eq!(
            read_texture_atlas_scale(Some(&TextureAtlasScale::Number(TextureAtlasScaleNumber {
                value: 2.0
            },))),
            2.0
        );
    }

    #[test]
    fn falls_back_to_one_for_missing_invalid_and_non_positive_values() {
        assert_eq!(read_texture_atlas_scale(None), 1.0);
        for value in ["not-a-number", "0", "-1"] {
            assert_eq!(
                read_texture_atlas_scale(Some(&TextureAtlasScale::String(
                    TextureAtlasScaleString {
                        value: value.to_string(),
                    },
                ))),
                1.0
            );
        }
        for value in [0.0, -1.0, f32::NAN, f32::INFINITY] {
            assert_eq!(
                read_texture_atlas_scale(Some(&TextureAtlasScale::Number(
                    TextureAtlasScaleNumber { value },
                ))),
                1.0
            );
        }
    }
}

mod reset_texture_atlas_page_meta {
    use super::*;

    #[test]
    fn resets_every_page_meta_field_to_its_unknown_state() {
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_height: Some(64.0),
            image_name: Some("stale.png".to_string()),
            image_width: Some(128.0),
            regions: None,
            scale: Some(0.25),
            texture: None,
        }));
        reset_texture_atlas_page_meta(&mut atlas);
        assert_eq!(atlas.image_name, None);
        assert_eq!(atlas.image_width, 0.0);
        assert_eq!(atlas.image_height, 0.0);
        assert_eq!(atlas.scale, 1.0);
    }

    #[test]
    fn preserves_regions_and_the_page_texture_slot() {
        let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
            height: None,
            id: Some(7),
            name: None,
            original_height: None,
            original_width: None,
            page_name: None,
            pivot_x: None,
            pivot_y: None,
            rotation: None,
            source_x: None,
            source_y: None,
            trimmed: None,
            width: None,
            x: None,
            y: None,
        }));
        let regions = vec![region.clone()];
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_height: None,
            image_name: None,
            image_width: None,
            regions: Some(regions),
            scale: None,
            texture: None,
        }));
        reset_texture_atlas_page_meta(&mut atlas);
        assert_eq!(atlas.regions.len(), 1);
        assert!(Arc::ptr_eq(&atlas.regions[0], &region));
        assert!(atlas.texture.is_none());
    }
}
