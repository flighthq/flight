use std::sync::Arc;

use flight_textureatlas::{
    TextureAtlasOptions, TextureAtlasRegionOptions, TextureAtlasRotation, create_texture_atlas,
    create_texture_atlas_region,
};
use flight_textureatlas_formats::*;

fn texture_packer_meta() -> TexturePackerAtlasMeta {
    return TexturePackerAtlasMeta {
        app: "https://www.codeandweb.com/texturepacker".to_string(),
        format: "RGBA8888".to_string(),
        frame_tags: None,
        image: "packed.png".to_string(),
        scale: TextureAtlasScale::Number(TextureAtlasScaleNumber { value: 0.25 }),
        size: TexturePackerAtlasSize { h: 64.0, w: 128.0 },
        version: "7.0".to_string(),
    };
}

fn stale_atlas() -> flight_textureatlas::TextureAtlas {
    let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        height: None,
        id: Some(42),
        name: Some("stale".to_string()),
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
    return create_texture_atlas(Some(TextureAtlasOptions {
        image_height: Some(11.0),
        image_name: Some("old.png".to_string()),
        image_width: Some(12.0),
        regions: Some(vec![region]),
        scale: Some(3.0),
        texture: None,
    }));
}

mod parse_texture_packer_atlas_document {
    use super::*;

    #[test]
    fn maps_array_frames_and_optional_pivots() {
        let doc = TexturePackerAtlasDocument::Array(TexturePackerAtlasArrayDocumentValue {
            value: TexturePackerAtlasArrayDocument {
                frames: vec![TexturePackerAtlasArrayFrame {
                    filename: "characters/hero".to_string(),
                    frame: TexturePackerAtlasRect {
                        h: 15.0,
                        w: 12.0,
                        x: 5.0,
                        y: 6.0,
                    },
                    pivot: Some(TexturePackerAtlasPivot { x: 0.25, y: 0.75 }),
                    rotated: true,
                    source_size: TexturePackerAtlasSize { h: 30.0, w: 40.0 },
                    sprite_source_size: TexturePackerAtlasRect {
                        h: 15.0,
                        w: 12.0,
                        x: 7.0,
                        y: 8.0,
                    },
                    trimmed: true,
                }],
                meta: texture_packer_meta(),
            },
        });
        let options = TexturePackerAtlasParseOptions {
            strip_path_prefix: Some(true),
        };
        let mut atlas = stale_atlas();
        parse_texture_packer_atlas_document(&mut atlas, &doc, Some(&options));

        assert_eq!(atlas.image_name.as_deref(), Some("packed.png"));
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (128.0, 64.0, 0.25)
        );
        assert_eq!(atlas.regions.len(), 1);
        let region = atlas.regions[0].read().unwrap();
        assert_eq!((region.id, region.name.as_deref()), (0, Some("hero")));
        assert_eq!(
            (region.x, region.y, region.width, region.height),
            (5.0, 6.0, 12.0, 15.0)
        );
        assert_eq!((region.source_x, region.source_y), (7.0, 8.0));
        assert_eq!(
            (region.original_width, region.original_height),
            (Some(40.0), Some(30.0))
        );
        assert_eq!((region.pivot_x, region.pivot_y), (Some(0.25), Some(0.75)));
        assert_eq!(region.rotation, TextureAtlasRotation::Clockwise90);
    }

    #[test]
    fn preserves_hash_order_and_windows_style_names_by_default() {
        let frame = TexturePackerAtlasHashFrame {
            frame: TexturePackerAtlasRect {
                h: 2.0,
                w: 3.0,
                x: 0.0,
                y: 1.0,
            },
            pivot: None,
            rotated: false,
            source_size: TexturePackerAtlasSize { h: 2.0, w: 3.0 },
            sprite_source_size: TexturePackerAtlasRect {
                h: 2.0,
                w: 3.0,
                x: 0.0,
                y: 0.0,
            },
            trimmed: false,
        };
        let doc = TexturePackerAtlasDocument::Hash(TexturePackerAtlasHashDocumentValue {
            value: TexturePackerAtlasHashDocument {
                frames: vec![
                    TexturePackerAtlasNamedFrame {
                        frame: frame.clone(),
                        name: "folder\\z".to_string(),
                    },
                    TexturePackerAtlasNamedFrame {
                        frame,
                        name: "folder/a".to_string(),
                    },
                ],
                meta: texture_packer_meta(),
            },
        });
        let mut atlas = create_texture_atlas(None);
        parse_texture_packer_atlas_document(&mut atlas, &doc, None);
        assert_eq!(
            atlas.regions[0].read().unwrap().name.as_deref(),
            Some("folder\\z")
        );
        assert_eq!(
            atlas.regions[1].read().unwrap().name.as_deref(),
            Some("folder/a")
        );
    }
}

mod parse_texture_packer_atlas_json {
    use super::*;

    #[test]
    fn maps_hash_frames_in_json_source_order_and_strips_both_path_separators() {
        let json = r#"{
            "frames": {
                "ui/button": {"frame":{"x":1,"y":2,"w":20,"h":10},"rotated":false,"trimmed":true,"spriteSourceSize":{"x":3,"y":4,"w":20,"h":10},"sourceSize":{"w":30,"h":40},"pivot":{"x":0.4,"y":0.6}},
                "fx\\spark": {"frame":{"x":5,"y":6,"w":7,"h":8},"rotated":true,"trimmed":false}
            },
            "meta": {"app":"TexturePacker","image":"atlas.png","size":{"w":256,"h":128},"scale":"0.5"}
        }"#;
        let options = TexturePackerAtlasParseOptions {
            strip_path_prefix: Some(true),
        };
        let mut atlas = stale_atlas();
        parse_texture_packer_atlas_json(&mut atlas, json, Some(&options));

        assert_eq!(atlas.image_name.as_deref(), Some("atlas.png"));
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (256.0, 128.0, 0.5)
        );
        assert_eq!(atlas.regions.len(), 2);
        let first = atlas.regions[0].read().unwrap();
        assert_eq!((first.id, first.name.as_deref()), (0, Some("button")));
        assert_eq!((first.pivot_x, first.pivot_y), (Some(0.4), Some(0.6)));
        assert_eq!(
            (first.original_width, first.original_height),
            (Some(30.0), Some(40.0))
        );
        drop(first);
        let second = atlas.regions[1].read().unwrap();
        assert_eq!((second.id, second.name.as_deref()), (1, Some("spark")));
        assert_eq!(second.rotation, TextureAtlasRotation::Clockwise90);
        assert_eq!(second.original_width, None);
    }

    #[test]
    fn leaves_the_atlas_unchanged_for_malformed_json() {
        let mut atlas = stale_atlas();
        let region = atlas.regions[0].clone();
        parse_texture_packer_atlas_json(&mut atlas, "[", None);
        assert_eq!(atlas.image_name.as_deref(), Some("old.png"));
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (12.0, 11.0, 3.0)
        );
        assert_eq!(atlas.regions.len(), 1);
        assert!(Arc::ptr_eq(&atlas.regions[0], &region));
    }
}
