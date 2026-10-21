use std::sync::Arc;

use flight_textureatlas::{
    TextureAtlasOptions, TextureAtlasRegionOptions, create_texture_atlas,
    create_texture_atlas_region,
};
use flight_textureatlas_formats::*;

mod read_texture_atlas_scale {
    use super::*;

    #[test]
    fn accepts_positive_finite_number_and_string_values() {
        assert_eq!(
            read_texture_atlas_scale(Some(&TextureAtlasScale::String(
                TextureAtlasScaleString {
                    value: "0.5".to_string(),
                },
            ))),
            0.5
        );
        assert_eq!(
            read_texture_atlas_scale(Some(&TextureAtlasScale::Number(
                TextureAtlasScaleNumber { value: 2.0 },
            ))),
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
            scale: Some(0.25),
            ..TextureAtlasOptions::default()
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
            id: Some(7),
            ..TextureAtlasRegionOptions::default()
        }));
        let regions = vec![region.clone()];
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            regions: Some(regions),
            ..TextureAtlasOptions::default()
        }));
        reset_texture_atlas_page_meta(&mut atlas);
        assert_eq!(atlas.regions.len(), 1);
        assert!(Arc::ptr_eq(&atlas.regions[0], &region));
        assert!(atlas.texture.is_none());
    }
}
