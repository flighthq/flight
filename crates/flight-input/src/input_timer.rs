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
    out.cycle.callback = None;
    out.cycle.delay_ms = options.delay;
    out.cycle.interval_ms = options.interval;
    out.cycle.next_fire_ms = 0.0;
    out.cycle.repeating = false;
    out.cycle.started = false;
}

/// Drives the timer against the caller's clock (explicit-clock replacement for the source's real
/// timers). Fires every due tick in order: the delayed tick, then one tick per elapsed interval.
// flight-lint: allow(conform-extra) explicit-clock parity: the source timer relies on real timers; Rust drives it with caller time instead
// flight-lint: allow(f64) D1: the injected clock is a millisecond duration
pub fn advance_input_key_repeat_timer(timer: &Ref<InputKeyRepeatTimer>, now_ms: f64) {
    loop {
        let Some(tick) = take_due_input_key_repeat_tick(timer, now_ms) else {
            return;
        };
        let (callback, immediate) = tick;
        if let Some(callback) = callback {
            callback();
        }
        if immediate {
            return;
        }
    }
}

// Arms the cycle under the timer's lock; the caller invokes the callback after the lock is released.
// flight-lint: allow(f64) D1: the injected clock is a millisecond duration
fn begin_input_key_repeat_cycle(
    timer: &Ref<InputKeyRepeatTimer>,
    callback: InputRepeatCallback,
    now_ms: f64,
) {
    let mut locked = timer.write().unwrap();
    let cycle = get_input_key_repeat_timer_cycle(&mut locked);
    cycle.callback = Some(callback);
    cycle.next_fire_ms = now_ms + cycle.delay_ms;
    cycle.repeating = false;
    cycle.started = true;
}

// The designated runtime state of `timer`, reached through a typed entity reference.
fn get_input_key_repeat_timer_cycle(
    timer: &mut InputKeyRepeatTimer,
) -> &mut InputKeyRepeatTimerState {
    return &mut timer.cycle;
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
    begin_input_key_repeat_cycle(timer, callback.clone(), now_ms);
    callback();
}

/// Cancels the repeat cycle and drops its callback (TS `InputKeyRepeatTimer.stop`).
// flight-lint: allow(conform-extra) interface-member helper: TS stop is a method with no exported free function
pub fn stop_input_key_repeat_timer(timer: &Ref<InputKeyRepeatTimer>) {
    let mut locked = timer.write().unwrap();
    let cycle = get_input_key_repeat_timer_cycle(&mut locked);
    cycle.callback = None;
    cycle.started = false;
}

// Takes the next due tick, if any, under the timer's lock: its callback and whether the interval is
// non-positive (one immediate tick per advance). The callback runs after the lock is released.
// flight-lint: allow(f64) D1: the injected clock is a millisecond duration
fn take_due_input_key_repeat_tick(
    timer: &Ref<InputKeyRepeatTimer>,
    now_ms: f64,
) -> Option<(Option<InputRepeatCallback>, bool)> {
    let mut locked = timer.write().unwrap();
    let cycle = get_input_key_repeat_timer_cycle(&mut locked);
    if !cycle.started || now_ms < cycle.next_fire_ms {
        return None;
    }
    let callback = cycle.callback.clone();
    let interval = cycle.interval_ms;
    cycle.repeating = true;
    if interval <= 0.0 {
        cycle.next_fire_ms = now_ms;
    } else {
        cycle.next_fire_ms = cycle.next_fire_ms + interval;
    }
    return Some((callback, interval <= 0.0));
}
