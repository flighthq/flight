use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    fn make_timer(delay: f64, interval: f64) -> Ref<InputKeyRepeatTimer> {
        let timer = create_input_key_repeat_timer();
        {
            let mut g = timer.write().unwrap();
            g.delay_ms = delay;
            g.interval_ms = interval;
        }
        return timer;
    }

    #[test]
    fn new_matches_create_input_key_repeat_timer() {
        let method_timer = InputKeyRepeatTimer::new();
        let free_timer = create_input_key_repeat_timer();
        assert_eq!(
            method_timer.read().unwrap().delay_ms,
            free_timer.read().unwrap().delay_ms
        );
    }

    #[test]
    fn advance_method_matches_advance_input_key_repeat_timer() {
        let method_timer = make_timer(500.0, 33.0);
        let free_timer = make_timer(500.0, 33.0);
        start_input_key_repeat_timer(&method_timer, Arc::new(|| {}), 0.0);
        start_input_key_repeat_timer(&free_timer, Arc::new(|| {}), 0.0);
        method_timer.advance(500.0);
        advance_input_key_repeat_timer(&free_timer, 500.0);
        assert_eq!(
            method_timer.read().unwrap().next_fire_ms,
            free_timer.read().unwrap().next_fire_ms
        );
    }

    #[test]
    fn start_method_matches_start_input_key_repeat_timer() {
        let method_timer = make_timer(500.0, 33.0);
        let free_timer = make_timer(500.0, 33.0);
        let method_calls = Arc::new(std::sync::Mutex::new(0));
        let captured = method_calls.clone();
        method_timer.start(Arc::new(move || *captured.lock().unwrap() += 1), 10.0);
        let free_calls = Arc::new(std::sync::Mutex::new(0));
        let captured = free_calls.clone();
        start_input_key_repeat_timer(
            &free_timer,
            Arc::new(move || *captured.lock().unwrap() += 1),
            10.0,
        );
        assert_eq!(*method_calls.lock().unwrap(), *free_calls.lock().unwrap());
    }

    #[test]
    fn stop_method_matches_stop_input_key_repeat_timer() {
        let method_timer = make_timer(500.0, 33.0);
        let free_timer = make_timer(500.0, 33.0);
        start_input_key_repeat_timer(&method_timer, Arc::new(|| {}), 0.0);
        start_input_key_repeat_timer(&free_timer, Arc::new(|| {}), 0.0);
        method_timer.stop();
        stop_input_key_repeat_timer(&free_timer);
        assert_eq!(
            method_timer.read().unwrap().started,
            free_timer.read().unwrap().started
        );
    }
}

/// Allocates a reusable key-repeat timer from the supplied timings (TS
/// `createInputKeyRepeatTimer`). Timing is caller-driven; no real timer is created.
// flight-lint: allow(conform-params) D23 B: InputKeyRepeatOptions removed; timings assigned after create
pub fn create_input_key_repeat_timer() -> Ref<InputKeyRepeatTimer> {
    let mut out: InputKeyRepeatTimer = allocate_entity();
    initialize_input_key_repeat_timer(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_input_key_repeat_timer(
    out: &mut InputKeyRepeatTimer,
) {
    out.callback = None;
    out.delay_ms = 0.0;
    out.interval_ms = 0.0;
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

// ============================================================================
// D18 sugar: methods on the timer handle delegate to the free functions
// ============================================================================

impl InputKeyRepeatTimer {
    pub fn new() -> Ref<InputKeyRepeatTimer> {
        return create_input_key_repeat_timer();
    }
}

/// Sugar for the shared key-repeat timer handle.
pub trait InputKeyRepeatTimerMethods {
    fn advance(&self, now_ms: f64);
    fn start(&self, callback: InputRepeatCallback, now_ms: f64);
    fn stop(&self);
}

impl InputKeyRepeatTimerMethods for Ref<InputKeyRepeatTimer> {
    // flight-lint: allow(f64) D1: the injected clock is a millisecond duration
    fn advance(&self, now_ms: f64) {
        return advance_input_key_repeat_timer(self, now_ms);
    }

    // flight-lint: allow(f64) D1: the injected clock is a millisecond duration
    fn start(&self, callback: InputRepeatCallback, now_ms: f64) {
        return start_input_key_repeat_timer(self, callback, now_ms);
    }

    fn stop(&self) {
        return stop_input_key_repeat_timer(self);
    }
}
