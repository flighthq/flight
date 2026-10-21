use crate::common::empty_text_format;
use flight_textformat::contract::*;

mod get_text_format_align_string {
    use super::*;
    #[test]
    fn returns_each_exact_source_literal() {
        assert_eq!(
            get_text_format_align_string(TextFormatAlign::Center),
            "center"
        );
        assert_eq!(get_text_format_align_string(TextFormatAlign::End), "end");
        assert_eq!(
            get_text_format_align_string(TextFormatAlign::Justify),
            "justify"
        );
        assert_eq!(get_text_format_align_string(TextFormatAlign::Left), "left");
        assert_eq!(
            get_text_format_align_string(TextFormatAlign::Right),
            "right"
        );
        assert_eq!(
            get_text_format_align_string(TextFormatAlign::Start),
            "start"
        );
    }
}

mod get_text_format_list_marker_string {
    use super::*;
    #[test]
    fn returns_each_exact_source_literal() {
        assert_eq!(
            get_text_format_list_marker_string(TextFormatListMarker::Circle),
            "circle"
        );
        assert_eq!(
            get_text_format_list_marker_string(TextFormatListMarker::Decimal),
            "decimal"
        );
        assert_eq!(
            get_text_format_list_marker_string(TextFormatListMarker::Disc),
            "disc"
        );
        assert_eq!(
            get_text_format_list_marker_string(TextFormatListMarker::None),
            "none"
        );
        assert_eq!(
            get_text_format_list_marker_string(TextFormatListMarker::Square),
            "square"
        );
    }
}

mod parse_text_format_align {
    use super::*;
    #[test]
    fn accepts_every_literal_and_rejects_non_source_spellings() {
        assert_eq!(
            parse_text_format_align("center"),
            Some(TextFormatAlign::Center)
        );
        assert_eq!(parse_text_format_align("end"), Some(TextFormatAlign::End));
        assert_eq!(
            parse_text_format_align("justify"),
            Some(TextFormatAlign::Justify)
        );
        assert_eq!(parse_text_format_align("left"), Some(TextFormatAlign::Left));
        assert_eq!(
            parse_text_format_align("right"),
            Some(TextFormatAlign::Right)
        );
        assert_eq!(
            parse_text_format_align("start"),
            Some(TextFormatAlign::Start)
        );
        assert_eq!(parse_text_format_align(""), None);
        assert_eq!(parse_text_format_align("CENTER"), None);
        assert_eq!(parse_text_format_align(" center"), None);
        assert_eq!(parse_text_format_align("start "), None);
        assert_eq!(parse_text_format_align("unknown"), None);
    }
}

mod parse_text_format_list_marker {
    use super::*;
    #[test]
    fn accepts_every_literal_and_rejects_non_source_spellings() {
        assert_eq!(
            parse_text_format_list_marker("circle"),
            Some(TextFormatListMarker::Circle)
        );
        assert_eq!(
            parse_text_format_list_marker("decimal"),
            Some(TextFormatListMarker::Decimal)
        );
        assert_eq!(
            parse_text_format_list_marker("disc"),
            Some(TextFormatListMarker::Disc)
        );
        assert_eq!(
            parse_text_format_list_marker("none"),
            Some(TextFormatListMarker::None)
        );
        assert_eq!(
            parse_text_format_list_marker("square"),
            Some(TextFormatListMarker::Square)
        );
        assert_eq!(parse_text_format_list_marker(""), None);
        assert_eq!(parse_text_format_list_marker("CIRCLE"), None);
        assert_eq!(parse_text_format_list_marker(" circle"), None);
        assert_eq!(parse_text_format_list_marker("square "), None);
        assert_eq!(parse_text_format_list_marker("unknown"), None);
    }
}

mod text_format_fields {
    use super::*;

