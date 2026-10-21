use flight_spritesheet_formats::*;

use crate::support::*;

mod serialize_aseprite_spritesheet {
    use super::*;

    #[test]
    fn emits_valid_ordered_hash_and_round_trips_all_spritesheet_fields() {
        let data = sample_data();
        let json = serialize_aseprite_spritesheet(&data, None, None);
        let raw: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(raw["frames"].is_object());
        assert_eq!(raw["meta"]["app"], "https://www.aseprite.org/");
        assert_eq!(raw["meta"]["frameTags"][0]["name"], "hero");
        assert_eq!(raw["frames"]["hero_1.png"]["frame"]["w"], 20);
        assert_eq!(raw["frames"]["hero_1.png"]["frame"]["h"], 40);
        let round_trip = parse_aseprite_spritesheet(&json, None);
        assert_eq!(round_trip.frames.len(), 2);
        assert_eq!(
            (round_trip.frames[1].width, round_trip.frames[1].height),
            (40.0, 20.0)
        );
        assert_eq!(
            (round_trip.frames[1].offset_x, round_trip.frames[1].offset_y),
            (1.0, 2.0)
        );
        assert_eq!(
            round_trip.animations[0].frame_durations,
            Some(vec![100.0, 150.0])
        );
    }

    #[test]
    fn selects_array_by_option_or_existing_and_preserves_existing_layers_and_colors() {
        let data = sample_data();
        let existing = parse_aseprite_spritesheet_document(ASEPRITE_ARRAY, None).document;
        let json = serialize_aseprite_spritesheet(&data, Some(&existing), None);
        assert!(serde_json::from_str::<serde_json::Value>(&json).unwrap()["frames"].is_array());
        let hash_existing = parse_aseprite_spritesheet_document(ASEPRITE_HASH, None).document;
        let json = serialize_aseprite_spritesheet(
            &data,
            Some(&hash_existing),
            Some(&AsepriteSerializeOptions {
                variant: Some(SpritesheetDocumentVariant::Array),
            }),
        );
        let raw: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(raw["frames"].is_array());
        assert_eq!(raw["meta"]["layers"][0]["name"], "Layer 1");
    }
}
