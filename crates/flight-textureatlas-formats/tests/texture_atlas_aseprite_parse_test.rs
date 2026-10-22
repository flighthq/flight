use std::sync::Arc;

use flight_textureatlas::{
    TextureAtlasOptions, TextureAtlasRegionOptions, TextureAtlasRotation, set_texture_atlas_region,
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

fn aseprite_meta() -> TextureAtlasAsepriteMeta {
    return TextureAtlasAsepriteMeta {
        app: "Aseprite".to_string(),
        format: "RGBA8888".to_string(),
        frame_tags: Some(vec![TextureAtlasAsepriteFrameTag {
            color: Some("#ffaa00".to_string()),
            direction: TextureAtlasFrameTagDirection::PingPong,
            from: 0,
            name: "walk".to_string(),
            to: 1,
        }]),
        image: "sprites.png".to_string(),
        scale: TextureAtlasScale::String(TextureAtlasScaleString {
            value: "0.5".to_string(),
        }),
        size: TextureAtlasAsepriteSize { h: 128.0, w: 256.0 },
        version: "1.3".to_string(),
    };
}

fn stale_atlas() -> flight_textureatlas::TextureAtlas {
    let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        height: None,
        id: Some(99),
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
        image_height: Some(8.0),
        image_name: Some("stale.png".to_string()),
        image_width: Some(9.0),
        regions: Some(vec![region]),
        scale: Some(2.0),
        texture: None,
    }));
}

mod parse_texture_atlas_aseprite_document {
    use super::*;

    #[test]
    fn maps_hash_frames_in_source_order_and_replaces_existing_data() {
        let first = TextureAtlasAsepriteBaseFrame {
            duration: 100.0,
            frame: TextureAtlasAsepriteRect {
                h: 12.0,
                w: 20.0,
                x: 3.0,
                y: 4.0,
            },
            rotated: false,
            source_size: TextureAtlasAsepriteSize { h: 30.0, w: 40.0 },
            sprite_source_size: TextureAtlasAsepriteRect {
                h: 12.0,
                w: 20.0,
                x: 5.0,
                y: 6.0,
            },
            trimmed: true,
        };
        let second = TextureAtlasAsepriteBaseFrame {
            duration: 120.0,
            frame: TextureAtlasAsepriteRect {
                h: 8.0,
                w: 10.0,
                x: 30.0,
                y: 40.0,
            },
            rotated: true,
            source_size: TextureAtlasAsepriteSize { h: 8.0, w: 10.0 },
            sprite_source_size: TextureAtlasAsepriteRect {
                h: 8.0,
                w: 10.0,
                x: 0.0,
                y: 0.0,
            },
            trimmed: false,
        };
        let doc = TextureAtlasAsepriteDocument::Hash(TextureAtlasAsepriteHashDocumentValue {
            value: TextureAtlasAsepriteHashDocument {
                frames: vec![
                    TextureAtlasAsepriteNamedFrame {
                        frame: first,
                        name: "idle".to_string(),
                    },
                    TextureAtlasAsepriteNamedFrame {
                        frame: second,
                        name: "turn".to_string(),
                    },
                ],
                meta: aseprite_meta(),
            },
        });
        let mut atlas = stale_atlas();
        parse_texture_atlas_aseprite_document(&mut atlas, &doc);

        assert_eq!(atlas.image_name.as_deref(), Some("sprites.png"));
        assert_eq!(atlas.image_width, 256.0);
        assert_eq!(atlas.image_height, 128.0);
        assert_eq!(atlas.scale, 0.5);
        assert_eq!(atlas.regions.len(), 2);
        let first = atlas.regions[0].read().unwrap();
        assert_eq!(first.id, 0);
        assert_eq!(first.name.as_deref(), Some("idle"));
        assert_eq!(
            (first.x, first.y, first.width, first.height),
            (3.0, 4.0, 20.0, 12.0)
        );
        assert_eq!((first.source_x, first.source_y), (5.0, 6.0));
        assert_eq!(
            (first.original_width, first.original_height),
            (Some(40.0), Some(30.0))
        );
        assert_eq!((first.pivot_x, first.pivot_y), (None, None));
        assert!(first.trimmed);
        assert_eq!(first.rotation, TextureAtlasRotation::None);
        drop(first);
        let second = atlas.regions[1].read().unwrap();
        assert_eq!(second.id, 1);
        assert_eq!(second.name.as_deref(), Some("turn"));
        assert_eq!(second.original_width, None);
        assert_eq!(second.original_height, None);
        assert_eq!(second.rotation, TextureAtlasRotation::Clockwise90);
    }

