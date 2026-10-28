//! flight-compiler: callable-parameters EasingStepsGuard count position
//! flight-compiler: string-union StepPosition

use std::sync::{Arc, Mutex, PoisonError};

use crate::EasingFunction;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepPosition {
    JumpStart,
    JumpEnd,
    JumpNone,
    JumpBoth,
}

/// Reports a degenerate stepped-easing call before it silently produces NaN.
pub type EasingStepsGuard = Arc<dyn Fn(i32, StepPosition) + Send + Sync>;

/// Returns a stepped easing function that quantizes [0,1] into `count` equal
/// intervals, jumping at the position(s) selected by `position`. A missing
/// position defaults to `'jumpEnd'`.
///
/// Sharp edge: `easeSteps(1, 'jumpNone')` has jumps = count - 1 = 0,
/// so the returned function divides by zero and yields NaN for every input.
pub fn ease_steps(count: i32, position: Option<StepPosition>) -> EasingFunction {
    let position = position.unwrap_or(StepPosition::JumpEnd);
    if position == StepPosition::JumpNone && count < 2 {
        let guard = STEPS_GUARD
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone();
        if let Some(g) = guard {
            g(count, position);
        }
    }
    let jumps = match position {
        StepPosition::JumpNone => count - 1,
        StepPosition::JumpBoth => count + 1,
        _ => count,
    };
    let start_offset = match position {
        StepPosition::JumpStart | StepPosition::JumpBoth => 1,
        _ => 0,
    };
    let count_f = count as f32;
    let jumps_f = jumps as f32;

    return Arc::new(move |t: f32| -> f32 {
        let mut step = (t * count_f).floor() as i32;
        step += start_offset;
        if t >= 0.0 && step < 0 {
            step = 0;
        }
        if t <= 1.0 && step > jumps {
            step = jumps;
        }
        return step as f32 / jumps_f;
    });
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS StepPosition string union; TS exports no get_/parse_ free functions
pub fn get_step_position_string(value: StepPosition) -> &'static str {
    return match value {
        StepPosition::JumpStart => "jumpStart",
        StepPosition::JumpEnd => "jumpEnd",
        StepPosition::JumpNone => "jumpNone",
        StepPosition::JumpBoth => "jumpBoth",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS StepPosition string union; TS exports no get_/parse_ free functions
pub fn parse_step_position(value: &str) -> Option<StepPosition> {
    return match value {
        "jumpStart" => Some(StepPosition::JumpStart),
        "jumpEnd" => Some(StepPosition::JumpEnd),
        "jumpNone" => Some(StepPosition::JumpNone),
        "jumpBoth" => Some(StepPosition::JumpBoth),
        _ => None,
    };
}

/// Sets or clears the diagnostics callback for degenerate `ease_steps` calls.
/// Pass `null` to uninstall the guard.
pub fn set_easing_steps_guard(guard: Option<EasingStepsGuard>) {
    let mut slot = STEPS_GUARD.lock().unwrap_or_else(PoisonError::into_inner);
    *slot = guard;
}

// A panicking diagnostic must never make later calls fail, so a poisoned slot is recovered rather
// than unwrapped. The slot is dev-only: it is read only while an easing function is constructed and
// cannot change any returned value.
// flight-lint: allow(hidden-state) opt-in dev-only diagnostics slot (D5): read only when ease_steps is constructed, cannot change any returned value, defaults to None in production, and TS keeps the same module-level slot
static STEPS_GUARD: Mutex<Option<EasingStepsGuard>> = Mutex::new(None);
