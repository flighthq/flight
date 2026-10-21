use std::sync::{Arc, Mutex};

use flight_signals::*;

mod connect_signal_tracked {
    use super::*;

    #[test]
    fn returns_a_connected_handle_whose_slot_receives_typed_payload() {
        struct ValueEvent {
            value: i32,
        }

        let signal: Signal<ValueEvent> = create_signal();
        let received = Arc::new(Mutex::new(Vec::new()));
        let out = received.clone();
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |event: &ValueEvent| out.lock().unwrap().push(event.value)),
            None,
        );

        assert!(is_signal_connection_connected(&connection));
        assert!(!is_signal_connection_paused(&connection));

        emit_signal(&signal, &ValueEvent { value: 42 });
        assert_eq!(*received.lock().unwrap(), vec![42]);
    }

    #[test]
    fn preserves_priority_ordering_among_tracked_and_ordinary_slots() {
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));

        let low_calls = calls.clone();
        let low_options = SignalConnectOptions {
            priority: Some(-1),
            once: None,
        };
        connect_signal(
            &signal,
            Arc::new(move |_: &()| low_calls.lock().unwrap().push("low")),
            Some(&low_options),
        );
        let high_calls = calls.clone();
        let high_options = SignalTrackedConnectOptions {
            priority: Some(10),
            once: None,
            scope: None,
        };
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| high_calls.lock().unwrap().push("high")),
            Some(&high_options),
        );
        let normal_calls = calls.clone();
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| normal_calls.lock().unwrap().push("normal")),
            None,
        );

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["high", "normal", "low"]);
    }

    #[test]
    fn disconnects_a_once_connection_after_one_ordinary_emission() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: Some(true),
            scope: None,
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );

        emit_signal(&signal, &());
        emit_signal(&signal, &());

        assert_eq!(*count.lock().unwrap(), 1);
        assert!(!is_signal_connection_connected(&connection));
    }

    #[test]
    fn disconnects_a_once_connection_after_one_safe_emission() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: Some(true),
            scope: None,
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );

        emit_signal_safe(&signal, &());
        emit_signal_safe(&signal, &());

        assert_eq!(*count.lock().unwrap(), 1);
        assert!(!is_signal_connection_connected(&connection));
    }

    #[test]
    fn skips_a_connection_disconnected_before_its_turn_in_ordinary_dispatch() {
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let later_calls = calls.clone();
        let later = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| later_calls.lock().unwrap().push("later")),
            None,
        );
        let first_calls = calls.clone();
        let first_options = SignalTrackedConnectOptions {
            priority: Some(10),
            once: None,
            scope: None,
        };
        let later_for_disconnect = later.clone();
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| {
                first_calls.lock().unwrap().push("first");
                disconnect_signal_connection(&later_for_disconnect);
            }),
            Some(&first_options),
        );

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first"]);
        assert!(!is_signal_connection_connected(&later));
    }

    #[test]
    fn still_invokes_a_snapshotted_connection_disconnected_during_safe_dispatch() {
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let later_calls = calls.clone();
        let later = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| later_calls.lock().unwrap().push("later")),
            None,
        );
        let first_calls = calls.clone();
        let first_options = SignalTrackedConnectOptions {
            priority: Some(10),
            once: None,
            scope: None,
        };
        let later_for_disconnect = later.clone();
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| {
                first_calls.lock().unwrap().push("first");
                disconnect_signal_connection(&later_for_disconnect);
            }),
            Some(&first_options),
        );

        emit_signal_safe(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first", "later"]);
        assert!(!is_signal_connection_connected(&later));
    }
}

mod disconnect_signal_connection {
    use super::*;

    #[test]
    fn disconnects_idempotently_and_records_the_inactive_state() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            None,
        );

        disconnect_signal_connection(&connection);
        disconnect_signal_connection(&connection);
        emit_signal(&signal, &());

        assert_eq!(*count.lock().unwrap(), 0);
        assert!(!is_signal_connection_connected(&connection));
    }
}

mod is_signal_connection_connected {
    use super::*;

    #[test]
    fn returns_true_while_the_registration_is_live() {
        let signal: Signal<()> = create_signal();
        let connection = connect_signal_tracked(&signal, Arc::new(|_: &()| {}), None);
        assert!(is_signal_connection_connected(&connection));
    }

    #[test]
    fn returns_false_after_disconnect() {
        let signal: Signal<()> = create_signal();
        let connection = connect_signal_tracked(&signal, Arc::new(|_: &()| {}), None);
        disconnect_signal_connection(&connection);
        assert!(!is_signal_connection_connected(&connection));
    }
}

mod is_signal_connection_paused {
    use super::*;

    #[test]
    fn returns_false_for_an_active_connection() {
        let signal: Signal<()> = create_signal();
        let connection = connect_signal_tracked(&signal, Arc::new(|_: &()| {}), None);
        assert!(!is_signal_connection_paused(&connection));
    }

    #[test]
    fn returns_true_after_pausing() {
        let signal: Signal<()> = create_signal();
        let connection = connect_signal_tracked(&signal, Arc::new(|_: &()| {}), None);
        pause_signal_connection(&connection);
        assert!(is_signal_connection_paused(&connection));
    }
}

mod pause_signal_connection {
    use super::*;

    #[test]
    fn skips_a_paused_connection_during_ordinary_emission_without_removing_it() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            None,
        );

        pause_signal_connection(&connection);
        emit_signal(&signal, &());

        assert_eq!(*count.lock().unwrap(), 0);
        assert!(is_signal_connection_connected(&connection));
        assert!(is_signal_connection_paused(&connection));
    }

    #[test]
    fn skips_a_paused_connection_during_safe_emission_without_removing_it() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            None,
        );

        pause_signal_connection(&connection);
        emit_signal_safe(&signal, &());

        assert_eq!(*count.lock().unwrap(), 0);
        assert!(is_signal_connection_connected(&connection));
    }

    #[test]
    fn does_not_consume_a_paused_once_connection_in_either_emission_mode() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: Some(true),
            scope: None,
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );

        pause_signal_connection(&connection);
        emit_signal(&signal, &());
        emit_signal_safe(&signal, &());
        resume_signal_connection(&connection);
        emit_signal(&signal, &());
        emit_signal_safe(&signal, &());

        assert_eq!(*count.lock().unwrap(), 1);
        assert!(!is_signal_connection_connected(&connection));
    }
}

mod resume_signal_connection {
    use super::*;

    #[test]
    fn restores_a_paused_connection_at_its_original_priority_position() {
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let high_calls = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: Some(10),
            once: None,
            scope: None,
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| high_calls.lock().unwrap().push("high")),
            Some(&options),
        );
        let low_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| low_calls.lock().unwrap().push("low")),
            None,
        );

        pause_signal_connection(&connection);
        emit_signal(&signal, &());
        resume_signal_connection(&connection);
        emit_signal(&signal, &());

        assert_eq!(*calls.lock().unwrap(), vec!["low", "high", "low"]);
        assert!(is_signal_connection_connected(&connection));
        assert!(!is_signal_connection_paused(&connection));
    }
}
