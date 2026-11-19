use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_signals::contract::{
    connect_signal_at_frame_rate_tracked, initialize_signal_timer_state,
};
use flight_signals::*;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

type TimerRef = Ref<SignalTimerState>;

#[derive(Clone)]
struct PairEvent {
    x: i32,
    y: i32,
}

fn timer_state() -> TimerRef {
    return Arc::new(RwLock::new(create_signal_timer_state()));
}

fn now(state: &TimerRef) -> f64 {
    return state.read().unwrap().now_ms;
}

mod advance_signal_timers {
    use super::*;

    #[test]
    fn runs_due_callbacks_in_fire_time_order_and_sets_the_current_time() {
        let state = timer_state();
        let order: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        for (label, delay) in [("second", 20.0), ("first", 10.0)] {
            let timer_order = order.clone();
            set_signal_timeout(
                &state,
                delay,
                Arc::new(move || timer_order.lock().unwrap().push(label)),
            );
        }
        advance_signal_timers(&state, 15.0);
        assert_eq!(*order.lock().unwrap(), vec!["first"]);
        assert_eq!(now(&state), 15.0);
        advance_signal_timers(&state, 25.0);
        assert_eq!(*order.lock().unwrap(), vec!["first", "second"]);
        assert_eq!(now(&state), 25.0);
    }
}

mod clear_signal_timeout {
    use super::*;

    #[test]
    fn prevents_a_pending_callback_from_running() {
        let state = timer_state();
        let fired = Arc::new(Mutex::new(0));
        let counter = fired.clone();
        let id = set_signal_timeout(
            &state,
            10.0,
            Arc::new(move || *counter.lock().unwrap() += 1),
        );
        clear_signal_timeout(&state, id);
        advance_signal_timers(&state, 100.0);
        assert_eq!(*fired.lock().unwrap(), 0);
    }
}

mod connect_signal_at_frame_rate {
    use super::*;

    #[test]
    fn fires_the_slot_only_when_accumulated_delta_reaches_the_period() {
        let source: Signal<FrameTick> = create_signal();
        let fired: Arc<Mutex<Vec<f64>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        connect_signal_at_frame_rate(
            &source,
            10.0,
            Arc::new(move |delta: f64| out.lock().unwrap().push(delta)),
        );
        emit_signal(&source, &FrameTick { delta_time: 40.0 });
        emit_signal(&source, &FrameTick { delta_time: 40.0 });
        assert!(fired.lock().unwrap().is_empty());
        emit_signal(&source, &FrameTick { delta_time: 40.0 });
        assert_eq!(fired.lock().unwrap().len(), 1);
        assert_eq!(fired.lock().unwrap()[0], 120.0);
    }

    #[test]
    fn accumulates_remainder_across_firings() {
        let source: Signal<FrameTick> = create_signal();
        let fired = Arc::new(Mutex::new(0));
        let count = fired.clone();
        connect_signal_at_frame_rate(
            &source,
            10.0,
            Arc::new(move |_delta: f64| *count.lock().unwrap() += 1),
        );
        emit_signal(&source, &FrameTick { delta_time: 110.0 });
        emit_signal(&source, &FrameTick { delta_time: 110.0 });
        assert_eq!(*fired.lock().unwrap(), 2);
    }

    #[test]
    fn returns_a_cleanup_that_stops_the_slot() {
        let source: Signal<FrameTick> = create_signal();
        let fired = Arc::new(Mutex::new(0));
        let count = fired.clone();
        let detach = connect_signal_at_frame_rate(
            &source,
            10.0,
            Arc::new(move |_delta: f64| *count.lock().unwrap() += 1),
        );
        detach();
        emit_signal(&source, &FrameTick { delta_time: 200.0 });
        assert_eq!(*fired.lock().unwrap(), 0);
    }

    #[test]
    fn the_disposer_does_not_keep_the_source_alive() {
        let source: Signal<FrameTick> = create_signal();
        let dropped = Arc::new(AtomicUsize::new(0));
        let hook_dropped = dropped.clone();
        let hook = z_create_drop_hook(move || {
            hook_dropped.fetch_add(1, Ordering::SeqCst);
        });
        let detach = connect_signal_at_frame_rate(
            &source,
            10.0,
            Arc::new(move |_: f64| {
                let _ = &hook;
            }),
        );
        drop(source);
        assert_eq!(dropped.load(Ordering::SeqCst), 1);
        detach();
        assert_eq!(dropped.load(Ordering::SeqCst), 1);
    }
}

