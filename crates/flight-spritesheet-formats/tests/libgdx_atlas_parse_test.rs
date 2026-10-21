use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_spritesheet_formats::*;

use crate::support::*;

mod parse_libgdx_atlas_spritesheet {
    use super::*;

    #[test]
    fn maps_first_page_geometry_index_names_and_inferred_animation() {
        let data = parse_libgdx_atlas_spritesheet(
            LIBGDX_ATLAS,
            Some(&LibgdxAtlasParseOptions {
                frame_duration: Some(60.0),
            }),
            None,
        );
        assert_eq!(
            (
                data.image_file.as_str(),
                data.image_width,
                data.image_height
            ),
            ("atlas.png", 256.0, 128.0)
        );
        assert_eq!(data.frames.len(), 2);
        assert_eq!(data.frames[0].name, "walk_2");
        assert_eq!(data.frames[1].name, "walk_1");
        assert!(data.frames[1].rotated);
        assert_eq!((data.frames[1].width, data.frames[1].height), (40.0, 20.0));
        assert_eq!(
            (data.frames[1].offset_x, data.frames[1].offset_y),
            (1.0, 2.0)
        );
        assert_eq!(data.animations.len(), 1);
        assert_eq!(data.animations[0].name, "walk");
        assert_eq!(data.animations[0].frame_names, ["walk_1", "walk_2"]);
        assert_eq!(data.animations[0].frame_duration, 60.0);
    }

    #[test]
    fn repairs_missing_page_header_with_exact_recover_diagnostic() {
        let text = "hero\n  rotate: false\n  xy: 0, 0\n  size: 8, 8\n  orig: 8, 8\n  offset: 0, 0\n  index: -1\n";
        let mut diagnostics = Vec::new();
        let data = parse_libgdx_atlas_spritesheet(text, None, Some(&mut diagnostics));
        assert_eq!(data.image_file, "");
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].kind,
            "spritesheet.libgdx-atlas.missing-page-header"
        );
        assert_eq!(diagnostics[0].origin, "parseLibgdxAtlasSpritesheet");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
    }
}
