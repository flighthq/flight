use flight_movieclip::contract::*;

mod get_spritesheet_timeline_source_unsupported_field_string {
    use super::*;

    #[test]
    fn maps_each_closed_field_to_its_source_name() {
        assert_eq!(
            get_spritesheet_timeline_source_unsupported_field_string(
                SpritesheetTimelineSourceUnsupportedField::FrameDurations
            ),
            "frameDurations"
        );
        assert_eq!(
            get_spritesheet_timeline_source_unsupported_field_string(
                SpritesheetTimelineSourceUnsupportedField::RepeatCount
            ),
            "repeatCount"
        );
    }
}

mod parse_spritesheet_timeline_source_unsupported_field {
    use super::*;

    #[test]
    fn parses_source_names_and_rejects_anything_else() {
        assert_eq!(
            parse_spritesheet_timeline_source_unsupported_field("frameDurations"),
            Some(SpritesheetTimelineSourceUnsupportedField::FrameDurations)
        );
        assert_eq!(
            parse_spritesheet_timeline_source_unsupported_field("repeatCount"),
            Some(SpritesheetTimelineSourceUnsupportedField::RepeatCount)
        );
        assert_eq!(
            parse_spritesheet_timeline_source_unsupported_field("direction"),
            None
        );
    }
}