mod connect_signal_at_frame_rate_tracked {
    use super::*;

    #[test]
    fn follows_tracked_pause_and_resume() {
        let source: Signal<FrameTick> = create_signal();
        let fired = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        let connection = connect_signal_at_frame_rate_tracked(
            &source,
            10.0,
            Arc::new(move |total: f64| out.lock().unwrap().push(total)),
            None,
        );
        pause_signal_connection(&connection);
        emit_signal(&source, &FrameTick { delta_time: 200.0 });
        resume_signal_connection(&connection);
        emit_signal(&source, &FrameTick { delta_time: 100.0 });
        assert_eq!(*fired.lock().unwrap(), vec![100.0]);
        assert!(is_signal_connection_connected(&connection));
    }

    #[test]
    fn reports_disconnected_on_clear_while_a_callback_is_still_running() {
        z_run_within_deadline(|| {
            let source: Signal<FrameTick> = create_signal();
            let (entered, entered_wait) = std::sync::mpsc::channel();
            let (resume, resume_wait) = std::sync::mpsc::channel::<()>();
            let resume_wait = Mutex::new(resume_wait);
            let returned = Arc::new(AtomicBool::new(false));
            let dropped = Arc::new(AtomicUsize::new(0));
            let (hook_returned, hook_dropped) = (returned.clone(), dropped.clone());
            let hook = z_create_drop_hook(move || {
                assert!(hook_returned.load(Ordering::SeqCst));
                hook_dropped.fetch_add(1, Ordering::SeqCst);
            });
            let slot_returned = returned.clone();
            let connection = connect_signal_at_frame_rate_tracked(
                &source,
                1000.0,
                Arc::new(move |_: f64| {
                    let _ = &hook;
                    entered.send(()).unwrap();
                    resume_wait.lock().unwrap().recv().unwrap();
                    slot_returned.store(true, Ordering::SeqCst);
                }),
                None,
            );
            let emitter = source.clone();
            let emission =
                std::thread::spawn(move || emit_signal(&emitter, &FrameTick { delta_time: 5.0 }));
            entered_wait.recv().unwrap();
            clear_signal(&source);
            assert!(!is_signal_connection_connected(&connection));
            assert_eq!(dropped.load(Ordering::SeqCst), 0);
            resume.send(()).unwrap();
            emission.join().unwrap();
            assert_eq!(dropped.load(Ordering::SeqCst), 1);
        });
    }
}

mod connect_signal_debounced {
    use super::*;

    #[test]
    fn fires_after_the_delay_when_the_signal_goes_quiet() {
        let source: Signal<i32> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        connect_signal_debounced(
            &source,
            100.0,
            Arc::new(move |value: &i32| out.lock().unwrap().push(*value)),
            None,
            &state,
        );
        emit_signal(&source, &1);
        emit_signal(&source, &2);
        assert!(fired.lock().unwrap().is_empty());
        advance_signal_timers(&state, 100.0);
        assert_eq!(*fired.lock().unwrap(), vec![2]);
    }

    #[test]
    fn resets_the_timer_on_each_emission() {
        let source: Signal<()> = create_signal();
        let state = timer_state();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        connect_signal_debounced(
            &source,
            100.0,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            None,
            &state,
        );
        emit_signal(&source, &());
        advance_signal_timers(&state, 50.0);
        emit_signal(&source, &());
        advance_signal_timers(&state, 100.0);
        assert_eq!(*count.lock().unwrap(), 0);
        advance_signal_timers(&state, 150.0);
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn fires_on_the_leading_edge_when_leading_is_true() {
        let source: Signal<()> = create_signal();
        let state = timer_state();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let options = SignalThrottleOptions {
            leading: Some(true),
            trailing: Some(false),
        };
        connect_signal_debounced(
            &source,
            100.0,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
            &state,
        );
        emit_signal(&source, &());
        assert_eq!(*count.lock().unwrap(), 1);
        emit_signal(&source, &());
        emit_signal(&source, &());
        advance_signal_timers(&state, 100.0);
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn cleanup_stops_the_slot_and_cancels_the_timer() {
        let source: Signal<()> = create_signal();
        let state = timer_state();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let detach = connect_signal_debounced(
            &source,
            100.0,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            None,
            &state,
        );
        emit_signal(&source, &());
        detach();
        advance_signal_timers(&state, 200.0);
        assert_eq!(*count.lock().unwrap(), 0);
    }
}

mod connect_signal_throttled {
    use super::*;

    #[test]
    fn fires_immediately_on_the_first_emission() {
        let source: Signal<i32> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |value: &i32| out.lock().unwrap().push(*value)),
            None,
            &state,
        );
        emit_signal(&source, &1);
        assert_eq!(*fired.lock().unwrap(), vec![1]);
    }

