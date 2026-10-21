use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_spritesheet::SpritesheetAnimationDirection;
use flight_spritesheet_formats::*;

use crate::support::*;

mod parse_aseprite_spritesheet {
    use super::*;

    #[test]
    fn maps_hash_and_array_geometry_metadata_durations_and_tags() {
        let hash = parse_aseprite_spritesheet(ASEPRITE_HASH, None);
        assert_eq!(hash.frames.len(), 4);
        assert_eq!(hash.frames[0].name, "sprite 0.aseprite");
        assert_eq!(
            (
                hash.frames[0].x,
                hash.frames[0].y,
                hash.frames[0].width,
                hash.frames[0].height
            ),
            (0.0, 0.0, 32.0, 32.0)
        );
        assert_eq!(
            (hash.frames[2].offset_x, hash.frames[2].offset_y),
            (1.0, 2.0)
        );
        assert_eq!(
            (hash.frames[2].source_width, hash.frames[2].source_height),
            (32.0, 32.0)
        );
        assert_eq!(
            (hash.frames[0].pivot_x, hash.frames[0].pivot_y),
            (None, None)
        );
        assert_eq!(
            (
                hash.image_file.as_str(),
                hash.image_width,
                hash.image_height,
                hash.scale
            ),
            ("sprite.png", 128.0, 32.0, 1.0)
        );
        assert_eq!(hash.animations.len(), 2);
        assert_eq!(hash.animations[0].name, "run");
        assert_eq!(
            hash.animations[0].frame_names,
            ["sprite 0.aseprite", "sprite 1.aseprite"]
        );
        assert_eq!(hash.animations[0].frame_duration, 100.0);
        assert_eq!(hash.animations[0].frame_durations, Some(vec![100.0, 150.0]));
        assert_eq!(
            hash.animations[0].direction,
            SpritesheetAnimationDirection::Forward
        );
        assert_eq!(
            hash.animations[1].direction,
            SpritesheetAnimationDirection::Reverse
        );
        assert_eq!(hash.animations[1].repeat_count, -1);

        let array = parse_aseprite_spritesheet(ASEPRITE_ARRAY, None);
        assert_eq!(array.frames.len(), 2);
        assert_eq!(array.frames[0].name, "anim 0.aseprite");
        assert_eq!(array.frames[1].name, "anim 1.aseprite");
        assert!(array.frames[1].rotated);
        assert_eq!(
            (array.frames[1].width, array.frames[1].height),
            (20.0, 12.0)
        );
        assert_eq!(
            array.animations[0].direction,
            SpritesheetAnimationDirection::Pingpong
        );
        assert_eq!(array.animations[0].frame_duration, 80.0);
        assert_eq!(array.animations[0].frame_durations, None);
    }

    #[test]
    fn malformed_json_returns_empty_data_and_exact_reject_diagnostic() {
        let mut diagnostics = Vec::new();
        let data = parse_aseprite_spritesheet("{ not valid", Some(&mut diagnostics));
        assert!(data.frames.is_empty());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "spritesheet.aseprite.malformed-json");
        assert_eq!(diagnostics[0].origin, "parseAsepriteSpritesheet");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
    }

    #[test]
    fn valid_json_reports_no_diagnostics_and_empty_tags_make_no_animations() {
        let mut value: serde_json::Value = serde_json::from_str(ASEPRITE_HASH).unwrap();
        value["meta"]["frameTags"] = serde_json::json!([]);
        let json = serde_json::to_string(&value).unwrap();
        let mut diagnostics = Vec::new();
        let data = parse_aseprite_spritesheet(&json, Some(&mut diagnostics));
        assert!(diagnostics.is_empty());
        assert!(data.animations.is_empty());
    }
}

mod parse_aseprite_spritesheet_document {
    use super::*;

    #[test]
    fn returns_the_typed_document_and_valid_empty_array_sentinel() {
        let parsed = parse_aseprite_spritesheet_document(ASEPRITE_HASH, None);
        assert_eq!(parsed.data.frames.len(), 4);
        let AsepriteDocument::Hash(document) = parsed.document else {
            panic!("expected hash");
        };
        assert_eq!(document.value.frames.len(), 4);
        assert_eq!(
            document.value.meta.layers.as_ref().unwrap()[0].name,
            "Layer 1"
        );

        let mut diagnostics = Vec::new();
        let parsed = parse_aseprite_spritesheet_document("x", Some(&mut diagnostics));
        assert!(parsed.data.frames.is_empty());
        let AsepriteDocument::Array(document) = parsed.document else {
            panic!("expected array sentinel");
        };
        assert!(document.value.frames.is_empty());
        assert_eq!(diagnostics[0].origin, "parseAsepriteSpritesheetDocument");
    }

    #[test]
    fn preserves_hash_array_layers_and_opaque_slices_while_matching_plain_parse() {
        let plain = parse_aseprite_spritesheet(ASEPRITE_HASH, None);
        let mut value: serde_json::Value = serde_json::from_str(ASEPRITE_HASH).unwrap();
        value["meta"]["slices"] = serde_json::json!([{"name":"hit","keys":[1,2]}]);
        let parsed =
            parse_aseprite_spritesheet_document(&serde_json::to_string(&value).unwrap(), None);
        assert_eq!(parsed.data.frames.len(), plain.frames.len());
        assert_eq!(parsed.data.image_file, plain.image_file);
        let AsepriteDocument::Hash(document) = parsed.document else {
            panic!("expected hash");
        };
        assert_eq!(document.value.frames[0].name, "sprite 0.aseprite");
        assert_eq!(document.value.meta.layers.as_ref().unwrap().len(), 1);
        let slices = document.value.meta.slices.as_ref().unwrap();
        let slice = slices[0]
            .as_ref()
            .unwrap()
            .downcast_ref::<serde_json::Value>()
            .unwrap();
        assert_eq!(slice["name"], "hit");

        let array = parse_aseprite_spritesheet_document(ASEPRITE_ARRAY, None);
        assert!(matches!(array.document, AsepriteDocument::Array(_)));
    }
}
