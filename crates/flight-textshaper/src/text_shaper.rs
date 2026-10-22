use flight_host::{BackendOperationExplanation, BackendOperationExplanationLayer};
use flight_textformat::TextFormat;

use crate::types::*;

/// Whether the host provides `operation`: `implemented` with the host layer, or not implemented with
/// no layer. `measure_text` is required, so it is always implemented.
pub fn explain_text_shaper_operation(
    host_text_shaper: &HostTextShaperCapability,
    operation: TextShaperOperation,
) -> BackendOperationExplanation {
    let implemented = match operation {
        TextShaperOperation::GetCodePointForGlyph => {
            host_text_shaper.get_code_point_for_glyph.is_some()
        }
        TextShaperOperation::GetFontMetrics => host_text_shaper.get_font_metrics.is_some(),
        TextShaperOperation::GetGlyphExtents => host_text_shaper.get_glyph_extents.is_some(),
        TextShaperOperation::GetGlyphIndexForCodePoint => {
            host_text_shaper.get_glyph_index_for_code_point.is_some()
        }
        TextShaperOperation::GetGlyphName => host_text_shaper.get_glyph_name.is_some(),
        TextShaperOperation::MeasureText => true,
        TextShaperOperation::ShapeRun => host_text_shaper.shape_run.is_some(),
    };
    return BackendOperationExplanation {
        implemented,
        layer: if implemented {
            BackendOperationExplanationLayer::Host
        } else {
            BackendOperationExplanationLayer::None
        },
        operation: get_text_shaper_operation_string(operation).to_string(),
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TextDirection string union; the TS package exports no get_/parse_ free functions
pub fn get_text_direction_string(value: TextDirection) -> &'static str {
    return match value {
        TextDirection::LeftToRight => "LeftToRight",
        TextDirection::RightToLeft => "RightToLeft",
        TextDirection::TopToBottom => "TopToBottom",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TextShaperOperation (keyof HostTextShaperCapability) union; the TS package exports no get_/parse_ free functions
pub fn get_text_shaper_operation_string(value: TextShaperOperation) -> &'static str {
    return match value {
        TextShaperOperation::GetCodePointForGlyph => "getCodePointForGlyph",
        TextShaperOperation::GetFontMetrics => "getFontMetrics",
        TextShaperOperation::GetGlyphExtents => "getGlyphExtents",
        TextShaperOperation::GetGlyphIndexForCodePoint => "getGlyphIndexForCodePoint",
        TextShaperOperation::GetGlyphName => "getGlyphName",
        TextShaperOperation::MeasureText => "measureText",
        TextShaperOperation::ShapeRun => "shapeRun",
    };
}

pub fn has_text_shaper_operation(
    host_text_shaper: &HostTextShaperCapability,
    operation: TextShaperOperation,
) -> bool {
    return explain_text_shaper_operation(host_text_shaper, operation).implemented;
}

/// The host's horizontal advance, in pixels, of `text` in `format`.
pub fn measure_text(
    host_text_shaper: &HostTextShaperCapability,
    text: &str,
    format: &TextFormat,
) -> f32 {
    return (host_text_shaper.measure_text)(text, format);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TextDirection string union; the TS package exports no get_/parse_ free functions
pub fn parse_text_direction(value: &str) -> Option<TextDirection> {
    return match value {
        "LeftToRight" => Some(TextDirection::LeftToRight),
        "RightToLeft" => Some(TextDirection::RightToLeft),
        "TopToBottom" => Some(TextDirection::TopToBottom),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TextShaperOperation (keyof HostTextShaperCapability) union; the TS package exports no get_/parse_ free functions
pub fn parse_text_shaper_operation(value: &str) -> Option<TextShaperOperation> {
    return match value {
        "getCodePointForGlyph" => Some(TextShaperOperation::GetCodePointForGlyph),
        "getFontMetrics" => Some(TextShaperOperation::GetFontMetrics),
        "getGlyphExtents" => Some(TextShaperOperation::GetGlyphExtents),
        "getGlyphIndexForCodePoint" => Some(TextShaperOperation::GetGlyphIndexForCodePoint),
        "getGlyphName" => Some(TextShaperOperation::GetGlyphName),
        "measureText" => Some(TextShaperOperation::MeasureText),
        "shapeRun" => Some(TextShaperOperation::ShapeRun),
        _ => None,
    };
}
