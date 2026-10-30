use std::sync::{Arc, Mutex};

use flight_entity::{Ref, allocate_entity};

use crate::slot::{connect_signal, disconnect_signal};
use crate::types::{
    FrameTick, Signal, SignalSlot, SignalThrottleOptions, SignalTimer, SignalTimerState, TimerId,
};

#[cfg(test)]
mod atomic_pending_tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex, RwLock, mpsc};
    use std::thread;

    use super::*;
    use crate::{create_signal, emit_signal};

    struct CloneGate {
        clones: AtomicUsize,
        release: Mutex<mpsc::Receiver<()>>,
        timer_read: mpsc::SyncSender<()>,
    }

    struct RacePayload {
        gate: Option<Arc<CloneGate>>,
        value: i32,
    }

    impl Clone for RacePayload {
        fn clone(&self) -> Self {
            if let Some(gate) = &self.gate
                && gate.clones.fetch_add(1, Ordering::SeqCst) == 1
            {
                gate.timer_read.send(()).unwrap();
                gate.release.lock().unwrap().recv().unwrap();
            }
            return RacePayload {
                gate: self.gate.clone(),
                value: self.value,
            };
        }
    }

    fn gated_payload(value: i32) -> (RacePayload, mpsc::Receiver<()>, mpsc::SyncSender<()>) {
        let (timer_read_tx, timer_read_rx) = mpsc::sync_channel(0);
        let (release_tx, release_rx) = mpsc::sync_channel(0);
        let gate = Arc::new(CloneGate {
            clones: AtomicUsize::new(0),
            release: Mutex::new(release_rx),
            timer_read: timer_read_tx,
        });
        return (
            RacePayload {
                gate: Some(gate),
                value,
            },
            timer_read_rx,
            release_tx,
        );
    }

    fn race_due_callback_with_emission(
        source: &Signal<RacePayload>,
        state: &Ref<SignalTimerState>,
        timer_read: mpsc::Receiver<()>,
        release: mpsc::SyncSender<()>,
        value: i32,
    ) {
        let timer_state = state.clone();
        let timer = thread::spawn(move || advance_signal_timers(&timer_state, 100.0));
        timer_read.recv().unwrap();

        let (emission_started_tx, emission_started_rx) = mpsc::sync_channel(0);
        let emission_source = source.clone();
        let emission = thread::spawn(move || {
            emission_started_tx.send(()).unwrap();
            emit_signal(&emission_source, &RacePayload { gate: None, value });
        });
        emission_started_rx.recv().unwrap();
        release.send(()).unwrap();

        timer.join().unwrap();
        emission.join().unwrap();
    }

    fn recorded_values() -> (Arc<Mutex<Vec<i32>>>, SignalSlot<RacePayload>) {
        let fired = Arc::new(Mutex::new(Vec::new()));
        let fired_slot = fired.clone();
        let slot = Arc::new(move |payload: &RacePayload| {
            fired_slot.lock().unwrap().push(payload.value);
        });
        return (fired, slot);
    }

    #[test]
    fn concurrent_emission_survives_a_due_debounce_callback() {
        let source: Signal<RacePayload> = create_signal();
        let state = Arc::new(RwLock::new(create_signal_timer_state()));
        let (fired, slot) = recorded_values();
        connect_signal_debounced(&source, 100.0, slot, None, &state);

        let (payload, timer_read, release) = gated_payload(1);
        emit_signal(&source, &payload);
        race_due_callback_with_emission(&source, &state, timer_read, release, 2);
        advance_signal_timers(&state, 200.0);
        assert_eq!(*fired.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn concurrent_emission_survives_the_leading_disabled_throttle_callback() {
        let source: Signal<RacePayload> = create_signal();
        let state = Arc::new(RwLock::new(create_signal_timer_state()));
        let (fired, slot) = recorded_values();
        let options = SignalThrottleOptions {
            leading: Some(false),
            trailing: Some(true),
        };
        connect_signal_throttled(&source, 100.0, slot, Some(&options), &state);

        let (payload, timer_read, release) = gated_payload(1);
        emit_signal(&source, &payload);
        race_due_callback_with_emission(&source, &state, timer_read, release, 2);
        advance_signal_timers(&state, 200.0);
        assert_eq!(*fired.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn concurrent_emission_survives_the_cooldown_throttle_callback() {
        let source: Signal<RacePayload> = create_signal();
        let state = Arc::new(RwLock::new(create_signal_timer_state()));
        let (fired, slot) = recorded_values();
        connect_signal_throttled(&source, 100.0, slot, None, &state);
        emit_signal(
            &source,
            &RacePayload {
                gate: None,
                value: 1,
            },
        );
        advance_signal_timers(&state, 50.0);

        let (payload, timer_read, release) = gated_payload(2);
        emit_signal(&source, &payload);
        race_due_callback_with_emission(&source, &state, timer_read, release, 3);
        advance_signal_timers(&state, 200.0);
        assert_eq!(*fired.lock().unwrap(), vec![1, 2, 3]);
    }
}

#[derive(Clone)]
struct PendingSignalArgs<T> {
    value: T,
}

// flight-lint: allow(conform-extra) D5: explicit timer state replaces hidden TS platform timers
pub fn create_signal_timer_state() -> SignalTimerState {
    let mut out: SignalTimerState = allocate_entity();
    initialize_signal_timer_state(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D5: explicit timer state replaces hidden TS platform timers
pub fn initialize_signal_timer_state(out: &mut SignalTimerState) {
    out.now_ms = 0.0;
    out.timers.clear();
    out.next_id = 1;
}

// flight-lint: allow(f64) D1: frame rate and accumulated milliseconds use f64 precision
fn advance_frame_elapsed(elapsed: &Arc<Mutex<f64>>, delta_time: f64, period: f64) -> Option<f64> {
    let mut guard = elapsed.lock().unwrap();
    *guard += delta_time;
    if *guard >= period {
        let total = *guard;
        *guard %= period;
        return Some(total);
    }
    return None;
}

/// Advances explicit timer state to `now_ms`, running every due callback in fire-time order (D5:
/// the caller injects time; the contract never reads a clock). Callbacks run without the state
/// lock held, so they may schedule or clear timers re-entrantly.
// flight-lint: allow(f64) D1: signal timers use millisecond durations
// flight-lint: allow(conform-extra) D5: explicit timer state replaces the TS platform clock
pub fn advance_signal_timers(state: &Ref<SignalTimerState>, now_ms: f64) {
    loop {
        let callback = take_due_signal_timer(state, now_ms);
        match callback {
            Some(callback) => callback(),
            None => break,
        }
    }
}

// flight-lint: allow(conform-extra) D5: explicit timer state replaces hidden TS platform timers
pub fn clear_signal_timeout(state: &Ref<SignalTimerState>, id: TimerId) {
    let mut timer_state = state.write().unwrap();
    let timers: &mut Vec<SignalTimer> = &mut timer_state.timers;
    timers.retain(|timer| timer.id.value != id.value);
}

/// Connects a frame-tick signal to a slot at a reduced frame rate (TS
/// `connectSignalAtFrameRate`). The slot receives the accumulated delta time since the last
/// fire, not the individual source deltas.
// flight-lint: allow(f64) D1: frame rate and accumulated milliseconds use f64 precision
pub fn connect_signal_at_frame_rate(
    source: &Signal<FrameTick>,
    fps: f64,
    slot: Arc<dyn Fn(f64) + Send + Sync>,
) -> Arc<dyn Fn() + Send + Sync> {
    let period = 1000.0 / fps;
    let elapsed = Arc::new(Mutex::new(0.0_f64));

    let handler_elapsed = elapsed.clone();
    let handler: SignalSlot<FrameTick> = Arc::new(move |tick: &FrameTick| {
        let fire = advance_frame_elapsed(&handler_elapsed, tick.delta_time, period);
        if let Some(total) = fire {
            slot(total);
        }
    });

    let slot_id = connect_signal(source, handler, None);
    let cleanup_source = source.clone();
    return Arc::new(move || disconnect_signal(&cleanup_source, slot_id));
}

/// Connects a slot with debounce semantics (TS `connectSignalDebounced`). Timer state and the
/// current time are explicit (D5); the caller advances both with `advance_signal_timers`.
// flight-lint: allow(f64) D1: debounce delays are millisecond durations
// flight-lint: allow(contract-vocabulary) D5: the trailing payload is retained across timer callbacks, so it must be Send
// flight-lint: allow(conform-params) D5: explicit timer state is passed instead of reading hidden platform timers
pub fn connect_signal_debounced<T: Clone + Send + 'static>(
    source: &Signal<T>,
    delay_ms: f64,
    slot: SignalSlot<T>,
    options: Option<&SignalThrottleOptions>,
    state: &Ref<SignalTimerState>,
) -> Arc<dyn Fn() + Send + Sync> {
    let leading = options.and_then(|o| o.leading).unwrap_or(false);
    let trailing = options.and_then(|o| o.trailing).unwrap_or(true);

    let timer_id: Arc<Mutex<Option<TimerId>>> = Arc::new(Mutex::new(None));
    let last_args: Arc<Mutex<Option<PendingSignalArgs<T>>>> = Arc::new(Mutex::new(None));
    let leading_fired = Arc::new(Mutex::new(false));

    let handler_slot = slot.clone();
    let handler_state = state.clone();
    let handler_timer_id = timer_id.clone();
    let handler_last_args = last_args.clone();
    let handler_leading_fired = leading_fired.clone();
    let handler: SignalSlot<T> = Arc::new(move |args: &T| {
        *handler_last_args.lock().unwrap() = Some(PendingSignalArgs {
            value: args.clone(),
        });

        if leading
            && handler_timer_id.lock().unwrap().is_none()
            && !*handler_leading_fired.lock().unwrap()
        {
            *handler_leading_fired.lock().unwrap() = true;
            handler_slot(args);
        }

        if let Some(pending) = *handler_timer_id.lock().unwrap() {
            clear_signal_timeout(&handler_state, pending);
        }

        let timer_slot = handler_slot.clone();
        let timer_last_args = handler_last_args.clone();
        let timer_leading_fired = handler_leading_fired.clone();
        let timer_timer_id = handler_timer_id.clone();
        let id = set_signal_timeout(
            &handler_state,
            delay_ms,
            Arc::new(move || {
                *timer_timer_id.lock().unwrap() = None;
                *timer_leading_fired.lock().unwrap() = false;
                if trailing {
                    let args = take_pending_signal_args(&timer_last_args);
                    if let Some(args) = args {
                        timer_slot(&args.value);
                    }
                }
            }),
        );
        *handler_timer_id.lock().unwrap() = Some(id);
    });

    let slot_id = connect_signal(source, handler, None);
    let cleanup_source = source.clone();
    let cleanup_state = state.clone();
    let cleanup_timer = timer_id;
    return Arc::new(move || {
        disconnect_signal(&cleanup_source, slot_id);
        let pending = *cleanup_timer.lock().unwrap();
        if let Some(pending) = pending {
            clear_signal_timeout(&cleanup_state, pending);
        }
    });
}

/// Connects a slot with throttle semantics (TS `connectSignalThrottled`), preserving the original
/// payload for the trailing call. Timer state and the current time are explicit (D5).
// flight-lint: allow(f64) D1: throttle intervals are millisecond durations
// flight-lint: allow(contract-vocabulary) D5: the trailing payload is retained across timer callbacks, so it must be Send
// flight-lint: allow(conform-params) D5: explicit timer state is passed instead of reading hidden platform timers
pub fn connect_signal_throttled<T: Clone + Send + 'static>(
    source: &Signal<T>,
    interval_ms: f64,
    slot: SignalSlot<T>,
    options: Option<&SignalThrottleOptions>,
    state: &Ref<SignalTimerState>,
) -> Arc<dyn Fn() + Send + Sync> {
    let leading = options.and_then(|o| o.leading).unwrap_or(true);
    let trailing = options.and_then(|o| o.trailing).unwrap_or(true);

    let last_fired_at: Arc<Mutex<f64>> = Arc::new(Mutex::new(f64::NEG_INFINITY));
    let trailing_timer: Arc<Mutex<Option<TimerId>>> = Arc::new(Mutex::new(None));
    let last_args: Arc<Mutex<Option<PendingSignalArgs<T>>>> = Arc::new(Mutex::new(None));

    let handler_slot = slot.clone();
    let handler_state = state.clone();
    let handler_last_fired_at = last_fired_at.clone();
    let handler_trailing_timer = trailing_timer.clone();
    let handler_last_args = last_args.clone();
    let handler: SignalSlot<T> = Arc::new(move |args: &T| {
        let now = handler_state.read().unwrap().now_ms;
        let remaining = interval_ms - (now - *handler_last_fired_at.lock().unwrap());

        if remaining <= 0.0 || remaining > interval_ms {
            if let Some(pending) = *handler_trailing_timer.lock().unwrap() {
                clear_signal_timeout(&handler_state, pending);
                *handler_trailing_timer.lock().unwrap() = None;
            }
            *handler_last_fired_at.lock().unwrap() = now;

            if leading {
                handler_slot(args);
            } else if trailing {
                *handler_last_args.lock().unwrap() = Some(PendingSignalArgs {
                    value: args.clone(),
                });
                let timer_slot = handler_slot.clone();
                let timer_state = handler_state.clone();
                let timer_last_fired_at = handler_last_fired_at.clone();
                let timer_trailing_timer = handler_trailing_timer.clone();
                let timer_last_args = handler_last_args.clone();
                let id = set_signal_timeout(
                    &handler_state,
                    interval_ms,
                    Arc::new(move || {
                        *timer_last_fired_at.lock().unwrap() = timer_state.read().unwrap().now_ms;
                        *timer_trailing_timer.lock().unwrap() = None;
                        let args = take_pending_signal_args(&timer_last_args);
                        if let Some(args) = args {
                            timer_slot(&args.value);
                        }
                    }),
                );
                *handler_trailing_timer.lock().unwrap() = Some(id);
            }
        } else if trailing {
            if let Some(pending) = *handler_trailing_timer.lock().unwrap() {
                clear_signal_timeout(&handler_state, pending);
            }
            *handler_last_args.lock().unwrap() = Some(PendingSignalArgs {
                value: args.clone(),
            });

            let timer_slot = handler_slot.clone();
            let timer_state = handler_state.clone();
            let timer_last_fired_at = handler_last_fired_at.clone();
            let timer_trailing_timer = handler_trailing_timer.clone();
            let timer_last_args = handler_last_args.clone();
            let id = set_signal_timeout(
                &handler_state,
                remaining,
                Arc::new(move || {
                    *timer_last_fired_at.lock().unwrap() = timer_state.read().unwrap().now_ms;
                    *timer_trailing_timer.lock().unwrap() = None;
                    let args = take_pending_signal_args(&timer_last_args);
                    if let Some(args) = args {
                        timer_slot(&args.value);
                    }
                }),
            );
            *handler_trailing_timer.lock().unwrap() = Some(id);
        }
    });

    let slot_id = connect_signal(source, handler, None);
    let cleanup_source = source.clone();
    let cleanup_state = state.clone();
    let cleanup_timer = trailing_timer;
    return Arc::new(move || {
        disconnect_signal(&cleanup_source, slot_id);
        let pending = *cleanup_timer.lock().unwrap();
        if let Some(pending) = pending {
            clear_signal_timeout(&cleanup_state, pending);
        }
    });
}

// flight-lint: allow(f64) D1: timer delays are millisecond durations
// flight-lint: allow(conform-extra) D5: explicit timer state replaces hidden TS platform timers
pub fn set_signal_timeout(
    state: &Ref<SignalTimerState>,
    delay_ms: f64,
    callback: Arc<dyn Fn() + Send + Sync>,
) -> TimerId {
    let mut timer_state = state.write().unwrap();
    let id = TimerId {
        value: timer_state.next_id,
    };
    timer_state.next_id += 1;
    let fire_at_ms = timer_state.now_ms + delay_ms;
    let mut index = 0;
    while index < timer_state.timers.len()
        && (timer_state.timers[index].fire_at_ms < fire_at_ms
            || (timer_state.timers[index].fire_at_ms == fire_at_ms
                && timer_state.timers[index].id.value <= id.value))
    {
        index += 1;
    }
    let timers: &mut Vec<SignalTimer> = &mut timer_state.timers;
    timers.insert(
        index,
        SignalTimer {
            id,
            fire_at_ms,
            callback,
        },
    );
    return id;
}

fn take_due_signal_timer(
    state: &Ref<SignalTimerState>,
    now_ms: f64,
) -> Option<Arc<dyn Fn() + Send + Sync>> {
    let mut timer_state = state.write().unwrap();
    let mut earliest: Option<usize> = None;
    for index in 0..timer_state.timers.len() {
        if timer_state.timers[index].fire_at_ms <= now_ms {
            match earliest {
                Some(current) => {
                    let candidate = (
                        timer_state.timers[index].fire_at_ms,
                        timer_state.timers[index].id.value,
                    );
                    let existing = (
                        timer_state.timers[current].fire_at_ms,
                        timer_state.timers[current].id.value,
                    );
                    if candidate.0 < existing.0
                        || (candidate.0 == existing.0 && candidate.1 < existing.1)
                    {
                        earliest = Some(index);
                    }
                }
                None => earliest = Some(index),
            }
        }
    }
    if let Some(index) = earliest {
        timer_state.now_ms = timer_state.timers[index].fire_at_ms;
        let timers: &mut Vec<SignalTimer> = &mut timer_state.timers;
        return Some(timers.remove(index).callback);
    }
    timer_state.now_ms = now_ms;
    return None;
}

// Clone and clear one pending payload while retaining the same guard. Splitting these operations
// across two lock acquisitions lets a concurrent emission install a newer payload in between and
// then has the due timer erase that newer value.
fn take_pending_signal_args<T: Clone>(pending: &Arc<Mutex<Option<T>>>) -> Option<T> {
    let mut guard = pending.lock().unwrap();
    let args = (*guard).clone();
    *guard = None;
    return args;
}
