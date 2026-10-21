use std::collections::HashMap;

use flight_log::{LogData, LogLevel, LogValue, log_once};

use crate::text_segment_guards::set_text_segment_guard;

/// Uninstalls the guard installed by enable_text_segment_guards.
pub fn disable_text_segment_guards() {
    set_text_segment_guard(None);
}

/// Installs an opt-in warning for use of the bundled capability where the
/// native segmenter is absent.
pub fn enable_text_segment_guards() {
    set_text_segment_guard(Some(warn_on_missing_intl_segmenter));
}

fn warn_on_missing_intl_segmenter() {
    let _ = log_once(
        "textsegment:intl-segmenter-unavailable",
        LogLevel::Warn,
        LogData::Record(HashMap::from([(
            "message".to_string(),
            LogValue::Str(
                "segmentGraphemes: Intl.Segmenter is unavailable and no replacement capability was supplied, so segmentation returned no results. Pass a HostTextSegmenterCapability with full Unicode coverage to the operation."
                    .to_string(),
            ),
        )]))
        .into(),
        Some("textsegment".to_string()),
    );
}
