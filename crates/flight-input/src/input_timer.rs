use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::types::*;

/// Allocates a reusable key-repeat timer from the supplied timings (TS
/// `createInputKeyRepeatTimer`). Timing is caller-driven; no real timer is created.
pub fn create_input_key_repeat_timer(options: &InputKeyRepeatOptions) -> Ref<InputKeyRepeatTimer> {
    let mut out: InputKeyRepeatTimer = allocate_entity();
    initialize_input_key_repeat_timer(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Gives a timer under construction its timings and an inactive cycle (TS
/// `initializeInputKeyRepeatTimer`).
pub fn initialize_input_key_repeat_timer(
    out: &mut InputKeyRepeatTimer,
    options: &InputKeyRepeatOptions,
) {
    out.callback = None;
    out.delay_ms = options.delay;
    out.interval_ms = options.interval;
    out.next_fire_ms = 0.0;
    out.repeating = false;
    out.started = false;
}

/// Drives the timer against the caller's clock (explicit-clock replacement for the source's real
/// timers). Fires every due tick in order: the delayed tick, then one tick per elapsed interval.
// flight-lint: allow(conform-extra) explicit-clock parity: the source timer relies on real timers; Rust drives it with caller time instead
// flight-lint: allow(f64) D1: the injected clock is a millisecond duration
pub fn advance_input_key_repeat_timer(timer: &Ref<InputKeyRepeatTimer>, now_ms: f64) {
    loop {
        let next = {
            let mut locked = timer.write().unwrap();
            if !locked.started || now_ms < locked.next_fire_ms {
                return;
            }
            let callback = locked.callback.clone();
            let interval = locked.interval_ms;
            locked.repeating = true;
            if interval <= 0.0 {
                locked.next_fire_ms = now_ms;
            } else {
                locked.next_fire_ms = locked.next_fire_ms + interval;
            }
            (callback, interval <= 0.0)
        };
        if let Some(callback) = next.0 {
            callback();
        }
        if next.1 {
            return;
        }
    }
}

/// Starts the repeat cycle at the caller's clock: invokes the callback immediately, then schedules
/// the delayed tick and the interval ticks (TS `InputKeyRepeatTimer.start`).
// flight-lint: allow(conform-extra) interface-member helper: TS start is a method with no exported free function, and Rust adds the caller clock
// flight-lint: allow(f64) D1: the injected clock is a millisecond duration
pub fn start_input_key_repeat_timer(
    timer: &Ref<InputKeyRepeatTimer>,
    callback: InputRepeatCallback,
    now_ms: f64,
) {
    {
        let mut locked = timer.write().unwrap();
        locked.callback = Some(callback.clone());
        locked.next_fire_ms = now_ms + locked.delay_ms;
        locked.repeating = false;
        locked.started = true;
    }
    callback();
}

/// Cancels the repeat cycle and drops its callback (TS `InputKeyRepeatTimer.stop`).
// flight-lint: allow(conform-extra) interface-member helper: TS stop is a method with no exported free function
pub fn stop_input_key_repeat_timer(timer: &Ref<InputKeyRepeatTimer>) {
    let mut locked = timer.write().unwrap();
    locked.callback = None;
    locked.started = false;
}
