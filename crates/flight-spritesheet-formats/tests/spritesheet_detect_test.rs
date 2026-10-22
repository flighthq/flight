use std::sync::Arc;

use flight_spritesheet::create_spritesheet_data;
use flight_spritesheet_formats::*;

use crate::support::*;

mod apply_spritesheet_import_options {
    use super::*;

    #[test]
    fn applies_only_explicit_descriptors() {
        let source = create_spritesheet_format_registry();
        let descriptor = starling_spritesheet_format(&source).clone();
        let mut registry = create_spritesheet_format_registry();
        for kind in [
            SPRITESHEET_FORMAT_KIND_ASEPRITE,
            SPRITESHEET_FORMAT_KIND_COCOS_PLIST,
            SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER,
            SPRITESHEET_FORMAT_KIND_STARLING,
            SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS,
        ] {
            unregister_spritesheet_format(&mut registry, &kind.to_string());
        }
        apply_spritesheet_import_options(
            &mut registry,
            &SpritesheetImportOptions {
                formats: Some(vec![descriptor]),
            },
        );
        let mut kinds = Vec::new();
        get_spritesheet_format_kinds(&mut kinds, &registry);
        assert_eq!(kinds, [SPRITESHEET_FORMAT_KIND_STARLING]);
    }

    #[test]
    fn empty_options_do_not_restore_an_unregistered_builtin() {
        let mut registry = create_spritesheet_format_registry();
        let kind = SPRITESHEET_FORMAT_KIND_STARLING.to_string();
        unregister_spritesheet_format(&mut registry, &kind);
        apply_spritesheet_import_options(
            &mut registry,
            &SpritesheetImportOptions { formats: None },
        );
        assert!(get_spritesheet_format(&registry, &kind).is_none());
    }
}

mod aseprite_spritesheet_format {
    use super::*;

    #[test]
    fn returns_the_retained_aseprite_entry() {
        let registry = create_spritesheet_format_registry();
        let descriptor = aseprite_spritesheet_format(&registry);
        assert!(Arc::ptr_eq(
            &descriptor.entry,
            &get_spritesheet_format(&registry, &descriptor.kind).unwrap()
        ));
    }
}

mod cocos_plist_spritesheet_format {
    use super::*;

    #[test]
    fn returns_the_retained_cocos_entry() {
        let registry = create_spritesheet_format_registry();
        let descriptor = cocos_plist_spritesheet_format(&registry);
        assert!(Arc::ptr_eq(
            &descriptor.entry,
            &get_spritesheet_format(&registry, &descriptor.kind).unwrap()
        ));
    }
}

mod create_spritesheet_format_registry {
    use super::*;

    #[test]
    fn seeds_every_builtin_in_load_bearing_detection_order() {
        let registry = create_spritesheet_format_registry();
        assert_eq!(
            spritesheet_all_formats(&registry)
                .iter()
                .map(|format| format.kind.as_str())
                .collect::<Vec<_>>(),
            [
                SPRITESHEET_FORMAT_KIND_ASEPRITE,
                SPRITESHEET_FORMAT_KIND_COCOS_PLIST,
                SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER,
                SPRITESHEET_FORMAT_KIND_STARLING,
                SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS,
            ]
        );
        assert_eq!(
            detect_spritesheet_format(&registry, ASEPRITE_HASH).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_ASEPRITE)
        );
    }
}

mod detect_spritesheet_format {
    use super::*;

