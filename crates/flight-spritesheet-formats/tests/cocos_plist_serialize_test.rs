use flight_spritesheet_formats::*;

use crate::support::*;

mod serialize_cocos_plist_spritesheet {
    use super::*;

    #[test]
    fn emits_exact_container_escaping_and_round_trips_rotated_geometry() {
        let mut data = sample_data();
        data.frames[0].name = "a&<b>.png".to_string();
        let xml = serialize_cocos_plist_spritesheet(&data, None);
        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(xml.ends_with("</plist>"));
        assert!(xml.contains("<key>a&amp;&lt;b&gt;.png</key>"));
        assert!(xml.contains("{{32,0},{20,40}}"));
        let round_trip = parse_cocos_plist_spritesheet(&xml, None);
        assert_eq!(round_trip.frames.len(), 2);
        assert!(round_trip.frames[1].rotated);
        assert_eq!(
            (round_trip.frames[1].width, round_trip.frames[1].height),
            (40.0, 20.0)
        );
        assert_eq!(round_trip.image_file, "atlas.png");
    }

    #[test]
    fn preserves_existing_format_and_image_fallback() {
        let existing = parse_cocos_plist_spritesheet_document(COCOS_PLIST, None).document;
        let mut data = sample_data();
        data.image_file.clear();
        let xml = serialize_cocos_plist_spritesheet(&data, Some(&existing));
        assert!(xml.contains("<integer>3</integer>"));
        assert!(xml.contains("<string>atlas.png</string>"));
    }
}
