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
        let received = Arc::new(Mutex::new(Vec::new()));
        for (label, priority) in [("low", -1), ("high", 10), ("normal", 0)] {
            let received = received.clone();
            let options = SignalConnectOptions {
                priority: Some(priority),
                once: None,
            };
            connect_signal(
                &signal,
                Arc::new(move |event: &ValueEvent| {
                    received
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
        let calls = Arc::new(Mutex::new(Vec::new()));
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

        calls.lock().unwrap().clear();
        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["a", "b", "added"]);
    }

    #[test]
    fn still_calls_a_copied_slot_removed_during_the_current_dispatch() {
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let id_holder = Arc::new(Mutex::new(None));
        let holder = id_holder.clone();
        let first_calls = calls.clone();
        let first_signal = signal.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                first_calls.lock().unwrap().push("first");
                let id = *holder.lock().unwrap();
                if let Some(id) = id {
                    disconnect_signal(&first_signal, id);
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

        calls.lock().unwrap().clear();
        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first"]);
    }

    #[test]
    fn gives_a_nested_safe_emission_its_own_snapshot_and_arguments() {
        let signal: Signal<TextEvent> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
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
        let calls = Arc::new(Mutex::new(Vec::new()));
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
                let mut nested = nested.lock().unwrap();
                if !*nested {
                    *nested = true;
                    drop(nested);
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
        let calls = Arc::new(Mutex::new(Vec::new()));
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
}
