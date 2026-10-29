use crate::common::*;
use flight_text::contract::*;

mod compute_text_format_font_string {
    use super::*;

    #[test]
    fn returns_a_css_font_string_from_format_properties() {
        let mut format = empty_text_format();
        format.size = Some(16.0);
        format.font = Some("Arial".to_string());
        format.bold = Some(false);
        format.italic = Some(false);
        assert_eq!(
            compute_text_format_font_string(&format),
            "normal normal 16px Arial"
        );
    }

    #[test]
    fn includes_bold_and_italic_when_set() {
        let mut format = empty_text_format();
        format.size = Some(12.0);
        format.font = Some("sans-serif".to_string());
        format.bold = Some(true);
        format.italic = Some(true);
        assert_eq!(
            compute_text_format_font_string(&format),
            "italic bold 12px sans-serif"
        );
    }

    #[test]
    fn uses_defaults_when_size_and_font_are_omitted() {
        assert_eq!(
            compute_text_format_font_string(&empty_text_format()),
            "normal normal 12px sans-serif"
        );
    }

    #[test]
    fn uses_italic_style_when_italic_is_true() {
        let mut format = empty_text_format();
        format.italic = Some(true);
        assert!(compute_text_format_font_string(&format).starts_with("italic "));
    }

    #[test]
    fn uses_bold_weight_when_bold_is_true() {
        let mut format = empty_text_format();
        format.bold = Some(true);
        assert!(compute_text_format_font_string(&format).contains(" bold "));
    }
}
