//! Structural adapter for the shared `MarkupTagResult` contract.

use crate::types::{MarkupTagEffect, MarkupTagResult};
use flight_textformat::TextFormat;

/// Normalizes a handler's structural union to the effect shape consumed by the parser.
pub fn normalize_markup_tag_result(result: MarkupTagResult) -> MarkupTagEffect {
    return match result {
        MarkupTagResult::Effect(effect) => effect,
        MarkupTagResult::Format(format) => {
            let fallback_format: TextFormat = format;
            MarkupTagEffect {
                break_before: None,
                format: Some(fallback_format),
                text: None,
            }
        }
    };
}
