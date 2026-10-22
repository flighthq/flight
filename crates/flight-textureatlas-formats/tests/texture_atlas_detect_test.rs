use std::sync::Arc;

use flight_textureatlas::{TextureAtlas, TextureAtlasOptions};
use flight_textureatlas_formats::*;

fn create_texture_atlas(obj: Option<TextureAtlasOptions>) -> TextureAtlas {
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

fn custom_entry(marker: &'static str) -> Arc<TextureAtlasFormatEntry> {
    return Arc::new(TextureAtlasFormatEntry {
        detect: Arc::new(move |content| content == marker),
        parse: Arc::new(move |atlas, _content, _options| {
            atlas.image_name = Some(marker.to_string());
        }),
    });
}

fn kinds(registry: &TextureAtlasFormatRegistry) -> Vec<TextureAtlasFormatKind> {
    let mut out = Vec::new();
    get_texture_atlas_format_kinds(&mut out, registry);
    return out;
}

fn corpus() -> Vec<(TextureAtlasFormatKind, &'static str)> {
    return vec![
        (
            TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE.to_string(),
            r#"{"frames":{"a.png":{"duration":100}},"meta":{"app":"http://www.aseprite.org/"}}"#,
        ),
        (
            TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS.to_string(),
            "a.png\nsize: 64,64\nformat: RGBA8888\nx\n  xy: 0, 0\n  orig: 1, 1\n",
        ),
        (
            TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string(),
            r#"<TextureAtlas imagePath="a.png"><SubTexture name="x" x="0" y="0" width="1" height="1"/></TextureAtlas>"#,
        ),
        (
            TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER.to_string(),
            r#"{"frames":{"a.png":{}},"meta":{"app":"https://www.codeandweb.com/texturepacker"}}"#,
        ),
    ];
}

mod apply_texture_atlas_import_options {
    use super::*;

    #[test]
    fn installs_descriptors_with_the_same_entry_identity() {
        let mut registry = create_texture_atlas_format_registry();
        let kind = "custom.import".to_string();
        let entry = custom_entry("imported");
        apply_texture_atlas_import_options(
            &mut registry,
            &TextureAtlasImportOptions {
                formats: Some(vec![TextureAtlasFormatDescriptor {
                    entry: entry.clone(),
                    kind: kind.clone(),
                }]),
            },
        );
        let registered = get_texture_atlas_format(&registry, &kind).unwrap();
        assert!(Arc::ptr_eq(&registered, &entry));
    }

    #[test]
    fn installs_nothing_when_formats_are_missing() {
        let mut registry = create_texture_atlas_format_registry();
        let starling = TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string();
        unregister_texture_atlas_format(&mut registry, &starling);
        apply_texture_atlas_import_options(
            &mut registry,
            &TextureAtlasImportOptions { formats: None },
        );
        assert!(get_texture_atlas_format(&registry, &starling).is_none());
    }
}

mod aseprite_texture_atlas_format {
    use super::*;

    #[test]
    fn returns_the_registry_owned_aseprite_descriptor() {
        let registry = create_texture_atlas_format_registry();
        let descriptor = aseprite_texture_atlas_format(&registry);
        let registered = get_texture_atlas_format(&registry, &descriptor.kind).unwrap();
        assert_eq!(descriptor.kind, TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE);
        assert!(Arc::ptr_eq(&descriptor.entry, &registered));
    }
}

mod create_texture_atlas_format_registry {
    use super::*;

    #[test]
    fn creates_an_independent_registry_with_all_builtins() {
        let mut first = create_texture_atlas_format_registry();
        let second = create_texture_atlas_format_registry();
        assert_eq!(
            kinds(&first),
            vec![
                TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE.to_string(),
                TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS.to_string(),
                TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string(),
                TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER.to_string(),
            ]
        );
        unregister_texture_atlas_format(
            &mut first,
            &TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string(),
        );
        assert_eq!(kinds(&first).len(), 3);
        assert_eq!(kinds(&second).len(), 4);
    }
}

mod detect_texture_atlas_format {
    use super::*;

    #[test]
    fn detects_each_builtin_and_json_fallbacks() {
        let registry = create_texture_atlas_format_registry();
        let aseprite = r#"{"frames":[{"duration":10}],"meta":{"app":"Aseprite"}}"#;
        let texture_packer = r#"{"frames":{},"meta":{"app":"CodeAndWeb TexturePacker"}}"#;
        let aseprite_without_meta = r#"{"frames":{"x":{"duration":1}}}"#;
        let texture_packer_without_meta = r#"{"frames":{"x":{"frame":{"x":0,"y":0,"w":1,"h":1}}}}"#;
        let libgdx = "page.png\nsize: 2, 2\nregion\nxy: 0, 0\norig: 1, 1\n";
        let starling = "  <TextureAtlas imagePath=\"a.png\"></TextureAtlas>";
        assert_eq!(
            detect_texture_atlas_format(&registry, aseprite).as_deref(),
            Some(TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE)
        );
        assert_eq!(
            detect_texture_atlas_format(&registry, texture_packer).as_deref(),
            Some(TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER)
        );
        assert_eq!(
            detect_texture_atlas_format(&registry, aseprite_without_meta).as_deref(),
            Some(TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE)
        );
        assert_eq!(
            detect_texture_atlas_format(&registry, texture_packer_without_meta).as_deref(),
            Some(TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER)
        );
        assert_eq!(
            detect_texture_atlas_format(&registry, libgdx).as_deref(),
            Some(TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS)
        );
        assert_eq!(
            detect_texture_atlas_format(&registry, starling).as_deref(),
            Some(TEXTURE_ATLAS_FORMAT_KIND_STARLING)
        );
    }

    #[test]
    fn detects_aseprite_array_documents() {
        let registry = create_texture_atlas_format_registry();
        let content = r#"{"frames":[{"filename":"x","duration":1}],"meta":{"app":"Aseprite"}}"#;
        assert_eq!(
            detect_texture_atlas_format(&registry, content).as_deref(),
            Some(TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE)
        );
    }

    #[test]
    fn exactly_one_builtin_detector_matches_each_supported_document() {
        let registry = create_texture_atlas_format_registry();
        for (expected_kind, content) in corpus() {
            let matches: Vec<&str> = texture_atlas_all_formats(&registry)
                .iter()
                .filter(|descriptor| (descriptor.entry.detect)(content))
                .map(|descriptor| descriptor.kind.as_str())
                .collect();
            assert_eq!(matches, vec![expected_kind.as_str()]);
        }
    }

    #[test]
    fn rejects_empty_malformed_and_unknown_content() {
        let registry = create_texture_atlas_format_registry();
        assert_eq!(detect_texture_atlas_format(&registry, ""), None);
        assert_eq!(detect_texture_atlas_format(&registry, "   \n\t"), None);
        assert_eq!(detect_texture_atlas_format(&registry, "{bad"), None);
        assert_eq!(detect_texture_atlas_format(&registry, "plain text"), None);
        assert_eq!(detect_texture_atlas_format(&registry, "[1,2,3]"), None);
        assert_eq!(
            detect_texture_atlas_format(
                &registry,
                r#"{"meta":{"app":"http://www.aseprite.org/"}}"#,
            ),
            None
        );
        assert_eq!(
            detect_texture_atlas_format(
                &registry,
                r#"<?xml version="1.0"?><plist><dict/></plist>"#,
            ),
            None
        );
    }
}

mod get_texture_atlas_format {
    use super::*;

    #[test]
    fn returns_the_same_registered_entry_or_none() {
        let registry = create_texture_atlas_format_registry();
        let descriptor = starling_texture_atlas_format(&registry);
        let entry = get_texture_atlas_format(&registry, &descriptor.kind).unwrap();
        assert!(Arc::ptr_eq(&entry, &descriptor.entry));
        assert!(get_texture_atlas_format(&registry, &"missing".to_string()).is_none());
    }

    #[test]
    fn returned_entry_can_parse_directly() {
        let registry = create_texture_atlas_format_registry();
        let kind = TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string();
        let entry = get_texture_atlas_format(&registry, &kind).unwrap();
        let mut atlas = create_texture_atlas(None);
        (entry.parse)(
            &mut atlas,
            r#"<TextureAtlas imagePath="direct.png"></TextureAtlas>"#,
            &TextureAtlasParseOptions {
                strip_path_prefix: None,
            },
        );
        assert_eq!(atlas.image_name.as_deref(), Some("direct.png"));
    }
}

mod get_texture_atlas_format_kinds {
    use super::*;

    #[test]
    fn overwrites_the_output_with_a_sorted_snapshot() {
        let registry = create_texture_atlas_format_registry();
        let mut out = vec!["stale".to_string()];
        get_texture_atlas_format_kinds(&mut out, &registry);
        assert_eq!(out, kinds(&registry));
        assert_eq!(out[0], TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE);
        assert_eq!(out[3], TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER);
    }
}

mod libgdx_atlas_texture_atlas_format {
    use super::*;

    #[test]
    fn returns_the_registry_owned_libgdx_descriptor() {
        let registry = create_texture_atlas_format_registry();
        let descriptor = libgdx_atlas_texture_atlas_format(&registry);
        let registered = get_texture_atlas_format(&registry, &descriptor.kind).unwrap();
        assert_eq!(descriptor.kind, TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS);
        assert!(Arc::ptr_eq(&descriptor.entry, &registered));
    }
}

mod parse_texture_atlas {
    use super::*;

    #[test]
    fn auto_detects_every_builtin_parser() {
        let registry = create_texture_atlas_format_registry();
        for (_kind, content) in corpus() {
            let mut atlas = create_texture_atlas(None);
            assert!(parse_texture_atlas(
                &mut atlas, &registry, content, None, None
            ));
        }
    }

    #[test]
    fn detects_and_populates_the_same_caller_owned_atlas() {
        let registry = create_texture_atlas_format_registry();
        let mut atlas = create_texture_atlas(None);
        let content = r#"<TextureAtlas imagePath="sheet.png"><SubTexture name="x" x="1" y="2" width="3" height="4"/></TextureAtlas>"#;
        assert!(parse_texture_atlas(
            &mut atlas, &registry, content, None, None
        ));
        assert_eq!(atlas.image_name.as_deref(), Some("sheet.png"));
        assert_eq!(atlas.regions.len(), 1);
    }

    #[test]
    fn accepts_an_explicit_format_kind() {
        let registry = create_texture_atlas_format_registry();
        let mut atlas = create_texture_atlas(None);
        let kind = TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string();
        let content = r#"<TextureAtlas imagePath="explicit.png"></TextureAtlas>"#;
        assert!(parse_texture_atlas(
            &mut atlas,
            &registry,
            content,
            Some(&kind),
            None,
        ));
        assert_eq!(atlas.image_name.as_deref(), Some("explicit.png"));
    }

    #[test]
    fn passes_options_through_to_the_parser() {
        let registry = create_texture_atlas_format_registry();
        let mut atlas = create_texture_atlas(None);
        let content = r#"{
            "frames": {
                "folder/item": {
                    "frame": {"x":0,"y":0,"w":1,"h":1},
                    "rotated": false,
                    "trimmed": false
                }
            },
            "meta": {"app":"TexturePacker"}
        }"#;
        assert!(parse_texture_atlas(
            &mut atlas,
            &registry,
            content,
            None,
            Some(&TextureAtlasParseOptions {
                strip_path_prefix: Some(true),
            }),
        ));
        assert_eq!(
            atlas.regions[0].read().unwrap().name.as_deref(),
            Some("item")
        );
    }

    #[test]
    fn returns_false_without_mutation_for_unknown_or_unregistered_formats() {
        let registry = create_texture_atlas_format_registry();
        let mut atlas = create_texture_atlas(None);
        atlas.image_name = Some("keep.png".to_string());
        assert!(!parse_texture_atlas(
            &mut atlas, &registry, "unknown", None, None
        ));
        assert!(!parse_texture_atlas(
            &mut atlas,
            &registry,
            "anything",
            Some(&"missing".to_string()),
            None,
        ));
        assert_eq!(atlas.image_name.as_deref(), Some("keep.png"));
    }
}

