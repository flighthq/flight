use flight_entity::{entries, get_record_value};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_spritesheet_formats::*;

use crate::support::*;

mod parse_cocos_plist_spritesheet {
    use super::*;

    #[test]
    fn maps_ordered_frames_geometry_rotation_and_metadata() {
        let data = parse_cocos_plist_spritesheet(COCOS_PLIST, None);
        assert_eq!(
            data.frames
                .iter()
                .map(|frame| frame.name.as_str())
                .collect::<Vec<_>>(),
            ["hero.png", "coin.png"]
        );
        assert_eq!(
            (
                data.frames[0].x,
                data.frames[0].width,
                data.frames[0].height
            ),
            (0.0, 64.0, 64.0)
        );
        assert!(data.frames[1].rotated);
        assert_eq!((data.frames[1].width, data.frames[1].height), (64.0, 32.0));
        assert_eq!(
            (data.frames[1].offset_x, data.frames[1].offset_y),
            (1.0, 2.0)
        );
        assert_eq!(
            (data.frames[1].source_width, data.frames[1].source_height),
            (70.0, 40.0)
        );
        assert_eq!(
            (
                data.image_file.as_str(),
                data.image_width,
                data.image_height,
                data.scale
            ),
            ("atlas.png", 256.0, 128.0, 1.0)
        );
        assert!(data.animations.is_empty());
    }

    #[test]
    fn drops_unrecognized_frames_with_structured_detail() {
        let xml = r#"<plist><dict><key>frames</key><dict><key>bad.png</key><dict><key>unknown</key><string>x</string></dict></dict></dict></plist>"#;
        let mut diagnostics = Vec::new();
        let data = parse_cocos_plist_spritesheet(xml, Some(&mut diagnostics));
        assert!(data.frames.is_empty());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].kind,
            "spritesheet.cocos-plist.unrecognized-frame"
        );
        assert_eq!(diagnostics[0].origin, "parseCocosPlistXml");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("frame"),
            Some(&ImportDiagnosticDetailValue::String("bad.png".to_string()))
        );
    }

    #[test]
    fn well_formed_plist_reports_no_diagnostics() {
        let mut diagnostics = Vec::new();
        let data = parse_cocos_plist_spritesheet(COCOS_PLIST, Some(&mut diagnostics));
        assert_eq!(data.frames.len(), 2);
        assert!(diagnostics.is_empty());
    }
}

mod parse_cocos_plist_spritesheet_document {
    use super::*;

    #[test]
    fn returns_data_and_the_ordered_normalized_document() {
        let parsed = parse_cocos_plist_spritesheet_document(COCOS_PLIST, None);
        assert_eq!(parsed.data.frames.len(), 2);
        assert_eq!(parsed.document.metadata.format, 3);
        assert_eq!(parsed.document.metadata.texture_file_name, "atlas.png");
        assert_eq!(entries(&parsed.document.frames)[0].0, "hero.png");
        assert_eq!(
            get_record_value(&parsed.document.frames, "coin.png")
                .unwrap()
                .sprite_offset,
            "{1,2}"
        );
    }
}