    #[test]
    fn detects_every_format_and_rejects_container_false_positives() {
        let registry = create_spritesheet_format_registry();
        assert_eq!(
            detect_spritesheet_format(&registry, ASEPRITE_HASH).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_ASEPRITE)
        );
        assert_eq!(
            detect_spritesheet_format(&registry, TEXTURE_PACKER_HASH).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER)
        );
        assert_eq!(
            detect_spritesheet_format(&registry, COCOS_PLIST).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_COCOS_PLIST)
        );
        assert_eq!(
            detect_spritesheet_format(&registry, STARLING_XML).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_STARLING)
        );
        assert_eq!(
            detect_spritesheet_format(&registry, LIBGDX_ATLAS).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS)
        );
        assert!(
            detect_spritesheet_format(
                &registry,
                "<plist><dict><key>textureFileName</key><string>x</string></dict></plist>"
            )
            .is_none()
        );
        assert!(detect_spritesheet_format(&registry, "unknown").is_none());
    }

    #[test]
    fn rejects_non_sheet_plists_and_accepts_both_cocos_vocabularies() {
        let registry = create_spritesheet_format_registry();
        for content in [
            "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict></dict></plist>",
            "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>metadata</key><dict/></dict></plist>",
            "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>frames</key><array/></dict></plist>",
            "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>note</key><string>frames</string></dict></plist>",
            "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>maxParticles</key><integer>200</integer><key>textureFileName</key><string>spark.png</string></dict></plist>",
        ] {
            assert!(detect_spritesheet_format(&registry, content).is_none());
        }
        let old = "<plist><dict><key>frames</key><dict><key>hero.png</key><dict><key>frame</key><string>{{0,0},{1,1}}</string><key>offset</key><string>{0,0}</string><key>sourceSize</key><string>{1,1}</string></dict></dict></dict></plist>";
        assert_eq!(
            detect_spritesheet_format(&registry, old).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_COCOS_PLIST)
        );
        assert_eq!(
            detect_spritesheet_format(&registry, COCOS_PLIST).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_COCOS_PLIST)
        );
    }

    #[test]
    fn detects_cocos_serializer_output_empty_sheets_and_a_frame_named_frames() {
        let registry = create_spritesheet_format_registry();
        let data = parse_cocos_plist_spritesheet(COCOS_PLIST, None);
        let serialized = serialize_cocos_plist_spritesheet(&data, None);
        assert_eq!(
            detect_spritesheet_format(&registry, &serialized).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_COCOS_PLIST)
        );
        let empty = parse_cocos_plist_spritesheet(
            "<plist><dict><key>frames</key><dict/></dict></plist>",
            None,
        );
        let serialized = serialize_cocos_plist_spritesheet(&empty, None);
        assert_eq!(
            detect_spritesheet_format(&registry, &serialized).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_COCOS_PLIST)
        );
        let nested = COCOS_PLIST.replace("<key>hero.png</key>", "<key>frames</key>");
        assert_eq!(
            detect_spritesheet_format(&registry, &nested).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_COCOS_PLIST)
        );
    }

    #[test]
    fn resolves_overlapping_aseprite_before_texture_packer() {
        let registry = create_spritesheet_format_registry();
        let texture_packer = get_spritesheet_format(
            &registry,
            &SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER.to_string(),
        )
        .unwrap();
        assert!((texture_packer.detect)(ASEPRITE_HASH));
        assert_eq!(
            detect_spritesheet_format(&registry, ASEPRITE_HASH).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_ASEPRITE)
        );
        assert!(parse_spritesheet(&registry, ASEPRITE_HASH, None, None).is_some());
    }
}

mod get_spritesheet_format {
    use super::*;

    #[test]
    fn returns_registered_entry_and_none_for_unknown() {
        let registry = create_spritesheet_format_registry();
        assert!(
            get_spritesheet_format(&registry, &SPRITESHEET_FORMAT_KIND_ASEPRITE.to_string())
                .is_some()
        );
        assert!(get_spritesheet_format(&registry, &"acme.Missing".to_string()).is_none());
    }

    #[test]
    fn reflects_the_exact_entry_registered_by_a_caller() {
        let mut registry = create_spritesheet_format_registry();
        let kind = "acme.GetFormat".to_string();
        let entry = Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(|text| text.starts_with("GFT:")),
            parse: Arc::new(|_, _| create_spritesheet_data()),
        });
        register_spritesheet_format(&mut registry, &kind, entry.clone());
        assert!(Arc::ptr_eq(
            &get_spritesheet_format(&registry, &kind).unwrap(),
            &entry
        ));
    }
}

mod get_spritesheet_format_kinds {
    use super::*;

    #[test]
    fn writes_a_sorted_snapshot() {
        let registry = create_spritesheet_format_registry();
        let mut kinds = vec!["old".to_string()];
        get_spritesheet_format_kinds(&mut kinds, &registry);
        assert_eq!(
            kinds,
            [
                "Aseprite",
                "CocosPlist",
                "LibgdxAtlas",
                "Starling",
                "TexturePacker"
            ]
        );
    }

