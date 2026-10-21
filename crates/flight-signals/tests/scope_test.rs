use std::sync::{Arc, Mutex};

use flight_signals::*;

mod create_signal_scope {
    use super::*;

    #[test]
    fn starts_empty_and_collects_only_the_connections_that_name_it() {
        let scope = create_signal_scope();
        assert!(scope.connections.read().unwrap().is_empty());

        let signal: Signal<()> = create_signal();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(&signal, Arc::new(|_: &()| {}), Some(&options));
        connect_signal_tracked(&signal, Arc::new(|_: &()| {}), None);
        assert_eq!(scope.connections.read().unwrap().len(), 1);
    }

    #[test]
    fn hands_out_an_independent_record_per_call() {
        let first = create_signal_scope();
        let second = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(first.clone()),
        };
        connect_signal_tracked(&signal, Arc::new(|_: &()| {}), Some(&options));
        assert!(second.connections.read().unwrap().is_empty());
    }

    #[test]
    fn registers_a_connection_without_disturbing_its_handle_semantics() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let out = seen.clone();
        let options = SignalTrackedConnectOptions {
            priority: Some(5),
            once: None,
            scope: Some(scope.clone()),
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| out.lock().unwrap().push(7)),
            Some(&options),
        );
        assert!(is_signal_connection_connected(&connection));
        assert!(!is_signal_connection_paused(&connection));
        emit_signal(&signal, &());
        assert_eq!(*seen.lock().unwrap(), vec![7]);
        assert_eq!(scope.connections.read().unwrap().len(), 1);
    }
}

mod disconnect_signal_scope {
    use super::*;

