use flight_spritesheet_formats::*;

use crate::support::*;

mod serialize_texture_packer_spritesheet {
    use super::*;

    #[test]
    fn emits_valid_hash_and_round_trips_geometry_pivots_metadata_and_tags() {
        let data = sample_data();
        let json = serialize_texture_packer_spritesheet(&data, None, None);
        let raw: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(raw["frames"].is_object());
        assert_eq!(
            raw["meta"]["app"],
            "https://www.codeandweb.com/texturepacker"
        );
        assert_eq!(raw["meta"]["frameTags"][0]["name"], "hero");
        assert_eq!(raw["frames"]["hero_0.png"]["pivot"]["x"], 0.5);
        assert_eq!(raw["frames"]["hero_1.png"]["frame"]["w"], 20);
        assert_eq!(raw["frames"]["hero_1.png"]["frame"]["h"], 40);
        let round_trip = parse_texture_packer_spritesheet(&json, None);
        assert_eq!(round_trip.frames.len(), 2);
        assert_eq!(
            (round_trip.frames[0].pivot_x, round_trip.frames[0].pivot_y),
            (Some(0.5), Some(1.0))
        );
        assert_eq!(
            (round_trip.frames[1].width, round_trip.frames[1].height),
            (40.0, 20.0)
        );
        assert_eq!(round_trip.animations[0].name, "hero");
    }

    #[test]
    fn selects_array_by_option_or_existing_and_omits_empty_tags() {
        let data = sample_data();
        let existing =
            parse_texture_packer_spritesheet_document(TEXTURE_PACKER_ARRAY, None).document;
        let json = serialize_texture_packer_spritesheet(&data, Some(&existing), None);
        assert!(serde_json::from_str::<serde_json::Value>(&json).unwrap()["frames"].is_array());
        let json = serialize_texture_packer_spritesheet(
            &data,
            None,
            Some(&TexturePackerSerializeOptions {
                variant: Some(SpritesheetDocumentVariant::Array),
            }),
        );
        assert!(serde_json::from_str::<serde_json::Value>(&json).unwrap()["frames"].is_array());
        let mut empty = sample_data();
        empty.animations.clear();
        let raw: serde_json::Value =
            serde_json::from_str(&serialize_texture_packer_spritesheet(&empty, None, None))
                .unwrap();
        assert!(raw["meta"].get("frameTags").is_none());
    }

    #[test]
    fn round_trips_source_hash_positions_metadata_and_array_rotation() {
        let hash = parse_texture_packer_spritesheet_document(TEXTURE_PACKER_HASH, None);
        let json = serialize_texture_packer_spritesheet(&hash.data, Some(&hash.document), None);
        let round_trip = parse_texture_packer_spritesheet(&json, None);
        assert_eq!(
            (
                round_trip.image_file.as_str(),
                round_trip.image_width,
                round_trip.image_height
            ),
            ("atlas.png", 256.0, 128.0)
        );
        assert_eq!(
            round_trip
                .frames
                .iter()
                .map(|frame| frame.name.as_str())
                .collect::<Vec<_>>(),
            ["hero/idle_0.png", "hero/idle_1.png", "fx/spark.png"]
        );
        assert_eq!((round_trip.frames[0].x, round_trip.frames[0].y), (0.0, 0.0));
        assert_eq!(
            (round_trip.frames[0].pivot_x, round_trip.frames[0].pivot_y),
            (Some(0.5), Some(1.0))
        );
        assert_eq!(round_trip.animations[0].name, "idle");

        let array = parse_texture_packer_spritesheet_document(TEXTURE_PACKER_ARRAY, None);
        let json = serialize_texture_packer_spritesheet(&array.data, Some(&array.document), None);
        let raw: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(raw["frames"].is_array());
        assert_eq!(raw["frames"][1]["frame"]["w"], 20);
        assert_eq!(raw["frames"][1]["frame"]["h"], 40);
        let frame = &parse_texture_packer_spritesheet(&json, None).frames[1];
        assert_eq!((frame.width, frame.height), (40.0, 20.0));
    }
}