    #[test]
    fn suppresses_emissions_within_the_interval_then_fires_the_trailing_value() {
        let source: Signal<i32> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |value: &i32| out.lock().unwrap().push(*value)),
            None,
            &state,
        );
        emit_signal(&source, &1);
        advance_signal_timers(&state, 50.0);
        emit_signal(&source, &2);
        advance_signal_timers(&state, 100.0);
        assert!(fired.lock().unwrap().contains(&1));
        assert!(fired.lock().unwrap().contains(&2));
    }

    // The cooldown left is the interval minus the time since the last firing,
    // `interval - (now - last_fired_at)`, so a call shortly after a firing at a non-zero time waits out
    // the rest of the interval instead of firing at once.
    #[test]
    fn defers_a_call_within_the_interval_after_a_firing_at_a_later_time() {
        let source: Signal<i32> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |value: &i32| out.lock().unwrap().push(*value)),
            None,
            &state,
        );
        advance_signal_timers(&state, 1000.0);
        emit_signal(&source, &1);
        advance_signal_timers(&state, 1030.0);
        emit_signal(&source, &2);
        assert_eq!(*fired.lock().unwrap(), vec![1]);
        advance_signal_timers(&state, 1099.0);
        assert_eq!(*fired.lock().unwrap(), vec![1]);
        advance_signal_timers(&state, 1100.0);
        assert_eq!(*fired.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn preserves_the_original_payload() {
        let source: Signal<PairEvent> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<(i32, i32)>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |event: &PairEvent| out.lock().unwrap().push((event.x, event.y))),
            None,
            &state,
        );
        emit_signal(&source, &PairEvent { x: 3, y: 7 });
        assert_eq!(*fired.lock().unwrap(), vec![(3, 7)]);
    }

    #[test]
    fn cleanup_stops_the_slot_and_cancels_the_trailing_call() {
        let source: Signal<()> = create_signal();
        let state = timer_state();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let detach = connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            None,
            &state,
        );
        emit_signal(&source, &());
        assert_eq!(*count.lock().unwrap(), 1);
        emit_signal(&source, &());
        detach();
        advance_signal_timers(&state, 200.0);
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn fires_the_first_emission_on_the_trailing_edge_when_leading_is_disabled() {
        let source: Signal<i32> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        let options = SignalThrottleOptions {
            leading: Some(false),
            trailing: Some(true),
        };
        connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |value: &i32| out.lock().unwrap().push(*value)),
            Some(&options),
            &state,
        );
        emit_signal(&source, &3);
        assert!(fired.lock().unwrap().is_empty());
        advance_signal_timers(&state, 99.0);
        assert!(fired.lock().unwrap().is_empty());
        advance_signal_timers(&state, 100.0);
        assert_eq!(*fired.lock().unwrap(), vec![3]);
    }

    #[test]
    fn ignores_cooldown_emissions_when_trailing_is_disabled() {
        let source: Signal<i32> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        let options = SignalThrottleOptions {
            leading: None,
            trailing: Some(false),
        };
        connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |value: &i32| out.lock().unwrap().push(*value)),
            Some(&options),
            &state,
        );
        emit_signal(&source, &3);
        advance_signal_timers(&state, 50.0);
        emit_signal(&source, &7);
        advance_signal_timers(&state, 150.0);
        assert_eq!(*fired.lock().unwrap(), vec![3]);
    }

    #[test]
    fn does_not_fire_when_both_leading_and_trailing_are_disabled() {
        let source: Signal<i32> = create_signal();
        let state = timer_state();
        let fired: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = fired.clone();
        let options = SignalThrottleOptions {
            leading: Some(false),
            trailing: Some(false),
        };
        connect_signal_throttled(
            &source,
            100.0,
            Arc::new(move |value: &i32| out.lock().unwrap().push(*value)),
            Some(&options),
            &state,
        );
        emit_signal(&source, &3);
        advance_signal_timers(&state, 100.0);
        assert!(fired.lock().unwrap().is_empty());
    }
}

