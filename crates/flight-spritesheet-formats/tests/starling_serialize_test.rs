use flight_spritesheet_formats::*;

use crate::support::*;

mod serialize_starling_spritesheet {
    use super::*;

    #[test]
    fn emits_stable_attribute_order_and_round_trips_geometry_pivots_and_rotation() {
        let data = sample_data();
        let xml = serialize_starling_spritesheet(&data, None);
        assert!(xml.contains("<TextureAtlas imagePath=\"atlas.png\">"));
        assert!(xml.contains("name=\"hero_0.png\" x=\"0\" y=\"0\" width=\"32\" height=\"32\" pivotX=\"16\" pivotY=\"32\""));
        assert!(xml.contains("name=\"hero_1.png\" x=\"32\" y=\"0\" width=\"20\" height=\"40\" frameX=\"-1\" frameY=\"-2\" frameWidth=\"44\" frameHeight=\"24\" rotated=\"true\""));
        let round_trip = parse_starling_spritesheet(
            &xml,
            Some(&StarlingParseOptions {
                frame_duration: None,
                image_height: Some(128.0),
                image_width: Some(256.0),
            }),
            None,
        );
        assert_eq!(
            (round_trip.frames[0].pivot_x, round_trip.frames[0].pivot_y),
            (Some(0.5), Some(1.0))
        );
        assert!(round_trip.frames[1].rotated);
        assert_eq!(
            (round_trip.frames[1].width, round_trip.frames[1].height),
            (40.0, 20.0)
        );
    }

    #[test]
    fn uses_existing_image_when_data_image_is_empty() {
        let existing = parse_starling_spritesheet_document(
            STARLING_XML,
            Some(&StarlingParseOptions {
                frame_duration: None,
                image_height: Some(1.0),
                image_width: Some(1.0),
            }),
            None,
        )
        .document;
        let mut data = sample_data();
        data.image_file.clear();
        assert!(
            serialize_starling_spritesheet(&data, Some(&existing))
                .contains("imagePath=\"atlas.png\"")
        );
    }

    #[test]
    fn emits_well_formed_minimal_xml_without_unneeded_optional_attributes() {
        let minimal = "<TextureAtlas imagePath=\"mini.png\"><SubTexture name=\"tile\" x=\"0\" y=\"0\" width=\"8\" height=\"8\"/></TextureAtlas>";
        let data = parse_starling_spritesheet(minimal, None, None);
        let xml = serialize_starling_spritesheet(&data, None);
        assert!(xml.contains("<TextureAtlas imagePath=\"mini.png\">"));
        assert!(xml.contains("<SubTexture"));
        assert!(xml.contains("</TextureAtlas>"));
        assert!(!xml.contains("frameX"));
        assert!(!xml.contains("pivotX"));
        assert!(!xml.contains("rotated"));
        assert_eq!(parse_starling_spritesheet(&xml, None, None).frames.len(), 1);
    }
}