    #[test]
    fn includes_then_removes_a_custom_kind_in_sorted_order() {
        let mut registry = create_spritesheet_format_registry();
        let kind = "test.Enumeration".to_string();
        register_spritesheet_format(
            &mut registry,
            &kind,
            Arc::new(SpritesheetFormatEntry {
                detect: Arc::new(|_| false),
                parse: Arc::new(|_, _| create_spritesheet_data()),
            }),
        );
        let mut kinds = Vec::new();
        get_spritesheet_format_kinds(&mut kinds, &registry);
        assert_eq!(kinds.last(), Some(&kind));
        unregister_spritesheet_format(&mut registry, &kind);
        get_spritesheet_format_kinds(&mut kinds, &registry);
        assert!(!kinds.contains(&kind));
    }
}

mod libgdx_atlas_spritesheet_format {
    use super::*;

    #[test]
    fn returns_the_retained_libgdx_entry() {
        let registry = create_spritesheet_format_registry();
        let descriptor = libgdx_atlas_spritesheet_format(&registry);
        assert!(Arc::ptr_eq(
            &descriptor.entry,
            &get_spritesheet_format(&registry, &descriptor.kind).unwrap()
        ));
    }
}

mod parse_spritesheet {
    use super::*;

    #[test]
    fn auto_detects_honors_explicit_kind_forwards_options_and_returns_none() {
        let registry = create_spritesheet_format_registry();
        assert_eq!(
            parse_spritesheet(&registry, ASEPRITE_HASH, None, None)
                .unwrap()
                .frames
                .len(),
            4
        );
        let starling = parse_spritesheet(
            &registry,
            STARLING_XML,
            Some(&SPRITESHEET_FORMAT_KIND_STARLING.to_string()),
            Some(&SpritesheetParseOptions {
                frame_duration: Some(44.0),
                image_height: Some(10.0),
                image_width: Some(20.0),
            }),
        )
        .unwrap();
        assert_eq!(
            (
                starling.image_width,
                starling.image_height,
                starling.animations[0].frame_duration
            ),
            (20.0, 10.0, 44.0)
        );
        assert!(parse_spritesheet(&registry, "unknown", None, None).is_none());
        assert!(
            parse_spritesheet(&registry, ASEPRITE_HASH, Some(&"missing".to_string()), None)
                .is_none()
        );
    }

    #[test]
    fn auto_detects_texture_packer_and_honors_its_explicit_override() {
        let registry = create_spritesheet_format_registry();
        let automatic = parse_spritesheet(&registry, TEXTURE_PACKER_HASH, None, None).unwrap();
        assert_eq!(automatic.image_file, "atlas.png");
        let explicit = parse_spritesheet(
            &registry,
            TEXTURE_PACKER_HASH,
            Some(&SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER.to_string()),
            Some(&SpritesheetParseOptions {
                frame_duration: Some(250.0),
                image_height: None,
                image_width: None,
            }),
        )
        .unwrap();
        assert_eq!(explicit.image_file, "atlas.png");
    }
}

mod register_spritesheet_format {
    use super::*;

    #[test]
    fn custom_entries_parse_replace_without_moving_and_reinsert_after_unregister() {
        let mut registry = create_spritesheet_format_registry();
        let kind = "acme.Custom".to_string();
        let first = Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(|text| text == "custom"),
            parse: Arc::new(|_, _| {
                let mut data = create_spritesheet_data();
                data.image_file = "first".to_string();
                data
            }),
        });
        register_spritesheet_format(&mut registry, &kind, first);
        assert_eq!(
            detect_spritesheet_format(&registry, "custom"),
            Some(kind.clone())
        );
        assert_eq!(
            parse_spritesheet(&registry, "custom", None, None)
                .unwrap()
                .image_file,
            "first"
        );
        let replacement = Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(|text| text == "custom"),
            parse: Arc::new(|_, _| {
                let mut data = create_spritesheet_data();
                data.image_file = "second".to_string();
                data
            }),
        });
        register_spritesheet_format(&mut registry, &kind, replacement.clone());
        assert!(Arc::ptr_eq(
            &get_spritesheet_format(&registry, &kind).unwrap(),
            &replacement
        ));
        assert_eq!(
            parse_spritesheet(&registry, "custom", None, None)
                .unwrap()
                .image_file,
            "second"
        );
        unregister_spritesheet_format(&mut registry, &kind);
        assert!(get_spritesheet_format(&registry, &kind).is_none());
        register_spritesheet_format(&mut registry, &kind, replacement);
        assert_eq!(detect_spritesheet_format(&registry, "custom"), Some(kind));
    }
}

