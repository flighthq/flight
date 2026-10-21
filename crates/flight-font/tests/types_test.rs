use flight_font::contract::*;

mod font_contract_types {
    use std::sync::Arc;

    use super::*;

    #[test]
    fn keeps_font_variation_axes_as_exact_plain_data() {
        let axis = FontVariationAxis {
            default_value: 400.0,
            max: 900.0,
            min: 100.0,
            name: "Weight".to_string(),
            tag: "wght".to_string(),
        };
        assert_eq!(axis.default_value, 400.0);
        assert_eq!(axis.max, 900.0);
        assert_eq!(axis.min, 100.0);
        assert_eq!(axis.name, "Weight");
        assert_eq!(axis.tag, "wght");
    }

    #[test]
    fn keeps_font_weight_number_and_string_arms_named() {
        let numeric =
            GlyphRasterizeFontWeight::Number(GlyphRasterizeFontWeightNumber { value: 650.0 });
        let named = GlyphRasterizeFontWeight::String(GlyphRasterizeFontWeightString {
            value: "bold".to_string(),
        });
        assert_eq!(
            numeric,
            GlyphRasterizeFontWeight::Number(GlyphRasterizeFontWeightNumber { value: 650.0 })
        );
        assert_eq!(
            named,
            GlyphRasterizeFontWeight::String(GlyphRasterizeFontWeightString {
                value: "bold".to_string(),
            })
        );
    }

    #[test]
    fn keeps_measure_metrics_optional_and_provider_identity_explicit() {
        let provider = Arc::new(()) as flight_hostcapability::ProviderRef;
        let capability = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: provider.clone(),
            rasterize: Arc::new(|_code_point, _options| None),
        };
        assert!(capability.measure_metrics.is_none());
        assert!(Arc::ptr_eq(&capability.provider, &provider));
    }

    #[test]
    fn owns_glyph_pixels_as_the_canonical_fixed_byte_array() {
        let bitmap = GlyphRasterizedBitmap {
            advance: 4.0,
            bearing_x: -1,
            bearing_y: 3,
            height: 1,
            pixels: vec![255, 255, 255, 128].into_boxed_slice(),
            width: 1,
        };
        assert_eq!(&*bitmap.pixels, &[255, 255, 255, 128]);
    }
}

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
