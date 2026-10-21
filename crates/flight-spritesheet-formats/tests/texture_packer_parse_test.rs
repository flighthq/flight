use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_spritesheet_formats::*;

use crate::support::*;

mod parse_texture_packer_spritesheet {
    use super::*;

    #[test]
    fn maps_both_variants_geometry_pivots_scale_and_tags() {
        let hash = parse_texture_packer_spritesheet(TEXTURE_PACKER_HASH, None);
        assert_eq!(hash.frames.len(), 3);
        let idle = &hash.frames[0];
        assert_eq!(idle.name, "hero/idle_0.png");
        assert_eq!(
            (idle.x, idle.y, idle.width, idle.height),
            (0.0, 0.0, 60.0, 56.0)
        );
        assert_eq!(
            (
                idle.offset_x,
                idle.offset_y,
                idle.source_width,
                idle.source_height
            ),
            (2.0, 4.0, 64.0, 64.0)
        );
        assert_eq!((idle.pivot_x, idle.pivot_y), (Some(0.5), Some(1.0)));
        assert_eq!(hash.frames[2].pivot_x, None);
        assert_eq!(
            (
                hash.image_file.as_str(),
                hash.image_width,
                hash.image_height,
                hash.scale
            ),
            ("atlas.png", 256.0, 128.0, 2.0)
        );
        assert_eq!(hash.animations.len(), 1);
        assert_eq!(
            hash.animations[0].frame_names,
            ["hero/idle_0.png", "hero/idle_1.png"]
        );
        assert_eq!(hash.animations[0].frame_duration, 100.0);
        assert_eq!(hash.animations[0].repeat_count, -1);

        let array = parse_texture_packer_spritesheet(TEXTURE_PACKER_ARRAY, None);
        assert_eq!(array.frames.len(), 2);
        assert_eq!(array.frames[1].name, "hero/run_0.png");
        assert!(array.frames[1].rotated);
        assert_eq!(
            (array.frames[1].width, array.frames[1].height),
            (40.0, 20.0)
        );
        assert!(array.animations.is_empty());
    }

    #[test]
    fn malformed_json_returns_empty_data_and_exact_reject_diagnostic() {
        let mut diagnostics = Vec::new();
        let data = parse_texture_packer_spritesheet("not json", Some(&mut diagnostics));
        assert!(data.frames.is_empty());
        assert_eq!(
            diagnostics[0].kind,
            "spritesheet.texture-packer.malformed-json"
        );
        assert_eq!(diagnostics[0].origin, "parseTexturePackerSpritesheet");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
    }
}

mod parse_texture_packer_spritesheet_document {
    use super::*;

    #[test]
    fn returns_typed_variants_and_valid_empty_sentinel() {
        let parsed = parse_texture_packer_spritesheet_document(TEXTURE_PACKER_ARRAY, None);
        assert_eq!(parsed.data.frames.len(), 2);
        assert!(matches!(parsed.document, TexturePackerDocument::Array(_)));
        let mut diagnostics = Vec::new();
        let parsed = parse_texture_packer_spritesheet_document("x", Some(&mut diagnostics));
        assert!(parsed.data.frames.is_empty());
        assert!(matches!(parsed.document, TexturePackerDocument::Array(_)));
        assert_eq!(
            diagnostics[0].origin,
            "parseTexturePackerSpritesheetDocument"
        );
    }
}
