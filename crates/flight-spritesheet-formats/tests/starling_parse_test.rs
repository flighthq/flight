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
        assert_eq!(data.animations[0].repeat_count, -1);
        assert_eq!(
            (data.frames[2].source_width, data.frames[2].source_height),
            (8.0, 8.0)
        );
        assert_eq!(
            (data.frames[2].pivot_x, data.frames[2].pivot_y),
            (None, None)
        );
        assert!(!data.frames[2].rotated);
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

    #[test]
    fn uses_default_duration_and_supplied_dimensions_without_a_diagnostic() {
        let data = parse_starling_spritesheet(
            STARLING_XML,
            Some(&StarlingParseOptions {
                frame_duration: None,
                image_height: Some(256.0),
                image_width: Some(512.0),
            }),
            Some(&mut Vec::new()),
        );
        assert_eq!((data.image_width, data.image_height), (512.0, 256.0));
        assert_eq!(data.animations[0].frame_duration, 100.0);

        let minimal = "<TextureAtlas imagePath=\"mini.png\"><SubTexture name=\"tile\" x=\"0\" y=\"0\" width=\"8\" height=\"8\"/></TextureAtlas>";
        let data = parse_starling_spritesheet(minimal, None, None);
        assert_eq!(data.image_file, "mini.png");
        assert_eq!(data.frames.len(), 1);
        assert!(data.animations.is_empty());
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
        assert_eq!(parsed.document.sub_textures[0].frame_y, Some(-3.0));
        assert_eq!(parsed.document.sub_textures[0].frame_width, Some(36.0));
        assert_eq!(parsed.document.sub_textures[0].frame_height, Some(48.0));
        assert_eq!(parsed.data.frames.len(), 3);
    }

    #[test]
    fn mapped_data_matches_the_plain_parser() {
        let plain = parse_starling_spritesheet(STARLING_XML, None, None);
        let parsed = parse_starling_spritesheet_document(STARLING_XML, None, None);
        assert_eq!(parsed.data.frames.len(), plain.frames.len());
        assert_eq!(parsed.data.image_file, plain.image_file);
    }
}
