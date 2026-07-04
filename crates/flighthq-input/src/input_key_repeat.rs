//! Key-repeat timer for non-DOM input sources.
//!
//! Synthesizes key-repeat events for sources that do not provide their own
//! (gamepad d-pads, virtual keys, native backends).  The timer is driven by the
//! caller via [`update_input_key_repeat_timer`] each frame — no async runtime
//! or OS timer is required.
//!
//! The repeat cadence matches the TS `createInputKeyRepeatTimer`: on start the
//! callback fires immediately, then again after `delay` ms, then every
//! `interval` ms until stopped.

use flighthq_types::InputKeyRepeatOptions;

/// Tracks the state of a single key-repeat cycle.
///
/// Created by [`create_input_key_repeat_timer`].  The caller drives the timer
/// each frame with [`update_input_key_repeat_timer`], which returns `true`
/// whenever a repeat event should fire.  The handle is reusable across multiple
/// press/release cycles.
pub struct InputKeyRepeatTimer {
    delay_ms: f64,
    interval_ms: f64,
    active: bool,
    in_delay_phase: bool,
    elapsed_ms: f64,
    initial_pending: bool,
}

/// Allocates a new [`InputKeyRepeatTimer`] configured with the given delay and
/// interval.  The timer starts in a stopped state.
pub fn create_input_key_repeat_timer(options: &InputKeyRepeatOptions) -> InputKeyRepeatTimer {
    InputKeyRepeatTimer {
        delay_ms: options.delay,
        interval_ms: options.interval,
        active: false,
        in_delay_phase: false,
        elapsed_ms: 0.0,
        initial_pending: false,
    }
}

/// Returns `true` when `timer` is actively running a repeat cycle.
pub fn is_input_key_repeat_timer_active(timer: &InputKeyRepeatTimer) -> bool {
    timer.active
}

/// Begins a new repeat cycle.  The next call to
/// [`update_input_key_repeat_timer`] will return `true` for the initial
/// immediate fire.  If the timer is already active it is reset.
pub fn start_input_key_repeat_timer(timer: &mut InputKeyRepeatTimer) {
    timer.active = true;
    timer.in_delay_phase = true;
    timer.elapsed_ms = 0.0;
    timer.initial_pending = true;
}

/// Stops the current repeat cycle.  Subsequent calls to
/// [`update_input_key_repeat_timer`] will return `false` until
/// [`start_input_key_repeat_timer`] is called again.
pub fn stop_input_key_repeat_timer(timer: &mut InputKeyRepeatTimer) {
    timer.active = false;
    timer.in_delay_phase = false;
    timer.elapsed_ms = 0.0;
    timer.initial_pending = false;
}

