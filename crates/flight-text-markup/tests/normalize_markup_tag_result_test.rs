use flight_text_markup::contract::*;
use flight_textformat::TextFormat;

fn bold_text_format() -> TextFormat {
    return TextFormat {
        align: None,
        block_indent: None,
        bold: Some(true),
        bullet: None,
        color: None,
        font: None,
        indent: None,
        italic: None,
        kerning: None,
        leading: None,
        left_margin: None,
        letter_spacing: None,
        list_marker: None,
        right_margin: None,
        size: None,
        strikethrough: None,
        tab_stops: None,
        target: None,
        underline: None,
        url: None,
        variations: None,
    };
}

mod normalize_markup_tag_result {
    use super::*;

    #[test]
    fn preserves_effects_and_wraps_bare_formats() {
        let effect = MarkupTagEffect {
            break_before: Some(true),
            format: None,
            text: Some("\n".to_string()),
        };
        assert_eq!(
            normalize_markup_tag_result(MarkupTagResult::Effect(effect.clone())),
            effect
        );

        let format = bold_text_format();
        let normalized = normalize_markup_tag_result(MarkupTagResult::Format(format.clone()));
        assert_eq!(normalized.break_before, None);
        assert_eq!(normalized.format, Some(format));
        assert_eq!(normalized.text, None);
    }
}
