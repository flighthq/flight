use crate::StepPosition;
use crate::set_easing_steps_guard;

/// Uninstalls the guard installed by `enable_easing_guards`.
pub fn disable_easing_guards() {
    set_easing_steps_guard(None);
}

/// Installs the caller-facing easing guard (opt-in, dev-only). This reports a
/// warning when `ease_steps(count, JumpNone)` is called with `count < 2`, which
/// silently produces NaN for every input.
///
/// In the TypeScript original, this calls `logOnce` from `@flighthq/log`.
/// The Rust port uses `eprintln` as a placeholder until `flight-log` is available.
pub fn enable_easing_guards() {
    set_easing_steps_guard(Some(warn_on_degenerate_steps));
}

fn warn_on_degenerate_steps(count: i32, position: StepPosition) {
    eprintln!(
        "easeSteps({}, '{:?}'): '{:?}' has count - 1 jumps, so it needs count >= 2. \
         With {} there are no jumps, the easing divides by zero, and every input returns NaN. \
         Pass count >= 2, or use a position that jumps at an edge ('JumpEnd', 'JumpStart', 'JumpBoth') \
         -- those are defined for count >= 1.",
        count, position, position, count
    );
}