    #[test]
    fn preserves_absence_for_every_optional_field() {
        let format = empty_text_format();
        assert!(format.align.is_none());
        assert!(format.block_indent.is_none());
        assert!(format.bold.is_none());
        assert!(format.bullet.is_none());
        assert!(format.color.is_none());
        assert!(format.font.is_none());
        assert!(format.indent.is_none());
        assert!(format.italic.is_none());
        assert!(format.kerning.is_none());
        assert!(format.leading.is_none());
        assert!(format.left_margin.is_none());
        assert!(format.letter_spacing.is_none());
        assert!(format.list_marker.is_none());
        assert!(format.right_margin.is_none());
        assert!(format.size.is_none());
        assert!(format.strikethrough.is_none());
        assert!(format.tab_stops.is_none());
        assert!(format.target.is_none());
        assert!(format.underline.is_none());
        assert!(format.url.is_none());
        assert!(format.variations.is_none());
    }

    #[test]
    fn distinguishes_absence_from_explicit_false_zero_and_empty_values() {
        let absent = empty_text_format();
        let mut explicit = empty_text_format();
        explicit.bold = Some(false);
        explicit.bullet = Some(false);
        explicit.italic = Some(false);
        explicit.kerning = Some(false);
        explicit.strikethrough = Some(false);
        explicit.underline = Some(false);
        explicit.size = Some(0.0);
        explicit.block_indent = Some(0.0);
        explicit.indent = Some(0.0);
        explicit.leading = Some(0.0);
        explicit.left_margin = Some(0.0);
        explicit.right_margin = Some(0.0);
        explicit.letter_spacing = Some(0.0);
        explicit.color = Some(0);
        explicit.font = Some(String::new());
        explicit.target = Some(String::new());
        explicit.url = Some(String::new());
        explicit.tab_stops = Some(vec![]);
        explicit.variations = Some(vec![]);
        explicit.align = Some(TextFormatAlign::Start);
        explicit.list_marker = Some(TextFormatListMarker::None);
        assert_ne!(explicit, absent);
        assert_eq!(explicit.bold, Some(false));
        assert_eq!(explicit.kerning, Some(false));
        assert_eq!(explicit.size, Some(0.0));
        assert_eq!(explicit.color, Some(0));
        assert_eq!(explicit.font.as_deref(), Some(""));
        assert_eq!(explicit.target.as_deref(), Some(""));
        assert_eq!(explicit.url.as_deref(), Some(""));
        assert_eq!(explicit.tab_stops, Some(vec![]));
        assert_eq!(explicit.variations, Some(vec![]));
        assert_eq!(explicit.list_marker, Some(TextFormatListMarker::None));
    }

    #[test]
    fn keeps_plain_tab_stop_and_variation_order_without_deduplication() {
        let mut format = empty_text_format();
        format.tab_stops = Some(vec![24.0, 8.0, 24.0]);
        format.variations = Some(vec![
            FontVariation {
                axis: FONT_VARIATION_WEIGHT.to_string(),
                value: 400.0,
            },
            FontVariation {
                axis: FONT_VARIATION_WIDTH.to_string(),
                value: 125.0,
            },
            FontVariation {
                axis: FONT_VARIATION_WEIGHT.to_string(),
                value: 450.0,
            },
        ]);
        let stops: &Vec<f32> = format.tab_stops.as_ref().unwrap();
        assert_eq!(stops, &[24.0, 8.0, 24.0]);
        let variations = format.variations.as_ref().unwrap();
        assert_eq!(variations[0].axis, "wght");
        assert_eq!(variations[1].axis, "wdth");
        assert_eq!(variations[2].axis, "wght");
        assert_eq!(variations[2].value, 450.0);
    }

    #[test]
    fn preserves_the_full_packed_rgba_integer_domain() {
        let mut format = empty_text_format();
        format.color = Some(0xF01020FFu32);
        let color: u32 = format.color.unwrap();
        assert_eq!(color >> 24, 0xF0);
        assert_eq!(color & 0xFF, 0xFF);
        format.color = Some(u32::MAX);
        assert_eq!(format.color, Some(0xFFFF_FFFF));
    }
}