/// Advances the timer by `delta_ms` milliseconds.  Returns `true` when a
/// repeat event should fire this frame.
///
/// The repeat cadence is: fire immediately on start, fire once after `delay`
/// ms, then fire every `interval` ms.
///
/// Returns `false` when the timer is stopped.
pub fn update_input_key_repeat_timer(timer: &mut InputKeyRepeatTimer, delta_ms: f64) -> bool {
    if !timer.active {
        return false;
    }

    // The very first update after start fires immediately.
    if timer.initial_pending {
        timer.initial_pending = false;
        return true;
    }

    timer.elapsed_ms += delta_ms;

    if timer.in_delay_phase {
        if timer.elapsed_ms >= timer.delay_ms {
            // Transition to interval phase, carrying over the remainder.
            timer.elapsed_ms -= timer.delay_ms;
            timer.in_delay_phase = false;
            return true;
        }
    } else if timer.elapsed_ms >= timer.interval_ms {
        // Subtract one interval; any further excess is carried forward so the
        // cadence stays consistent even when frames are uneven.
        timer.elapsed_ms -= timer.interval_ms;
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_options() -> InputKeyRepeatOptions {
        InputKeyRepeatOptions {
            delay: 500.0,
            interval: 33.0,
        }
    }

    #[test]
    fn create_input_key_repeat_timer_starts_inactive() {
        let timer = create_input_key_repeat_timer(&default_options());
        assert!(!is_input_key_repeat_timer_active(&timer));
    }

    #[test]
    fn is_input_key_repeat_timer_active_reflects_state() {
        let mut timer = create_input_key_repeat_timer(&default_options());
        assert!(!is_input_key_repeat_timer_active(&timer));

        start_input_key_repeat_timer(&mut timer);
        assert!(is_input_key_repeat_timer_active(&timer));

        stop_input_key_repeat_timer(&mut timer);
        assert!(!is_input_key_repeat_timer_active(&timer));
    }

    #[test]
    fn start_input_key_repeat_timer_fires_immediately_on_first_update() {
        let mut timer = create_input_key_repeat_timer(&default_options());
        start_input_key_repeat_timer(&mut timer);

        // First update after start should fire regardless of delta.
        assert!(update_input_key_repeat_timer(&mut timer, 0.0));
    }

    #[test]
    fn stop_input_key_repeat_timer_prevents_further_fires() {
        let mut timer = create_input_key_repeat_timer(&default_options());
        start_input_key_repeat_timer(&mut timer);
        assert!(update_input_key_repeat_timer(&mut timer, 0.0)); // initial

        stop_input_key_repeat_timer(&mut timer);
        assert!(!update_input_key_repeat_timer(&mut timer, 1000.0));
    }

    #[test]
    fn update_input_key_repeat_timer_delay_phase() {
        let mut timer = create_input_key_repeat_timer(&default_options());
        start_input_key_repeat_timer(&mut timer);

        // Consume the initial fire.
        assert!(update_input_key_repeat_timer(&mut timer, 0.0));

        // Not yet at the delay threshold (500 ms).
        assert!(!update_input_key_repeat_timer(&mut timer, 200.0));
        assert!(!update_input_key_repeat_timer(&mut timer, 200.0));

        // Cross the delay threshold.
        assert!(update_input_key_repeat_timer(&mut timer, 100.0));
    }

    #[test]
    fn update_input_key_repeat_timer_interval_phase() {
        let mut timer = create_input_key_repeat_timer(&default_options());
        start_input_key_repeat_timer(&mut timer);

        // Initial fire.
        assert!(update_input_key_repeat_timer(&mut timer, 0.0));
        // Cross delay.
        assert!(update_input_key_repeat_timer(&mut timer, 500.0));

        // First interval (33 ms).
        assert!(!update_input_key_repeat_timer(&mut timer, 16.0));
        assert!(update_input_key_repeat_timer(&mut timer, 17.0));

        // Second interval.
        assert!(!update_input_key_repeat_timer(&mut timer, 16.0));
        assert!(update_input_key_repeat_timer(&mut timer, 17.0));
    }

    #[test]
    fn update_input_key_repeat_timer_carries_remainder() {
        let opts = InputKeyRepeatOptions {
            delay: 100.0,
            interval: 50.0,
        };
        let mut timer = create_input_key_repeat_timer(&opts);
        start_input_key_repeat_timer(&mut timer);

        // Initial fire.
        assert!(update_input_key_repeat_timer(&mut timer, 0.0));

        // Overshoot delay by 20 ms — remainder carries into interval phase.
        assert!(update_input_key_repeat_timer(&mut timer, 120.0));

        // Only 30 ms more needed (50 - 20 remainder).
        assert!(update_input_key_repeat_timer(&mut timer, 30.0));
    }

    #[test]
    fn update_input_key_repeat_timer_returns_false_when_stopped() {
        let timer = create_input_key_repeat_timer(&default_options());
        assert!(!update_input_key_repeat_timer(&mut { timer }, 100.0));
    }

    #[test]
    fn start_input_key_repeat_timer_resets_active_timer() {
        let mut timer = create_input_key_repeat_timer(&default_options());
        start_input_key_repeat_timer(&mut timer);
        assert!(update_input_key_repeat_timer(&mut timer, 0.0)); // initial

        // Advance partway through delay.
        assert!(!update_input_key_repeat_timer(&mut timer, 300.0));

        // Restart — should fire immediately again.
        start_input_key_repeat_timer(&mut timer);
        assert!(update_input_key_repeat_timer(&mut timer, 0.0));

        // Delay should restart from zero.
        assert!(!update_input_key_repeat_timer(&mut timer, 300.0));
        assert!(update_input_key_repeat_timer(&mut timer, 200.0));
    }
}
