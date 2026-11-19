use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_signals::*;

struct ValueEvent {
    value: i32,
}

#[derive(Clone)]
struct TextEvent {
    value: &'static str,
}

mod emit_signal_safe {
    use super::*;

    #[test]
    fn passes_typed_payload_in_priority_order() {
        let signal: Signal<ValueEvent> = create_signal();
        let received: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        for (label, priority) in [("low", -1), ("high", 10), ("normal", 0)] {
            let received_for_slot = received.clone();
            let options = SignalConnectOptions {
                priority: Some(priority),
                once: None,
            };
            connect_signal(
                &signal,
                Arc::new(move |event: &ValueEvent| {
                    received_for_slot
                        .lock()
                        .unwrap()
                        .push(format!("{}:{}", label, event.value));
                }),
                Some(&options),
            );
        }
        emit_signal_safe(&signal, &ValueEvent { value: 42 });
        assert_eq!(
            *received.lock().unwrap(),
            vec![
                "high:42".to_string(),
                "normal:42".to_string(),
                "low:42".to_string()
            ]
        );
    }

    #[test]
    fn does_not_call_a_slot_added_during_the_current_dispatch() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let added = Arc::new(Mutex::new(false));
        let slot_signal = signal.clone();
        let a_calls = calls.clone();
        let a_added = added.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                a_calls.lock().unwrap().push("a");
                let mut added = a_added.lock().unwrap();
                if !*added {
                    *added = true;
                    drop(added);
                    let added_calls = a_calls.clone();
                    connect_signal(
                        &slot_signal,
                        Arc::new(move |_: &()| added_calls.lock().unwrap().push("added")),
                        None,
                    );
                }
            }),
            None,
        );
        let b_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| b_calls.lock().unwrap().push("b")),
            None,
        );

        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["a", "b"]);

        *calls.lock().unwrap() = Vec::new();
        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["a", "b", "added"]);
    }

    #[test]
    fn still_calls_a_copied_slot_removed_during_the_current_dispatch() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let id_holder: Arc<Mutex<Option<SlotId>>> = Arc::new(Mutex::new(None));
        let holder = id_holder.clone();
        let first_calls = calls.clone();
        let first_signal = signal.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                first_calls.lock().unwrap().push("first");
                let current_id = *holder.lock().unwrap();
                if let Some(current_id) = current_id {
                    disconnect_signal(&first_signal, current_id);
                }
            }),
            None,
        );
        let removed_calls = calls.clone();
        let removed_id = connect_signal(
            &signal,
            Arc::new(move |_: &()| removed_calls.lock().unwrap().push("removed")),
            None,
        );
        *id_holder.lock().unwrap() = Some(removed_id);

        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first", "removed"]);

        *calls.lock().unwrap() = Vec::new();
        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first"]);
    }

    #[test]
    fn gives_a_nested_safe_emission_its_own_snapshot_and_arguments() {
        let signal: Signal<TextEvent> = create_signal();
        let calls: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let nested = Arc::new(Mutex::new(false));
        let nested_signal = signal.clone();
        let a_calls = calls.clone();
        let a_nested = nested.clone();
        connect_signal(
            &signal,
            Arc::new(move |event: &TextEvent| {
                a_calls.lock().unwrap().push(format!("a:{}", event.value));
                let mut nested = a_nested.lock().unwrap();
                if !*nested {
                    *nested = true;
                    drop(nested);
                    emit_signal_safe(&nested_signal, &TextEvent { value: "nested" });
                }
            }),
            None,
        );
        let b_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |event: &TextEvent| {
                b_calls.lock().unwrap().push(format!("b:{}", event.value))
            }),
            None,
        );

        emit_signal_safe(&signal, &TextEvent { value: "outer" });
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["a:outer", "a:nested", "b:nested", "b:outer"]
        );
    }

    #[test]
    fn removes_a_once_slot_before_invoking_it_so_a_nested_emission_cannot_repeat_it() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let once_calls = calls.clone();
        let nested = Arc::new(Mutex::new(false));
        let nested_signal = signal.clone();
        let options = SignalConnectOptions {
            priority: None,
            once: Some(true),
        };
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                once_calls.lock().unwrap().push("once");
                let mut nested_flag = nested.lock().unwrap();
                if !*nested_flag {
                    *nested_flag = true;
                    drop(nested_flag);
                    emit_signal_safe(&nested_signal, &());
                }
            }),
            Some(&options),
        );
        let tail_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| tail_calls.lock().unwrap().push("tail")),
            None,
        );

        emit_signal_safe(&signal, &());
        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["once", "tail", "tail", "tail"]);
    }

    #[test]
    fn stops_after_cancellation_and_resets_cancellation_before_the_next_emission() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let cancel = Arc::new(Mutex::new(true));
        let first_calls = calls.clone();
        let first_cancel = cancel.clone();
        let cancel_signal_handle = signal.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                first_calls.lock().unwrap().push("first");
                let cancel = *first_cancel.lock().unwrap();
                if cancel {
                    cancel_signal(&cancel_signal_handle);
                }
            }),
            None,
        );
        let second_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| second_calls.lock().unwrap().push("second")),
            None,
        );

        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first"]);

        *cancel.lock().unwrap() = false;
        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first", "first", "second"]);
    }

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal: Signal<()> = create_signal();
        emit_signal_safe(&signal, &());
    }

    #[test]
    fn concurrent_safe_and_native_emitters_invoke_a_once_listener_exactly_once() {
        z_run_within_deadline(|| {
            assert_eq!(z_race_once_listener(true, false), (1, 1, true, false));
            assert_eq!(z_race_once_listener(false, true), (1, 1, true, false));
        });
    }

    #[test]
    fn concurrent_safe_emitters_invoke_a_once_listener_exactly_once() {
        z_run_within_deadline(|| {
            assert_eq!(z_race_once_listener(true, true), (1, 1, true, false));
        });
    }
}

