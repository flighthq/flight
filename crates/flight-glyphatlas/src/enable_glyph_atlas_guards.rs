use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::glyph_atlas_entry::set_glyph_atlas_entry_guard;
use crate::glyph_atlas_strings::get_glyph_atlas_guard_log_key_string;
use crate::types::*;

const REPACK_THRASHING_THRESHOLD: u32 = 4;

// flight-lint: allow(conform-params) D5: the atlas explicitly owns its guard and repack count
pub fn disable_glyph_atlas_guards(atlas: &Ref<GlyphAtlas>) {
    let runtime = get_glyph_atlas_runtime(atlas);
    let mut runtime = runtime.write().unwrap();
    runtime.entry_guard = None;
    runtime.guard_repack_count = 0;
}

/// Installs opt-in atlas diagnostics with caller-owned logging and a live operation clock.
// flight-lint: allow(conform-params) D5: explicit atlas state, LogState and live clock replace globals and ambient time
pub fn enable_glyph_atlas_guards(
    atlas: &Ref<GlyphAtlas>,
    log_state: &LogStateRef,
    clock: GlyphAtlasClock,
) {
    let log_state = log_state.clone();
    set_glyph_atlas_entry_guard(
        atlas,
        Some(Arc::new(move |notice| {
            warn_on_glyph_atlas_entry_blocked(&log_state, &clock, notice);
        })),
    );
}

fn format_codepoint(codepoint: u32) -> String {
    return format!("U+{codepoint:04X}");
}

fn glyph_atlas_guard_message(notice: &GlyphAtlasEntryGuardNotice) -> String {
    return match notice.reason {
        GlyphAtlasEntryGuardReason::Repack => format!(
            "getGlyphAtlasEntry: the atlas has repacked {} times ({} glyphs cached), so its working set does not fit. Every repack relocates cached glyphs and invalidates any baked rects: consumers must re-read getGlyphAtlasLayoutVersion, and BitmapText nodes must be refreshed with refreshBitmapTextGlyphLayout. Enlarge the atlas or reduce the font size to stop the churn.",
            notice.repack_count, notice.subject
        ),
        GlyphAtlasEntryGuardReason::RasterizerReturnedNull => format!(
            "getGlyphAtlasEntry: the rasterizer produced nothing for {}, so it will not render. The host may have no canvas, the font may not cover this codepoint, or a custom backend declined.",
            format_codepoint(notice.subject)
        ),
        GlyphAtlasEntryGuardReason::GlyphLargerThanAtlas => format!(
            "getGlyphAtlasEntry: {} rasterizes larger than the atlas's usable area, so it can never be placed however much is evicted. Enlarge the atlas or reduce the font size; explainGlyphAtlasEntry reports the measured sizes.",
            format_codepoint(notice.subject)
        ),
        GlyphAtlasEntryGuardReason::RepackDropped => format!(
            "getGlyphAtlasEntry: a repack could not replace {} and dropped it. Occasional drops are normal under pressure; repeated ones mean the atlas is thrashing and glyphs are being re-rasterized on every use. Consider a larger atlas or a byte/area budget.",
            format_codepoint(notice.subject)
        ),
    };
}

fn glyph_atlas_log_key(reason: GlyphAtlasEntryGuardReason) -> GlyphAtlasGuardLogKey {
    return match reason {
        GlyphAtlasEntryGuardReason::GlyphLargerThanAtlas => {
            GlyphAtlasGuardLogKey::GlyphLargerThanAtlas
        }
        GlyphAtlasEntryGuardReason::RasterizerReturnedNull => {
            GlyphAtlasGuardLogKey::RasterizerReturnedNull
        }
        GlyphAtlasEntryGuardReason::RepackDropped => GlyphAtlasGuardLogKey::RepackDropped,
        GlyphAtlasEntryGuardReason::Repack => GlyphAtlasGuardLogKey::RepackThrashing,
    };
}

// flight-lint: allow(f64) injected operation timestamps pass through to the canonical log contract
fn log_glyph_atlas_guard_message(
    log_state: &LogStateRef,
    now_ms: f64,
    key: GlyphAtlasGuardLogKey,
    message: String,
) {
    let data = LogData::Record(HashMap::from([(
        "message".to_string(),
        LogValue::Str(message),
    )]));
    let _ = log_once(
        log_state,
        now_ms,
        get_glyph_atlas_guard_log_key_string(key),
        LogLevel::Warn,
        data.into(),
        Some("glyphatlas".to_string()),
    );
}

fn warn_on_glyph_atlas_entry_blocked(
    log_state: &LogStateRef,
    clock: &GlyphAtlasClock,
    notice: &GlyphAtlasEntryGuardNotice,
) {
    if notice.reason == GlyphAtlasEntryGuardReason::Repack
        && notice.repack_count < REPACK_THRASHING_THRESHOLD
    {
        return;
    }
    log_glyph_atlas_guard_message(
        log_state,
        clock(),
        glyph_atlas_log_key(notice.reason),
        glyph_atlas_guard_message(notice),
    );
}
