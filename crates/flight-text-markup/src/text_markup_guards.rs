//! The parser's opt-in diagnostic seam (TS `textMarkupGuards.ts`). Caller-owned state (D5).

use crate::types::*;

// flight-lint: allow(conform-params) D5: the guard slot is caller-owned explicit state
/// Reports one lossy parse decision to the active guard, if any (TS `reportTextMarkupIssue`).
pub fn report_text_markup_issue(state: &TextMarkupGuardState, issue: &TextMarkupIssue) {
    if let Some(guard) = &state.guard {
        guard(issue);
    }
}

// flight-lint: allow(conform-params) D5: the guard slot is caller-owned explicit state
/// Replaces the active guard (TS `setTextMarkupGuard`); `None` restores silent recovery. Setting a
/// guard replaces the previous callback rather than accumulating listeners.
pub fn set_text_markup_guard(state: &mut TextMarkupGuardState, guard: Option<TextMarkupGuard>) {
    state.guard = guard;
}
