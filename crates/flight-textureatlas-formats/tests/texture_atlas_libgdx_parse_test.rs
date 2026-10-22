use std::sync::Arc;

use flight_textureatlas::{TextureAtlasOptions, TextureAtlasRotation};
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

mod parse_texture_atlas_libgdx_atlas {
    use super::*;

    #[test]
    fn parses_multiple_pages_rotations_trims_offsets_and_indices_in_source_order() {
        let content = concat!(
            "pages/first.png\r\n",
            "size: 256, 128\r\n",
            "format: RGBA8888\r\n",
            "filter: Linear,Linear\r\n",
            "repeat: none\r\n",
            "hero\r\n",
            "  rotate: true\r\n",
            "  xy: 3, 4\r\n",
            "  size: 10, 20\r\n",
            "  orig: 30, 40\r\n",
            "  offset: 5, 6\r\n",
            "  index: 2\r\n",
            "\r\n",
            "second.png\r\n",
            "size: 64, 64\r\n",
            "filter: Nearest,Nearest\r\n",
            "spark\r\n",
            "  rotate: 270\r\n",
            "  xy: 7, 8\r\n",
            "  size: 9, 11\r\n",
            "  orig: 11, 9\r\n",
            "  offset: 0, 0\r\n",
            "  index: -1\r\n"
        );
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_height: Some(99.0),
            image_name: Some("stale.png".to_string()),
            image_width: Some(98.0),
            regions: None,
            scale: Some(4.0),
            texture: None,
        }));
        parse_texture_atlas_libgdx_atlas(&mut atlas, content);

        assert_eq!(atlas.image_name.as_deref(), Some("pages/first.png"));
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (0.0, 0.0, 1.0)
        );
        assert_eq!(atlas.regions.len(), 2);
        let first = atlas.regions[0].read().unwrap();
        assert_eq!((first.id, first.name.as_deref()), (0, Some("hero_2")));
        assert_eq!(first.page_name.as_deref(), Some("pages/first.png"));
        assert_eq!(
            (first.x, first.y, first.width, first.height),
            (3.0, 4.0, 10.0, 20.0)
        );
        assert_eq!((first.source_x, first.source_y), (5.0, 6.0));
        assert_eq!(
            (first.original_width, first.original_height),
            (Some(30.0), Some(40.0))
        );
        assert!(first.trimmed);
        assert_eq!(first.rotation, TextureAtlasRotation::Counterclockwise90);
        drop(first);
        let second = atlas.regions[1].read().unwrap();
        assert_eq!((second.id, second.name.as_deref()), (1, Some("spark")));
        assert_eq!(second.page_name.as_deref(), Some("second.png"));
        assert_eq!(second.rotation, TextureAtlasRotation::Clockwise90);
        assert!(!second.trimmed);
        assert_eq!(second.original_width, None);
        assert_eq!(second.original_height, None);
    }

    #[test]
    fn clears_existing_data_for_empty_content() {
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_height: Some(10.0),
            image_name: Some("old.png".to_string()),
            image_width: Some(20.0),
            regions: None,
            scale: Some(2.0),
            texture: None,
        }));
        parse_texture_atlas_libgdx_atlas(&mut atlas, "");
        assert_eq!(atlas.image_name, None);
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (0.0, 0.0, 1.0)
        );
        assert!(atlas.regions.is_empty());
    }
}
