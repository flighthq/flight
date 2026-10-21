use std::sync::Arc;

use flight_hostcapability::BackendOperationExplanationLayer;
use flight_textshaper::contract::*;

use crate::text_shaper_fixture::*;

const OPTIONAL_OPERATIONS: [TextShaperOperation; 6] = [
    TextShaperOperation::GetCodePointForGlyph,
    TextShaperOperation::GetFontMetrics,
    TextShaperOperation::GetGlyphExtents,
    TextShaperOperation::GetGlyphIndexForCodePoint,
    TextShaperOperation::GetGlyphName,
    TextShaperOperation::ShapeRun,
];

fn with_operation(operation: TextShaperOperation) -> HostTextShaperCapability {
    let mut host = advances_only(|_| 0.0);
    match operation {
        TextShaperOperation::GetCodePointForGlyph => {
            host.get_code_point_for_glyph = Some(Arc::new(|_| 0))
        }
        TextShaperOperation::GetFontMetrics => host.get_font_metrics = Some(Arc::new(|_| None)),
        TextShaperOperation::GetGlyphExtents => host.get_glyph_extents = Some(Arc::new(|_| None)),
        TextShaperOperation::GetGlyphIndexForCodePoint => {
            host.get_glyph_index_for_code_point = Some(Arc::new(|_| 0))
        }
        TextShaperOperation::GetGlyphName => {
            host.get_glyph_name = Some(Arc::new(|_| String::new()))
        }
        TextShaperOperation::MeasureText => {}
        TextShaperOperation::ShapeRun => {
            host.shape_run = Some(Arc::new(|_, _, _| create_shaped_run()))
        }
    }
    return host;
}

mod explain_text_shaper_operation {
    use super::*;

    #[test]
    fn reports_an_operation_the_backend_provides() {
        for operation in OPTIONAL_OPERATIONS {
            let explanation = explain_text_shaper_operation(&with_operation(operation), operation);
            assert!(explanation.implemented);
            assert_eq!(explanation.layer, BackendOperationExplanationLayer::Host);
            assert_eq!(
                explanation.operation,
                get_text_shaper_operation_string(operation)
            );
        }
    }

    #[test]
    fn reports_none_when_the_backend_does_not_provide_the_operation() {
        for operation in OPTIONAL_OPERATIONS {
            let explanation = explain_text_shaper_operation(&advances_only(|_| 0.0), operation);
            assert!(!explanation.implemented);
            assert_eq!(explanation.layer, BackendOperationExplanationLayer::None);
            assert_eq!(
                explanation.operation,
                get_text_shaper_operation_string(operation)
            );
        }
    }

    #[test]
    fn always_reports_the_required_measure_text() {
        let explanation = explain_text_shaper_operation(
            &advances_only(|_| 0.0),
            TextShaperOperation::MeasureText,
        );
        assert!(explanation.implemented);
        assert_eq!(explanation.operation, "measureText");
    }
}

mod get_text_direction_string {
    use super::*;

    #[test]
    fn round_trips_every_direction() {
        for (value, text) in [
            (TextDirection::LeftToRight, "LeftToRight"),
            (TextDirection::RightToLeft, "RightToLeft"),
            (TextDirection::TopToBottom, "TopToBottom"),
        ] {
            assert_eq!(get_text_direction_string(value), text);
            assert_eq!(parse_text_direction(text), Some(value));
        }
    }
}

mod get_text_shaper_operation_string {
    use super::*;

    #[test]
    fn round_trips_every_operation_name() {
        for (value, text) in [
            (
                TextShaperOperation::GetCodePointForGlyph,
                "getCodePointForGlyph",
            ),
            (TextShaperOperation::GetFontMetrics, "getFontMetrics"),
            (TextShaperOperation::GetGlyphExtents, "getGlyphExtents"),
            (
                TextShaperOperation::GetGlyphIndexForCodePoint,
                "getGlyphIndexForCodePoint",
            ),
            (TextShaperOperation::GetGlyphName, "getGlyphName"),
            (TextShaperOperation::MeasureText, "measureText"),
            (TextShaperOperation::ShapeRun, "shapeRun"),
        ] {
            assert_eq!(get_text_shaper_operation_string(value), text);
            assert_eq!(parse_text_shaper_operation(text), Some(value));
        }
    }
}

mod has_text_shaper_operation {
    use super::*;

    #[test]
    fn agrees_with_explain_text_shaper_operation_for_every_optional_operation() {
        for host in [
            advances_only(|_| 0.0),
            with_operation(TextShaperOperation::ShapeRun),
        ] {
            for operation in OPTIONAL_OPERATIONS {
                assert_eq!(
                    has_text_shaper_operation(&host, operation),
                    explain_text_shaper_operation(&host, operation).implemented
                );
            }
        }
    }
}

mod measure_text {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        assert_eq!(
            measure_text(
                &advances_only(|text| text.len() as f32 * 7.0),
                "abc",
                &format()
            ),
            21.0
        );
    }

    #[test]
    fn isolates_callers_that_interleave_different_backends() {
        let (first, second) = (advances_only(|_| 1.0), advances_only(|_| 2.0));
        assert_eq!(measure_text(&first, "x", &format()), 1.0);
        assert_eq!(measure_text(&second, "x", &format()), 2.0);
        assert_eq!(measure_text(&first, "x", &format()), 1.0);
    }

    #[test]
    fn hands_the_backend_the_text_and_format() {
        let mut host = advances_only(|_| 0.0);
        host.measure_text = Arc::new(|text, format| text.len() as f32 + format.size.unwrap_or(0.0));
        assert_eq!(measure_text(&host, "ab", &sized(10.0)), 12.0);
    }
}

mod parse_text_direction {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_text_direction("ltr"), None);
    }
}

mod parse_text_shaper_operation {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_text_shaper_operation("ShapeRun"), None);
    }
}
