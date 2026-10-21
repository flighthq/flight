//! Opt-in logging for lossy markup parses (TS `enableTextMarkupGuards.ts`). The log state and clock
//! are caller-owned explicit context (D5).

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};

use crate::text_markup_guards::set_text_markup_guard;
use crate::types::*;

// flight-lint: allow(conform-params) D5: guard state is caller-owned explicit state
/// Uninstalls the guard installed by `enable_text_markup_guards` (TS `disableTextMarkupGuards`).
pub fn disable_text_markup_guards(state: &mut TextMarkupGuardState) {
    set_text_markup_guard(state, None);
}

// flight-lint: allow(conform-params) D5: guard state, log state and clock are caller-owned explicit context
/// Installs opt-in diagnostics for tags and attributes that parsing drops or ignores
/// (TS `enableTextMarkupGuards`). `log_state` and `clock` are the caller's explicit logging context.
pub fn enable_text_markup_guards(
    state: &mut TextMarkupGuardState,
    log_state: &LogStateRef,
    clock: TextMarkupClock,
) {
    let log_state = log_state.clone();
    let guard: TextMarkupGuard = Arc::new(move |issue: &TextMarkupIssue| {
        warn_on_text_markup_issue(&log_state, &clock, issue);
    });
    set_text_markup_guard(state, Some(guard));
}

fn warn_on_text_markup_issue(
    log_state: &LogStateRef,
    clock: &TextMarkupClock,
    issue: &TextMarkupIssue,
) {
    let value = issue.value.clone().unwrap_or_default();
    let (key, message) = match issue.kind {
        TextMarkupIssueKind::UnknownTag => (
            format!("text-markup:unknown-tag:{}", issue.tag),
            format!(
                "parseTextMarkup: <{}> has no registered handler, so the tag was dropped while its text was kept. Register it with registerMarkupTag(registry, '{}', handler), or remove it from the source markup.",
                issue.tag, issue.tag
            ),
        ),
        TextMarkupIssueKind::UnresolvedFontColor => (
            format!("text-markup:unresolved-font-color:{}", value),
            format!(
                "parseTextMarkup: <font color=\"{}\"> did not resolve, so that color was ignored. Register named colors with registerMarkupNamedColors(registry), assign registry.colorResolver, or use #rgb, #rrggbb, or 0xRRGGBB.",
                value
            ),
        ),
        TextMarkupIssueKind::UnsafeHref => (
            format!("text-markup:unsafe-href:{}", value),
            format!(
                "parseTextMarkup: <a href=\"{}\"> uses an unsafe URL scheme, so the href was dropped. Use an http, https, mailto, tel, relative, or fragment URL instead.",
                value
            ),
        ),
    };
    let mut record = HashMap::new();
    record.insert(String::from("message"), LogValue::Str(message));
    log_once(
        log_state,
        clock(),
        &key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(record)),
        Some(String::from("text-markup")),
    );
}
