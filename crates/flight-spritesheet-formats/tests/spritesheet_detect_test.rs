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
                let mut data = create_spritesheet_data(None);
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
                let mut data = create_spritesheet_data(None);
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
}
