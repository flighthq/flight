use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_spritesheet_formats::*;

use crate::support::*;

mod parse_starling_spritesheet {
    use super::*;

    #[test]
    fn maps_geometry_normalized_pivots_inferred_animation_and_options() {
        let data = parse_starling_spritesheet(
            STARLING_XML,
            Some(&StarlingParseOptions {
                frame_duration: Some(75.0),
                image_height: Some(128.0),
                image_width: Some(256.0),
            }),
            None,
        );
        assert_eq!(data.frames.len(), 3);
        assert_eq!(
            (
                data.image_file.as_str(),
                data.image_width,
                data.image_height
            ),
            ("atlas.png", 256.0, 128.0)
        );
        assert_eq!(
            (
                data.frames[0].x,
                data.frames[0].y,
                data.frames[0].width,
                data.frames[0].height
            ),
            (10.0, 20.0, 30.0, 40.0)
        );
        assert_eq!(
            (data.frames[0].offset_x, data.frames[0].offset_y),
            (2.0, 3.0)
        );
        assert_eq!(
            (data.frames[0].source_width, data.frames[0].source_height),
            (36.0, 48.0)
        );
        assert_eq!(
            (data.frames[0].pivot_x, data.frames[0].pivot_y),
            (Some(0.5), Some(0.5))
        );
        assert!(data.frames[1].rotated);
        assert_eq!((data.frames[1].width, data.frames[1].height), (20.0, 40.0));
        assert_eq!(data.animations.len(), 1);
        assert_eq!(data.animations[0].name, "walk");
        assert_eq!(
            data.animations[0].frame_names,
            ["walk_01.png", "walk_02.png"]
        );
        assert_eq!(data.animations[0].frame_duration, 75.0);
    }

    #[test]
    fn reports_recover_when_dimensions_are_missing() {
        let mut diagnostics = Vec::new();
        let data = parse_starling_spritesheet(STARLING_XML, None, Some(&mut diagnostics));
        assert_eq!((data.image_width, data.image_height), (0.0, 0.0));
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].kind,
            "spritesheet.starling.missing-dimensions"
        );
        assert_eq!(diagnostics[0].origin, "documentToData");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
    }
}

mod parse_starling_spritesheet_document {
    use super::*;

    #[test]
    fn returns_raw_attributes_and_mapped_data() {
        let parsed = parse_starling_spritesheet_document(
            STARLING_XML,
            Some(&StarlingParseOptions {
                frame_duration: None,
                image_height: Some(1.0),
                image_width: Some(1.0),
            }),
            None,
        );
        assert_eq!(parsed.document.image_path, "atlas.png");
        assert_eq!(parsed.document.sub_textures.len(), 3);
        assert_eq!(parsed.document.sub_textures[0].frame_x, Some(-2.0));
        assert_eq!(parsed.data.frames.len(), 3);
    }
}
