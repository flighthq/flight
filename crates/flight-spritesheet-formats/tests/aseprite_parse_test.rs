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
            hash.animations[1].direction,
            SpritesheetAnimationDirection::Reverse
        );
        assert_eq!(hash.animations[1].repeat_count, -1);

        let array = parse_aseprite_spritesheet(ASEPRITE_ARRAY, None);
        assert_eq!(array.frames.len(), 2);
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
}
