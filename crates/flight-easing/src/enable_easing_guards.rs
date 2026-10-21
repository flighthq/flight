use std::sync::Arc;

use flight_log::{log_once, LogLevel, LogStateRef};

use crate::ease_steps::get_step_position_string;
use crate::ease_steps::set_easing_steps_guard;
use crate::ease_steps::StepPosition;

/// Uninstalls the guard installed by `enable_easing_guards`.
pub fn disable_easing_guards() {
    set_easing_steps_guard(None);
}

/// Installs the caller-facing easing guard (opt-in, dev-only). This reports a
/// warning when `ease_steps(count, JumpNone)` is called with `count < 2`, which
/// silently produces NaN for every input.
///
/// In the TypeScript original, this calls `logOnce` from `@flighthq/log`. The Rust
/// port uses flight-log's log-once equivalent with the same key and channel.
// flight-lint: allow(conform-params) D5: caller-owned log state replaces the hidden log singleton
pub fn enable_easing_guards(log_state: &LogStateRef) {
    let log_state = log_state.clone();
    let guard: Arc<dyn Fn(i32, StepPosition) + Send + Sync> =
        Arc::new(move |count: i32, position: StepPosition| {
            warn_on_degenerate_steps(&log_state, count, position);
        });
    set_easing_steps_guard(Some(guard));
}

fn warn_on_degenerate_steps(log_state: &LogStateRef, count: i32, position: StepPosition) {
    let position_string = get_step_position_string(position);
    let jump_end = get_step_position_string(StepPosition::JumpEnd);
    let jump_start = get_step_position_string(StepPosition::JumpStart);
    let jump_both = get_step_position_string(StepPosition::JumpBoth);
    let message = format!(
        "easeSteps({}, '{}'): '{}' has count - 1 jumps, so it needs count >= 2. With {} there are no jumps, the easing divides by zero, and every input returns NaN. Pass count >= 2, or use a position that jumps at an edge ('{}', '{}', '{}') — those are defined for count >= 1.",
        count, position_string, position_string, count, jump_end, jump_start, jump_both
    );
    log_once(
        log_state,
        0.0,
        "easing:degenerate-steps",
        LogLevel::Warn,
        message.into(),
        Some("easing".to_string()),
    );
}
