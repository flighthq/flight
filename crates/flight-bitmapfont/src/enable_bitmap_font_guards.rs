use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::bitmap_font::set_bitmap_font_guard;
use crate::bitmap_font_strings::get_bitmap_font_guard_log_key_string;
use crate::types::*;

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn disable_bitmap_font_guards(guard_state: &BitmapFontGuardStateRef) {
    set_bitmap_font_guard(guard_state, None);
}

/// Installs the exact source-data repair warning with caller-owned logging and a live clock.
// flight-lint: allow(conform-params) D5: caller-owned guard and LogState plus a live clock replace module state and ambient time
pub fn enable_bitmap_font_guards(
    guard_state: &BitmapFontGuardStateRef,
    log_state: &LogStateRef,
    clock: BitmapFontClock,
) {
    let log_state = log_state.clone();
    let guard: BitmapFontGuard = Arc::new(move |reason, codepoint, page| {
        warn_on_bitmap_font_repair(&log_state, &clock, reason, codepoint, page);
    });
    set_bitmap_font_guard(guard_state, Some(guard));
}

fn format_codepoint(codepoint: u32) -> String {
    return format!("U+{codepoint:04X}");
}

// flight-lint: allow(f64) injected operation timestamps pass through to the canonical log contract
fn log_bitmap_font_guard_message(
    log_state: &LogStateRef,
    now_ms: f64,
    key: BitmapFontGuardLogKey,
    message: String,
) {
    let data = LogData::Record(HashMap::from([(
        "message".to_string(),
        LogValue::Str(message),
    )]));
    let _ = log_once(
        log_state,
        now_ms,
        get_bitmap_font_guard_log_key_string(key),
        LogLevel::Warn,
        data.into(),
        Some("bitmapfont".to_string()),
    );
}

fn warn_on_bitmap_font_repair(
    log_state: &LogStateRef,
    clock: &BitmapFontClock,
    reason: BitmapFontGuardReason,
    codepoint: u32,
    page: i32,
) {
    match reason {
        BitmapFontGuardReason::PageOutOfRange => log_bitmap_font_guard_message(
            log_state,
            clock(),
            BitmapFontGuardLogKey::PageOutOfRange,
            format!(
                "createBitmapFont: {} names page {}, which this font does not have, so it was placed on page 0 and will sample whatever occupies those coordinates there. The font data is wrong, not the atlas — check the page index the exporter wrote.",
                format_codepoint(codepoint),
                page
            ),
        ),
    }
}