mod register_texture_atlas_format {
    use super::*;

    #[test]
    fn adds_a_detectable_and_parseable_custom_format_without_disturbing_builtins() {
        let mut registry = create_texture_atlas_format_registry();
        let builtins = kinds(&registry);
        let kind = "custom.parseable".to_string();
        let entry = custom_entry("custom document");
        register_texture_atlas_format(&mut registry, &kind, entry.clone());

        assert_eq!(
            detect_texture_atlas_format(&registry, "custom document"),
            Some(kind.clone())
        );
        let mut atlas = create_texture_atlas(None);
        assert!(parse_texture_atlas(
            &mut atlas,
            &registry,
            "custom document",
            None,
            None,
        ));
        assert_eq!(atlas.image_name.as_deref(), Some("custom document"));
        for builtin in builtins {
            assert!(get_texture_atlas_format(&registry, &builtin).is_some());
        }
        assert!(Arc::ptr_eq(
            &get_texture_atlas_format(&registry, &kind).unwrap(),
            &entry,
        ));
    }

    #[test]
    fn replaces_entries_without_changing_detection_priority() {
        let mut registry = create_texture_atlas_format_registry();
        let z_kind = "z.first".to_string();
        let a_kind = "a.second".to_string();
        let first = Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(|content| content == "overlap"),
            parse: Arc::new(|_atlas, _content, _options| {}),
        });
        let second = Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(|content| content == "overlap"),
            parse: Arc::new(|_atlas, _content, _options| {}),
        });
        register_texture_atlas_format(&mut registry, &z_kind, first);
        register_texture_atlas_format(&mut registry, &a_kind, second);
        let replacement = Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(|content| content == "overlap"),
            parse: Arc::new(|_atlas, _content, _options| {}),
        });
        register_texture_atlas_format(&mut registry, &z_kind, replacement.clone());
        assert_eq!(
            detect_texture_atlas_format(&registry, "overlap"),
            Some(z_kind.clone())
        );
        assert!(Arc::ptr_eq(
            &get_texture_atlas_format(&registry, &z_kind).unwrap(),
            &replacement
        ));
    }
}

