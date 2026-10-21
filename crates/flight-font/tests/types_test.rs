use flight_font::contract::*;

mod get_glyph_rasterizer_operation_string {
    use super::*;

    #[test]
    fn returns_exact_contract_strings() {
        assert_eq!(
            get_glyph_rasterizer_operation_string(GlyphRasterizerOperation::MeasureMetrics),
            "measureMetrics"
        );
        assert_eq!(
            get_glyph_rasterizer_operation_string(GlyphRasterizerOperation::Rasterize),
            "rasterize"
        );
    }
}

mod parse_glyph_rasterizer_operation {
    use super::*;

    #[test]
    fn parses_only_exact_contract_strings() {
        assert_eq!(
            parse_glyph_rasterizer_operation("measureMetrics"),
            Some(GlyphRasterizerOperation::MeasureMetrics)
        );
        assert_eq!(parse_glyph_rasterizer_operation("measure_metrics"), None);
    }
}
