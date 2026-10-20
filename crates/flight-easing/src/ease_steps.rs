use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StepPosition {
    JumpStart,
    JumpEnd,
    JumpNone,
    JumpBoth,
}

/// Returns a stepped easing function that quantizes [0,1] into `count` equal
/// intervals, jumping at the position(s) selected by `position`.
///
/// Sharp edge: `ease_steps(1, StepPosition::JumpNone)` has jumps = count - 1 = 0,
/// so the returned function divides by zero and yields NaN for every input.
pub fn ease_steps(count: i32, position: StepPosition) -> Box<dyn Fn(f32) -> f32> {
    if position == StepPosition::JumpNone && count < 2 {
        let guard = STEPS_GUARD.lock().unwrap();
        if let Some(g) = *guard {
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

    return Box::new(move |t: f32| -> f32 {
        let mut step = (t * count_f).floor() as i32 + start_offset;
        if t >= 0.0 && step < 0 {
            step = 0;
        }
        if t <= 1.0 && step > jumps {
            step = jumps;
        }
        return step as f32 / jumps_f;
    });
}

/// Sets or clears the diagnostics callback for degenerate `ease_steps` calls.
/// Pass `None` to uninstall the guard.
pub fn set_easing_steps_guard(guard: Option<fn(i32, StepPosition)>) {
    let mut g = STEPS_GUARD.lock().unwrap();
    *g = guard;
}

static STEPS_GUARD: Mutex<Option<fn(i32, StepPosition)>> = Mutex::new(None);