mod starling_texture_atlas_format {
    use super::*;

    #[test]
    fn returns_the_registry_owned_starling_descriptor() {
        let registry = create_texture_atlas_format_registry();
        let descriptor = starling_texture_atlas_format(&registry);
        let registered = get_texture_atlas_format(&registry, &descriptor.kind).unwrap();
        assert_eq!(descriptor.kind, TEXTURE_ATLAS_FORMAT_KIND_STARLING);
        assert!(Arc::ptr_eq(&descriptor.entry, &registered));
    }
}

mod texture_atlas_all_formats {
    use super::*;

    #[test]
    fn returns_the_stable_alphabetical_builtin_preset() {
        let registry = create_texture_atlas_format_registry();
        let formats = texture_atlas_all_formats(&registry);
        let actual: Vec<&str> = formats.iter().map(|format| format.kind.as_str()).collect();
        assert_eq!(
            actual,
            vec![
                TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE,
                TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS,
                TEXTURE_ATLAS_FORMAT_KIND_STARLING,
                TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER,
            ]
        );
    }

    #[test]
    fn retains_the_registry_entries_and_is_order_independent_when_installed() {
        let mut registry = create_texture_atlas_format_registry();
        let mut reversed = texture_atlas_all_formats(&registry).to_vec();
        for descriptor in &reversed {
            let registered = get_texture_atlas_format(&registry, &descriptor.kind).unwrap();
            assert!(Arc::ptr_eq(&descriptor.entry, &registered));
        }
        for descriptor in &reversed {
            unregister_texture_atlas_format(&mut registry, &descriptor.kind);
        }
        reversed.reverse();
        apply_texture_atlas_import_options(
            &mut registry,
            &TextureAtlasImportOptions {
                formats: Some(reversed),
            },
        );
        for (kind, content) in corpus() {
            assert_eq!(detect_texture_atlas_format(&registry, content), Some(kind));
        }
    }
}

