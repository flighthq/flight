use crate::text_bidi_guards::set_text_bidi_guard;
use crate::types::LogData;
use crate::types::LogLevel;
use crate::types::log_once;

pub fn disable_text_bidi_guards() {
    set_text_bidi_guard(None);
}

pub fn enable_text_bidi_guards() {
    set_text_bidi_guard(Some(warn_on_compact_table_miss));
}

fn warn_on_compact_table_miss(codepoint: u32) {
    log_once(
        "textbidi:compact-table-miss",
        LogLevel::Warn,
        LogData {
            message: format!(
                "resolveBidiLevels: U+{:04X} is outside the compact bidi-class table and defaulted to L. Pass a full-coverage BidiClassKernel to resolveBidiLevels or getBidiRuns.",
                codepoint
            ),
        },
        "textbidi",
    );
}