    #[test]
    fn tears_down_every_member_in_one_call_and_empties_the_scope() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let first_calls = calls.clone();
        let first_options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        let first = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| first_calls.lock().unwrap().push("a")),
            Some(&first_options),
        );
        let second_calls = calls.clone();
        let second_options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        let second = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| second_calls.lock().unwrap().push("b")),
            Some(&second_options),
        );

        disconnect_signal_scope(&scope);

        emit_signal(&signal, &());
        assert!(calls.lock().unwrap().is_empty());
        assert!(scope.connections.read().unwrap().is_empty());
        assert!(!is_signal_connection_connected(&first));
        assert!(!is_signal_connection_connected(&second));
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn is_idempotent_across_repeated_teardowns() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(&signal, Arc::new(move |_: &()| *counter.lock().unwrap() += 1), Some(&options));

        disconnect_signal_scope(&scope);
        disconnect_signal_scope(&scope);
        disconnect_signal_scope(&scope);

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 0);
        assert!(scope.connections.read().unwrap().is_empty());
    }

    #[test]
    fn accepts_an_empty_scope() {
        let scope = create_signal_scope();
        disconnect_signal_scope(&scope);
        assert!(scope.connections.read().unwrap().is_empty());
    }

    #[test]
    fn leaves_untracked_and_unscoped_tracked_connections_on_the_signal() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let plain_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| plain_calls.lock().unwrap().push("plain")),
            None,
        );
        let unscoped_calls = calls.clone();
        let unscoped = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| unscoped_calls.lock().unwrap().push("unscoped")),
            None,
        );
        let scoped_calls = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| scoped_calls.lock().unwrap().push("scoped")),
            Some(&options),
        );

        disconnect_signal_scope(&scope);

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["plain", "unscoped"]);
        assert!(is_signal_connection_connected(&unscoped));
    }

    #[test]
    fn disconnects_a_paused_member_rather_than_skipping_it() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );
        pause_signal_connection(&connection);

        disconnect_signal_scope(&scope);

        assert!(!is_signal_connection_connected(&connection));
        resume_signal_connection(&connection);
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 0);
        assert!(is_signal_connection_paused(&connection));
    }

    #[test]
    fn passes_over_a_member_already_disconnected_through_its_own_handle() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let first_calls = calls.clone();
        let first_options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        let first = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| first_calls.lock().unwrap().push("a")),
            Some(&first_options),
        );
        let second_calls = calls.clone();
        let second_options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        let second = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| second_calls.lock().unwrap().push("b")),
            Some(&second_options),
        );
        disconnect_signal_connection(&first);

        disconnect_signal_scope(&scope);

        emit_signal(&signal, &());
        assert!(calls.lock().unwrap().is_empty());
        assert!(!is_signal_connection_connected(&second));
        assert!(scope.connections.read().unwrap().is_empty());
    }

    #[test]
    fn passes_over_a_once_member_that_already_fired() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: Some(true),
            scope: Some(scope.clone()),
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 1);
        assert!(!is_signal_connection_connected(&connection));

        disconnect_signal_scope(&scope);
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 1);
        assert!(scope.connections.read().unwrap().is_empty());
    }

    #[test]
    fn tears_down_a_once_member_that_never_fired() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: Some(true),
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(&signal, Arc::new(move |_: &()| *counter.lock().unwrap() += 1), Some(&options));

        disconnect_signal_scope(&scope);

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 0);
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn holds_only_the_replacement_after_a_member_tears_the_scope_down_and_reconnects() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let readded = Arc::new(Mutex::new(false));
        let member_signal = signal.clone();
        let member_scope = scope.clone();
        let member_calls = calls.clone();
        let member_readded = readded.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| {
                member_calls.lock().unwrap().push("member");
                let mut readded = member_readded.lock().unwrap();
                if *readded {
                    return;
                }
                *readded = true;
                drop(readded);
                disconnect_signal_scope(&member_scope);
                let replacement_calls = member_calls.clone();
                let replacement_options = SignalTrackedConnectOptions {
                    priority: None,
                    once: None,
                    scope: Some(member_scope.clone()),
                };
                connect_signal_tracked(
                    &member_signal,
                    Arc::new(move |_: &()| replacement_calls.lock().unwrap().push("replacement")),
                    Some(&replacement_options),
                );
            }),
            Some(&options),
        );

        emit_signal(&signal, &());
        assert_eq!(scope.connections.read().unwrap().len(), 1);
        assert!(is_signal_connection_connected(
            &scope.connections.read().unwrap()[0]
        ));

        calls.lock().unwrap().clear();
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["replacement"]);
    }

    #[test]
    fn tears_the_scope_down_from_inside_a_dispatch_without_skipping_surviving_slots() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let member_scope = scope.clone();
        let first_calls = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| {
                first_calls.lock().unwrap().push("first");
                disconnect_signal_scope(&member_scope);
            }),
            Some(&options),
        );
        let scoped_calls = calls.clone();
        let scoped_options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| scoped_calls.lock().unwrap().push("scoped")),
            Some(&scoped_options),
        );
        let plain_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| plain_calls.lock().unwrap().push("plain")),
            None,
        );

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["first", "plain"]);
        assert!(scope.connections.read().unwrap().is_empty());
    }

    #[test]
    fn drops_the_same_connection_listed_twice_without_throwing() {
        let scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        let connection = connect_signal_tracked(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );
        scope.connections.write().unwrap().push(connection.clone());

        disconnect_signal_scope(&scope);

        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 0);
        assert!(!is_signal_connection_connected(&connection));
    }
}

mod initialize_signal_scope {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_signal_scope() {
        let mut scope = create_signal_scope();
        let signal: Signal<()> = create_signal();
        let options = SignalTrackedConnectOptions {
            priority: None,
            once: None,
            scope: Some(scope.clone()),
        };
        connect_signal_tracked(&signal, Arc::new(|_: &()| {}), Some(&options));
        assert_eq!(scope.connections.read().unwrap().len(), 1);
        flight_signals::contract::initialize_signal_scope(&mut scope);
        assert!(scope.connections.read().unwrap().is_empty());
    }
}
