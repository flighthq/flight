use flight_textformat::*;

mod font_variation {
    use super::*;
    #[test]
    fn preserves_custom_axis_spelling_and_the_given_value() {
        let variation = FontVariation {
            axis: "XTRA".to_string(),
            value: -12.5,
        };
        assert_eq!(variation.axis, "XTRA");
        assert_eq!(variation.value, -12.5);
    }
}

mod font_variation_constants {
    use super::*;
    #[test]
    fn uses_all_five_exact_source_tags() {
        assert_eq!(FONT_VARIATION_ITALIC, "ital");
        assert_eq!(FONT_VARIATION_OPTICAL_SIZE, "opsz");
        assert_eq!(FONT_VARIATION_SLANT, "slnt");
        assert_eq!(FONT_VARIATION_WEIGHT, "wght");
        assert_eq!(FONT_VARIATION_WIDTH, "wdth");
    }
}
