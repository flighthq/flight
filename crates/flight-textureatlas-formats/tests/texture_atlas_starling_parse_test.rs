use std::sync::Arc;

use flight_textureatlas::{TextureAtlasOptions, TextureAtlasRotation};
use flight_textureatlas_formats::*;

fn create_texture_atlas(obj: Option<TextureAtlasOptions>) -> flight_textureatlas::TextureAtlas {
    return Arc::try_unwrap(flight_textureatlas::create_texture_atlas(obj))
        .unwrap()
        .into_inner()
        .unwrap();
}

mod parse_texture_atlas_starling_xml {
    use super::*;

    #[test]
    fn maps_subtextures_in_source_order_with_trim_rotation_and_pivots() {
        let xml = r#"
            <root>
              <TextureAtlas imagePath="sheet.png">
                <Ignored name="skip" />
                <SubTexture name="hero" x="1" y="2" width="10" height="20"
                    frameX="-3" frameY="-4" frameWidth="30" frameHeight="40"
                    rotated="true" pivotX="0.25" pivotY="0.75" />
                <SubTexture x="0" y="0" width="1" height="1" />
                <SubTexture name="fallback" x="5px" y="6" width="7" height="8"
                    frameX="-2" rotated="true" />
              </TextureAtlas>
            </root>
        "#;
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_height: Some(50.0),
            image_name: Some("stale.png".to_string()),
            image_width: Some(60.0),
            regions: None,
            scale: Some(2.0),
            texture: None,
        }));
        parse_texture_atlas_starling_xml(&mut atlas, xml);

        assert_eq!(atlas.image_name.as_deref(), Some("sheet.png"));
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (0.0, 0.0, 1.0)
        );
        assert_eq!(atlas.regions.len(), 2);
        let first = atlas.regions[0].read().unwrap();
        assert_eq!((first.id, first.name.as_deref()), (0, Some("hero")));
        assert_eq!(
            (first.x, first.y, first.width, first.height),
            (1.0, 2.0, 10.0, 20.0)
        );
        assert_eq!((first.source_x, first.source_y), (3.0, 4.0));
        assert_eq!(
            (first.original_width, first.original_height),
            (Some(30.0), Some(40.0))
        );
        assert_eq!((first.pivot_x, first.pivot_y), (Some(0.25), Some(0.75)));
        assert!(first.trimmed);
        assert_eq!(first.rotation, TextureAtlasRotation::Clockwise90);
        drop(first);
        let second = atlas.regions[1].read().unwrap();
        assert_eq!((second.id, second.name.as_deref()), (1, Some("fallback")));
        assert_eq!((second.x, second.y), (5.0, 6.0));
        assert_eq!(
            (second.original_width, second.original_height),
            (Some(8.0), Some(7.0))
        );
        assert_eq!((second.source_x, second.source_y), (2.0, 0.0));
    }

    #[test]
    fn clears_existing_data_before_rejecting_malformed_xml() {
        let mut atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_height: Some(10.0),
            image_name: Some("old.png".to_string()),
            image_width: Some(20.0),
            regions: None,
            scale: Some(3.0),
            texture: None,
        }));
        parse_texture_atlas_starling_xml(&mut atlas, "<TextureAtlas>");
        assert_eq!(atlas.image_name, None);
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (0.0, 0.0, 1.0)
        );
        assert!(atlas.regions.is_empty());
    }
}
