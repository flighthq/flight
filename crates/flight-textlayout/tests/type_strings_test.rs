use flight_textlayout::contract::*;

mod get_text_auto_size_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(get_text_auto_size_string(TextAutoSize::Center), "center");
        assert_eq!(get_text_auto_size_string(TextAutoSize::Left), "left");
        assert_eq!(get_text_auto_size_string(TextAutoSize::None), "none");
        assert_eq!(get_text_auto_size_string(TextAutoSize::Right), "right");
    }
}

mod get_text_justification_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(
            get_text_justification_string(TextJustification::InterCharacter),
            "interCharacter"
        );
        assert_eq!(
            get_text_justification_string(TextJustification::InterWord),
            "interWord"
        );
        assert_eq!(
            get_text_justification_string(TextJustification::None),
            "none"
        );
    }
}

mod get_text_vertical_align_string {
    use super::*;

    #[test]
    fn returns_every_current_exact_source_literal() {
        assert_eq!(
            get_text_vertical_align_string(TextVerticalAlign::Bottom),
            "bottom"
        );
        assert_eq!(
            get_text_vertical_align_string(TextVerticalAlign::Middle),
            "middle"
        );
        assert_eq!(
            get_text_vertical_align_string(TextVerticalAlign::Top),
            "top"
        );
    }
}

mod parse_text_auto_size {
    use super::*;

    #[test]
    fn accepts_every_literal_and_rejects_non_source_spellings() {
        assert_eq!(parse_text_auto_size("center"), Some(TextAutoSize::Center));
        assert_eq!(parse_text_auto_size("left"), Some(TextAutoSize::Left));
        assert_eq!(parse_text_auto_size("none"), Some(TextAutoSize::None));
        assert_eq!(parse_text_auto_size("right"), Some(TextAutoSize::Right));
        assert_eq!(parse_text_auto_size("Center"), None);
        assert_eq!(parse_text_auto_size(""), None);
    }
}

mod parse_text_justification {
    use super::*;

    #[test]
    fn accepts_every_literal_and_rejects_non_source_spellings() {
        assert_eq!(
            parse_text_justification("interCharacter"),
            Some(TextJustification::InterCharacter)
        );
        assert_eq!(
            parse_text_justification("interWord"),
            Some(TextJustification::InterWord)
        );
        assert_eq!(
            parse_text_justification("none"),
            Some(TextJustification::None)
        );
        assert_eq!(parse_text_justification("inter-word"), None);
        assert_eq!(parse_text_justification(""), None);
    }
}

mod parse_text_vertical_align {
    use super::*;

    #[test]
    fn accepts_current_literals_and_rejects_reserved_future_values() {
        assert_eq!(
            parse_text_vertical_align("bottom"),
            Some(TextVerticalAlign::Bottom)
        );
        assert_eq!(
            parse_text_vertical_align("middle"),
            Some(TextVerticalAlign::Middle)
        );
        assert_eq!(
            parse_text_vertical_align("top"),
            Some(TextVerticalAlign::Top)
        );
        assert_eq!(parse_text_vertical_align("baseline"), None);
        assert_eq!(parse_text_vertical_align("justify"), None);
    }
}
