use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::types::*;
use crate::update_bitmap_text::{
    set_bitmap_text_layout_guard, set_bitmap_text_missing_glyph_guard,
};

/// Uninstalls both BitmapText callbacks from the explicit caller-owned guard state (TS
/// `disableBitmapTextGuards`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces source module slots
pub fn disable_bitmap_text_guards(guard_state: &mut BitmapTextGuardState) {
    set_bitmap_text_layout_guard(guard_state, None);
    set_bitmap_text_missing_glyph_guard(guard_state, None);
}

/// Installs the opt-in once-only source diagnostics with explicit logging and clock context (TS
/// `enableBitmapTextGuards`).
// flight-lint: allow(f64) D1: the captured clock supplies canonical millisecond log timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard, LogState and clock replace module state
pub fn enable_bitmap_text_guards(
    guard_state: &mut BitmapTextGuardState,
    log_state: &LogStateRef,
    clock: BitmapTextClock,
) {
    let layout_log = log_state.clone();
    let layout_clock = clock.clone();
    let layout_guard: BitmapTextLayoutGuard = Arc::new(move |_reason, attempts| {
        warn_on_bitmap_text_layout_blocked(&layout_log, &layout_clock, attempts);
    });
    set_bitmap_text_layout_guard(guard_state, Some(layout_guard));

    let missing_log = log_state.clone();
    let missing_guard: BitmapTextMissingGlyphGuard = Arc::new(move |codepoint| {
        warn_on_bitmap_text_missing_glyph(&missing_log, &clock, codepoint);
    });
    set_bitmap_text_missing_glyph_guard(guard_state, Some(missing_guard));
}

fn format_codepoint(codepoint: u32) -> String {
    return format!("U+{codepoint:04X}");
}

// flight-lint: allow(f64) injected operation timestamps pass through to the canonical log contract
fn log_bitmap_text_guard_message(log_state: &LogStateRef, now_ms: f64, key: &str, message: String) {
    let data = LogData::Record(HashMap::from([(
        "message".to_string(),
        LogValue::Str(message),
    )]));
    let _ = log_once(
        log_state,
        now_ms,
        key,
        LogLevel::Warn,
        data.into(),
        Some("bitmaptext".to_string()),
    );
}

fn warn_on_bitmap_text_layout_blocked(
    log_state: &LogStateRef,
    clock: &BitmapTextClock,
    attempts: usize,
) {
    log_bitmap_text_guard_message(
        log_state,
        clock(),
        "bitmaptext:layout-did-not-converge",
        format!(
            "updateBitmapText: the glyph source repacked during all {attempts} layout passes, so this text never settled — its glyphs cannot all be resident in the atlas at once, and the quads drawn from the final pass sample stale rects. Enlarge the glyph atlas or reduce the font size; enableGlyphAtlasGuards reports the repacks from the atlas side."
        ),
    );
}

fn warn_on_bitmap_text_missing_glyph(
    log_state: &LogStateRef,
    clock: &BitmapTextClock,
    codepoint: u32,
) {
    let character = char::from_u32(codepoint).unwrap_or(char::REPLACEMENT_CHARACTER);
    log_bitmap_text_guard_message(
        log_state,
        clock(),
        &format!("bitmaptext:missing-glyph:{codepoint}"),
        format!(
            "updateBitmapText: no glyph for codepoint {} ({character}) — the glyph source does not contain this character, so it is skipped during layout. Use explainBitmapTextMissingGlyphs for a full inventory.",
            format_codepoint(codepoint),
        ),
    );
}