mod spritesheet_all_formats {
    use super::*;

    #[test]
    fn returns_all_retained_builtins() {
        let registry = create_spritesheet_format_registry();
        assert_eq!(spritesheet_all_formats(&registry).len(), 5);
        assert_eq!(
            spritesheet_all_formats(&registry)[0].kind,
            SPRITESHEET_FORMAT_KIND_ASEPRITE
        );
    }

    #[test]
    fn ordering_kinds_and_entry_identities_are_exact_and_unique() {
        let registry = create_spritesheet_format_registry();
        let formats = spritesheet_all_formats(&registry);
        let kinds = formats
            .iter()
            .map(|format| format.kind.clone())
            .collect::<Vec<_>>();
        assert!(
            kinds
                .iter()
                .position(|kind| kind == SPRITESHEET_FORMAT_KIND_ASEPRITE)
                < kinds
                    .iter()
                    .position(|kind| kind == SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER)
        );
        let mut sorted_formats = kinds.clone();
        sorted_formats.sort();
        sorted_formats.dedup();
        let mut registered = Vec::new();
        get_spritesheet_format_kinds(&mut registered, &registry);
        assert_eq!(sorted_formats, registered);
        assert_eq!(kinds.len(), sorted_formats.len());
        for format in formats {
            assert!(Arc::ptr_eq(
                &format.entry,
                &get_spritesheet_format(&registry, &format.kind).unwrap()
            ));
        }
    }
}

mod starling_spritesheet_format {
    use super::*;

    #[test]
    fn returns_the_retained_starling_entry() {
        let registry = create_spritesheet_format_registry();
        let descriptor = starling_spritesheet_format(&registry);
        assert!(Arc::ptr_eq(
            &descriptor.entry,
            &get_spritesheet_format(&registry, &descriptor.kind).unwrap()
        ));
    }
}

mod texture_packer_spritesheet_format {
    use super::*;

    #[test]
    fn returns_the_retained_texture_packer_entry() {
        let registry = create_spritesheet_format_registry();
        let descriptor = texture_packer_spritesheet_format(&registry);
        assert!(Arc::ptr_eq(
            &descriptor.entry,
            &get_spritesheet_format(&registry, &descriptor.kind).unwrap()
        ));
    }
}

mod unregister_spritesheet_format {
    use super::*;

    #[test]
    fn removes_a_builtin_until_explicitly_reapplied() {
        let mut registry = create_spritesheet_format_registry();
        let descriptor = starling_spritesheet_format(&registry).clone();
        unregister_spritesheet_format(&mut registry, &SPRITESHEET_FORMAT_KIND_STARLING.to_string());
        assert!(detect_spritesheet_format(&registry, STARLING_XML).is_none());
        apply_spritesheet_import_options(
            &mut registry,
            &SpritesheetImportOptions {
                formats: Some(vec![descriptor]),
            },
        );
        assert_eq!(
            detect_spritesheet_format(&registry, STARLING_XML).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_STARLING)
        );
    }

    #[test]
    fn removes_a_custom_format_from_detection_and_resolution() {
        let mut registry = create_spritesheet_format_registry();
        let kind = "test.RemovedFormat".to_string();
        register_spritesheet_format(
            &mut registry,
            &kind,
            Arc::new(SpritesheetFormatEntry {
                detect: Arc::new(|text| text.starts_with("REMOVED:")),
                parse: Arc::new(|_, _| create_spritesheet_data()),
            }),
        );
        unregister_spritesheet_format(&mut registry, &kind);
        assert!(detect_spritesheet_format(&registry, "REMOVED: data").is_none());
        assert!(get_spritesheet_format(&registry, &kind).is_none());
    }
}
