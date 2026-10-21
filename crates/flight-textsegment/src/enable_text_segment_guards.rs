use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::text_segment_guards::set_text_segment_guard;
use crate::types::TextSegmentGuard;

/// Uninstalls the guard installed by enable_text_segment_guards.
pub fn disable_text_segment_guards() {
    set_text_segment_guard(None);
}

/// Installs an opt-in warning for use of the bundled capability where the
/// native segmenter is absent.
// flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned log state and clock replace hidden process state
pub fn enable_text_segment_guards(
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: TextSegmentGuard = Arc::new(move || {
        warn_on_missing_intl_segmenter(&log_state, clock());
    });
    set_text_segment_guard(Some(guard));
}

// flight-lint: allow(f64) D0: operation time is a millisecond timestamp
fn warn_on_missing_intl_segmenter(log_state: &LogStateRef, now_ms: f64) {
    let _ = log_once(
        log_state,
        now_ms,
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
