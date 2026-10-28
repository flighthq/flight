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
        assert_eq!(FontVariationItalic, "ital");
        assert_eq!(FontVariationOpticalSize, "opsz");
        assert_eq!(FontVariationSlant, "slnt");
        assert_eq!(FontVariationWeight, "wght");
        assert_eq!(FontVariationWidth, "wdth");
    }
}
