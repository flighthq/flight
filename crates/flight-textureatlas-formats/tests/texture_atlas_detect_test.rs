use std::sync::Arc;

use flight_textureatlas::create_texture_atlas;
use flight_textureatlas_formats::*;

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
    fn leaves_the_registry_unchanged_when_formats_are_missing() {
        let mut registry = create_texture_atlas_format_registry();
        let before = kinds(&registry);
        apply_texture_atlas_import_options(
            &mut registry,
            &TextureAtlasImportOptions { formats: None },
        );
        assert_eq!(kinds(&registry), before);
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
    fn rejects_empty_malformed_and_unknown_content() {
        let registry = create_texture_atlas_format_registry();
        assert_eq!(detect_texture_atlas_format(&registry, ""), None);
        assert_eq!(detect_texture_atlas_format(&registry, "{bad"), None);
        assert_eq!(detect_texture_atlas_format(&registry, "plain text"), None);
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