mod create_signal_timer_state {
    use super::*;

    #[test]
    fn allocates_a_distinct_entity_that_still_schedules_timers() {
        let mut first = create_signal_timer_state();
        let mut second = create_signal_timer_state();
        assert_ne!(
            flight_entity::get_entity_uid(&mut first),
            flight_entity::get_entity_uid(&mut second)
        );

        let fired = Arc::new(Mutex::new(0));
        let state = Arc::new(RwLock::new(first));
        let counter = fired.clone();
        set_signal_timeout(
            &state,
            10.0,
            Arc::new(move || {
                *counter.lock().unwrap() += 1;
            }),
        );
        advance_signal_timers(&state, 9.0);
        assert_eq!(*fired.lock().unwrap(), 0);
        advance_signal_timers(&state, 10.0);
        assert_eq!(*fired.lock().unwrap(), 1);
        assert!(state.read().unwrap().timers.is_empty());
    }

    #[test]
    fn starts_at_time_zero_with_no_timers() {
        let state = create_signal_timer_state();
        assert_eq!(state.now_ms, 0.0);
        assert!(state.timers.is_empty());
    }
}

mod initialize_signal_timer_state {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_signal_timer_state() {
        let state = Arc::new(RwLock::new(create_signal_timer_state()));
        set_signal_timeout(&state, 10.0, Arc::new(|| {}));
        advance_signal_timers(&state, 5.0);
        let mut state = state.write().unwrap();
        initialize_signal_timer_state(&mut state);
        assert_eq!(state.now_ms, 0.0);
        assert!(state.timers.is_empty());
    }
}

mod set_signal_timeout {
    use super::*;

    #[test]
    fn schedules_a_callback_relative_to_the_current_time() {
        let state = timer_state();
        let fired = Arc::new(Mutex::new(0));
        let counter = fired.clone();
        advance_signal_timers(&state, 50.0);
        set_signal_timeout(
            &state,
            25.0,
            Arc::new(move || *counter.lock().unwrap() += 1),
        );
        advance_signal_timers(&state, 74.0);
        assert_eq!(*fired.lock().unwrap(), 0);
        advance_signal_timers(&state, 75.0);
        assert_eq!(*fired.lock().unwrap(), 1);
    }

    #[test]
    fn allocates_a_new_id_for_each_timer() {
        let state = timer_state();
        let first = set_signal_timeout(&state, 10.0, Arc::new(|| {}));
        let second = set_signal_timeout(&state, 20.0, Arc::new(|| {}));
        assert_ne!(first, second);
    }

    #[test]
    fn preserves_insertion_order_for_equal_deadlines_across_multi_digit_ids() {
        let state = timer_state();
        let order: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        for value in 0..12 {
            let timer_order = order.clone();
            set_signal_timeout(
                &state,
                10.0,
                Arc::new(move || timer_order.lock().unwrap().push(value)),
            );
        }
        advance_signal_timers(&state, 10.0);
        assert_eq!(*order.lock().unwrap(), (0..12).collect::<Vec<_>>());
    }
}

// Runs `test` on its own thread and fails instead of hanging when it deadlocks.
fn z_run_within_deadline(test: impl FnOnce() + Send + 'static) {
    let (done, finished) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        test();
        done.send(()).unwrap();
    });
    if finished
        .recv_timeout(std::time::Duration::from_secs(5))
        .is_err()
    {
        panic!("signal teardown deadlocked or panicked");
    }
    worker.join().unwrap();
}

// A value whose drop runs `hook`: slots capture one to observe when, and under which locks, the
// signal drops them.
struct DropHook {
    hook: Mutex<Option<Box<dyn FnOnce() + Send>>>,
}

fn z_create_drop_hook(hook: impl FnOnce() + Send + 'static) -> DropHook {
    return DropHook {
        hook: Mutex::new(Some(Box::new(hook))),
    };
}

fn z_run_drop_hook(drop_hook: &DropHook) {
    if let Some(hook) = drop_hook.hook.lock().unwrap().take() {
        hook();
    }
}

impl Drop for DropHook {
    fn drop(&mut self) {
        z_run_drop_hook(self);
    }
}
