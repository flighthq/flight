//! flight-compiler: target-native
//! flight-compiler: contract disableTextLabelGuards enableTextLabelGuards
//! flight-compiler: root-only disableTextLabelGuards enableTextLabelGuards

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogState, LogValue, log_once};

use crate::text_label_layout::set_text_label_guard;
use crate::types::{TextGuardClock, TextLayoutContext};

// flight-lint: allow(conform-params) D5 explicit caller-owned context replaces the source module guard slot
pub fn disable_text_label_guards(context: &Ref<TextLayoutContext>) {
    set_text_label_guard(context, None);
}

// flight-lint: allow(conform-params) D5 caller-owned guard and log state plus injected clock replace source globals and hidden time
pub fn enable_text_label_guards(
    context: &Ref<TextLayoutContext>,
    log_state: Ref<LogState>,
    clock: TextGuardClock,
) {
    set_text_label_guard(
        context,
        Some(Arc::new(move |live_string, rasterized_string| {
            warn_on_stale_text_label_content(&log_state, clock(), live_string, rasterized_string);
        })),
    );
}

fn preview(value: &str) -> String {
    let mut chars = value.chars();
    let head: String = chars.by_ref().take(40).collect();
    if chars.next().is_some() {
        return head + "...";
    }
    return head;
}

// flight-lint: allow(f64) D1: operation time is an injected millisecond timestamp
fn warn_on_stale_text_label_content(
    log_state: &Ref<LogState>,
    now_ms: f64,
    live_string: &str,
    rasterized_string: &str,
) {
    let live_preview = preview(live_string);
    let raster_preview = preview(rasterized_string);
    let message = format!(
        "TextLabel data.text was mutated directly (\"{live_preview}\") without calling setTextLabelString, so the content revision was not bumped and renderers still show the previous text (\"{raster_preview}\"). Use setTextLabelString(label, text) to update text at runtime."
    );
    let mut record = HashMap::new();
    record.insert("message".to_string(), LogValue::Str(message));
    log_once(
        log_state,
        now_ms,
        "text:stale-text-label-content",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(record)),
        Some("text".to_string()),
    );
}
