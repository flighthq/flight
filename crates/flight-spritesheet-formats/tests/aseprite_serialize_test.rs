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

    #[test]
    fn round_trips_source_hash_animation_and_array_rotation_facts() {
        let hash = parse_aseprite_spritesheet_document(ASEPRITE_HASH, None);
        let json = serialize_aseprite_spritesheet(&hash.data, Some(&hash.document), None);
        let round_trip = parse_aseprite_spritesheet(&json, None);
        assert_eq!(
            round_trip
                .frames
                .iter()
                .map(|frame| frame.name.as_str())
                .collect::<Vec<_>>(),
            [
                "sprite 0.aseprite",
                "sprite 1.aseprite",
                "sprite 2.aseprite",
                "sprite 3.aseprite"
            ]
        );
        assert_eq!(
            (round_trip.frames[2].x, round_trip.frames[2].offset_x),
            (64.0, 1.0)
        );
        assert_eq!(
            round_trip.animations[0].frame_durations,
            Some(vec![100.0, 150.0])
        );
        assert_eq!(round_trip.animations[1].name, "jump");
        assert_eq!(
            round_trip.animations[1].direction,
            flight_spritesheet::SpritesheetAnimationDirection::Reverse
        );

        let array = parse_aseprite_spritesheet_document(ASEPRITE_ARRAY, None);
        let json = serialize_aseprite_spritesheet(&array.data, Some(&array.document), None);
        let raw: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(raw["frames"].is_array());
        assert_eq!(raw["frames"][1]["frame"]["w"], 12);
        assert_eq!(raw["frames"][1]["frame"]["h"], 20);
        let round_trip = parse_aseprite_spritesheet(&json, None);
        assert!(round_trip.frames[1].rotated);
        assert_eq!(
            (round_trip.frames[1].width, round_trip.frames[1].height),
            (20.0, 12.0)
        );
        assert_eq!(round_trip.animations[0].frame_durations, None);
        assert_eq!(round_trip.animations[0].frame_duration, 80.0);
    }
}