mod texture_packer_texture_atlas_format {
    use super::*;

    #[test]
    fn returns_the_registry_owned_texture_packer_descriptor() {
        let registry = create_texture_atlas_format_registry();
        let descriptor = texture_packer_texture_atlas_format(&registry);
        let registered = get_texture_atlas_format(&registry, &descriptor.kind).unwrap();
        assert_eq!(descriptor.kind, TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER);
        assert!(Arc::ptr_eq(&descriptor.entry, &registered));
    }
}

mod unregister_texture_atlas_format {
    use super::*;

    #[test]
    fn removes_an_entry_and_reinsertion_appends_its_detection_priority() {
        let mut registry = create_texture_atlas_format_registry();
        let first_kind = "custom.first".to_string();
        let second_kind = "custom.second".to_string();
        let overlap = Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(|content| content == "overlap"),
            parse: Arc::new(|_atlas, _content, _options| {}),
        });
        register_texture_atlas_format(&mut registry, &first_kind, overlap.clone());
        register_texture_atlas_format(&mut registry, &second_kind, overlap.clone());
        assert_eq!(
            detect_texture_atlas_format(&registry, "overlap"),
            Some(first_kind.clone())
        );
        unregister_texture_atlas_format(&mut registry, &first_kind);
        assert!(get_texture_atlas_format(&registry, &first_kind).is_none());
        register_texture_atlas_format(&mut registry, &first_kind, overlap);
        assert_eq!(
            detect_texture_atlas_format(&registry, "overlap"),
            Some(second_kind)
        );
    }
}
