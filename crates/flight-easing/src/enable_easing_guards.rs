use std::sync::Arc;

use flight_log::log_once;
use flight_log::LogLevel;

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
pub fn enable_easing_guards() {
    let guard: Arc<dyn Fn(i32, StepPosition) + Send + Sync> = Arc::new(warn_on_degenerate_steps);
    set_easing_steps_guard(Some(guard));
}

fn warn_on_degenerate_steps(count: i32, position: StepPosition) {
    let position_string = get_step_position_string(position);
    let jump_end = get_step_position_string(StepPosition::JumpEnd);
    let jump_start = get_step_position_string(StepPosition::JumpStart);
    let jump_both = get_step_position_string(StepPosition::JumpBoth);
    let message = format!(
        "easeSteps({}, '{}'): '{}' has count - 1 jumps, so it needs count >= 2. With {} there are no jumps, the easing divides by zero, and every input returns NaN. Pass count >= 2, or use a position that jumps at an edge ('{}', '{}', '{}') — those are defined for count >= 1.",
        count, position_string, position_string, count, jump_end, jump_start, jump_both
    );
    log_once(
        "easing:degenerate-steps",
        LogLevel::Warn,
        message.into(),
        Some("easing".to_string()),
    );
}