// Two emitters reach one once listener together: a higher-priority repeating slot holds both at
// a barrier, so each has already captured (safe) or is about to read (native) the once
// registration before either claims it. Returns (callbacks, releases, released_after_callback,
// still_connected).
fn z_race_once_listener(first_safe: bool, second_safe: bool) -> (usize, usize, bool, bool) {
    let signal: Signal<()> = create_signal();
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let gate = barrier.clone();
    connect_signal(
        &signal,
        Arc::new(move |_: &()| {
            gate.wait();
        }),
        Some(&SignalConnectOptions {
            priority: Some(1),
            once: None,
        }),
    );
    let calls = Arc::new(AtomicUsize::new(0));
    let finished = Arc::new(AtomicBool::new(false));
    let releases = Arc::new(AtomicUsize::new(0));
    let released_after_callback = Arc::new(AtomicBool::new(false));
    let (hook_finished, hook_releases, hook_after) = (
        finished.clone(),
        releases.clone(),
        released_after_callback.clone(),
    );
    let hook = z_create_drop_hook(move || {
        hook_after.store(hook_finished.load(Ordering::SeqCst), Ordering::SeqCst);
        hook_releases.fetch_add(1, Ordering::SeqCst);
    });
    let (slot_calls, slot_finished) = (calls.clone(), finished.clone());
    let connection = connect_signal_tracked(
        &signal,
        Arc::new(move |_: &()| {
            let _ = &hook;
            slot_calls.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(20));
            slot_finished.store(true, Ordering::SeqCst);
        }),
        Some(&SignalTrackedConnectOptions {
            priority: None,
            once: Some(true),
            scope: None,
        }),
    );
    let emitters: Vec<_> = [first_safe, second_safe]
        .into_iter()
        .map(|safe| {
            let emitter = signal.clone();
            std::thread::spawn(move || {
                if safe {
                    emit_signal_safe(&emitter, &());
                } else {
                    emit_signal(&emitter, &());
                }
            })
        })
        .collect();
    for emitter in emitters {
        emitter.join().unwrap();
    }
    return (
        calls.load(Ordering::SeqCst),
        releases.load(Ordering::SeqCst),
        released_after_callback.load(Ordering::SeqCst),
        is_signal_connection_connected(&connection),
    );
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