    #[test]
    fn maps_array_frame_filenames() {
        let doc = TextureAtlasAsepriteDocument::Array(TextureAtlasAsepriteArrayDocumentValue {
            value: TextureAtlasAsepriteArrayDocument {
                frames: vec![TextureAtlasAsepriteArrayFrame {
                    duration: 75.0,
                    filename: "run_0".to_string(),
                    frame: TextureAtlasAsepriteRect {
                        h: 4.0,
                        w: 5.0,
                        x: 1.0,
                        y: 2.0,
                    },
                    rotated: false,
                    source_size: TextureAtlasAsepriteSize { h: 4.0, w: 5.0 },
                    sprite_source_size: TextureAtlasAsepriteRect {
                        h: 4.0,
                        w: 5.0,
                        x: 0.0,
                        y: 0.0,
                    },
                    trimmed: false,
                }],
                meta: aseprite_meta(),
            },
        });
        let mut atlas = create_texture_atlas(None);
        parse_texture_atlas_aseprite_document(&mut atlas, &doc);
        assert_eq!(
            atlas.regions[0].read().unwrap().name.as_deref(),
            Some("run_0")
        );
    }
}

mod parse_texture_atlas_aseprite_json {
    use super::*;

    #[test]
    fn preserves_json_object_order_and_tolerates_partial_frames() {
        let json = r#"{
            "frames": {
                "zeta": {"frame":{"x":7,"y":8,"w":9,"h":10},"rotated":true,"trimmed":true,"spriteSourceSize":{"x":2,"y":3,"w":9,"h":10},"sourceSize":{"w":20,"h":30},"duration":80},
                "alpha": {"frame":null},
                "beta": {"frame":{"x":1,"y":2,"w":3,"h":4},"duration":90}
            },
            "meta": {"app":"Aseprite","image":"sheet.png","size":{"w":64,"h":32},"scale":"2x"}
        }"#;
        let mut atlas = stale_atlas();
        parse_texture_atlas_aseprite_json(&mut atlas, json);

        assert_eq!(atlas.image_name.as_deref(), Some("sheet.png"));
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (64.0, 32.0, 2.0)
        );
        assert_eq!(atlas.regions.len(), 2);
        let first = atlas.regions[0].read().unwrap();
        assert_eq!((first.id, first.name.as_deref()), (0, Some("zeta")));
        assert_eq!(first.rotation, TextureAtlasRotation::Clockwise90);
        assert_eq!(
            (first.original_width, first.original_height),
            (Some(20.0), Some(30.0))
        );
        drop(first);
        let second = atlas.regions[1].read().unwrap();
        assert_eq!((second.id, second.name.as_deref()), (1, Some("beta")));
        assert_eq!((second.source_x, second.source_y), (0.0, 0.0));
    }

    #[test]
    fn leaves_the_atlas_unchanged_for_malformed_json() {
        let mut atlas = stale_atlas();
        let region = atlas.regions[0].clone();
        parse_texture_atlas_aseprite_json(&mut atlas, "{not json");
        assert_eq!(atlas.image_name.as_deref(), Some("stale.png"));
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (9.0, 8.0, 2.0)
        );
        assert_eq!(atlas.regions.len(), 1);
        assert!(Arc::ptr_eq(&atlas.regions[0], &region));
    }
}
