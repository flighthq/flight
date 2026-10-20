use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::*;

mod create_signal_scope_tests {
    use super::*;

    #[test]
    fn hands_out_an_independent_record_per_call() {
        let first = create_signal_scope();
        let second = create_signal_scope();
        let signal = create_signal();
        connect_signal_tracked(
            &signal,
            Rc::new(|_: Rc<dyn Any>| {}),
            None,
            Some(&first),
        );
        assert!(second.connections.borrow().is_empty());
    }

    #[test]
    fn registers_a_connection_without_disturbing_its_handle_semantics() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let seen = Rc::new(RefCell::new(Vec::<i32>::new()));
        let seen_c = seen.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                seen_c.borrow_mut().push(v);
            }),
            Some(&SignalTrackedConnectOptions {
                priority: Some(5),
                once: false,
            }),
            Some(&scope),
        );
        assert!(connection.borrow().connected);
        assert!(!connection.borrow().paused);
        emit_signal(&signal, Rc::new(7_i32));
        assert_eq!(*seen.borrow(), vec![7]);
        assert!(Rc::ptr_eq(
            &scope.connections.borrow()[0],
            &connection,
        ));
    }

    #[test]
    fn starts_empty_and_collects_only_the_connections_that_name_it() {
        let scope = create_signal_scope();
        assert!(scope.connections.borrow().is_empty());

        let signal = create_signal();
        connect_signal_tracked(
            &signal,
            Rc::new(|_: Rc<dyn Any>| {}),
            None,
            Some(&scope),
        );
        connect_signal_tracked(&signal, Rc::new(|_: Rc<dyn Any>| {}), None, None);
        assert_eq!(scope.connections.borrow().len(), 1);
    }
}

mod disconnect_signal_scope_tests {
    use super::*;

    #[test]
    fn accepts_an_empty_scope() {
        let scope = create_signal_scope();
        disconnect_signal_scope(&scope); // should not panic
        assert!(scope.connections.borrow().is_empty());
    }

    #[test]
    fn disconnects_a_paused_member_rather_than_skipping_it() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(0));
        let calls_c = calls.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *calls_c.borrow_mut() += 1;
            }),
            None,
            Some(&scope),
        );
        pause_signal_connection(&connection);

        disconnect_signal_scope(&scope);

        assert!(!connection.borrow().connected);
        // Resume must not resurrect a torn-down connection
        resume_signal_connection(&connection);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), 0);
        assert!(connection.borrow().paused);
    }

    #[test]
    fn drops_the_same_connection_listed_twice_without_throwing() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(0));
        let calls_c = calls.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *calls_c.borrow_mut() += 1;
            }),
            None,
            Some(&scope),
        );
        // Manually push a duplicate
        scope.connections.borrow_mut().push(connection.clone());

        disconnect_signal_scope(&scope); // should not panic

        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), 0);
        assert!(!is_slot_connected(&signal, &connection.borrow().slot));
    }

    #[test]
    fn holds_only_the_replacement_after_a_member_tears_the_scope_down_and_reconnects() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let readded = Rc::new(RefCell::new(false));

        let scope_c = scope.clone();
        let signal_c = signal.clone();
        let calls_c = calls.clone();
        let readded_c = readded.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("member".to_string());
                if *readded_c.borrow() {
                    return;
                }
                *readded_c.borrow_mut() = true;
                disconnect_signal_scope(&scope_c);
                let calls_inner = calls_c.clone();
                connect_signal_tracked(
                    &signal_c,
                    Rc::new(move |_: Rc<dyn Any>| {
                        calls_inner.borrow_mut().push("replacement".to_string());
                    }),
                    None,
                    Some(&scope_c),
                );
            }),
            None,
            Some(&scope),
        );

        emit_signal(&signal, Rc::new(()));
        assert_eq!(scope.connections.borrow().len(), 1);
        assert!(scope.connections.borrow()[0].borrow().connected);

        calls.borrow_mut().clear();
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["replacement"]);
    }

    #[test]
    fn is_idempotent_across_repeated_teardowns() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(0));
        let calls_c = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *calls_c.borrow_mut() += 1;
            }),
            None,
            Some(&scope),
        );

        disconnect_signal_scope(&scope);
        disconnect_signal_scope(&scope); // should not panic
        disconnect_signal_scope(&scope);

        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), 0);
        assert!(scope.connections.borrow().is_empty());
    }

    #[test]
    fn leaves_untracked_and_unscoped_tracked_connections_on_the_signal() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c.borrow_mut().push("plain".to_string())),
            None,
        );
        let calls_c2 = calls.clone();
        let unscoped = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("unscoped".to_string())),
            None,
            None,
        );
        let calls_c3 = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c3.borrow_mut().push("scoped".to_string())),
            None,
            Some(&scope),
        );

        disconnect_signal_scope(&scope);

        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["plain", "unscoped"]);
        assert!(unscoped.borrow().connected);
    }

    #[test]
    fn passes_over_a_member_already_disconnected_through_its_own_handle() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        let first = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c.borrow_mut().push("a".to_string())),
            None,
            Some(&scope),
        );
        let calls_c2 = calls.clone();
        let second = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("b".to_string())),
            None,
            Some(&scope),
        );
        disconnect_signal_connection(&first);

        disconnect_signal_scope(&scope); // should not panic

        emit_signal(&signal, Rc::new(()));
        assert!(calls.borrow().is_empty());
        assert!(!second.borrow().connected);
        assert!(scope.connections.borrow().is_empty());
    }

    #[test]
    fn passes_over_a_once_member_that_already_fired() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(0));
        let calls_c = calls.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *calls_c.borrow_mut() += 1;
            }),
            Some(&SignalTrackedConnectOptions {
                once: true,
                ..Default::default()
            }),
            Some(&scope),
        );

        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), 1);
        assert!(!connection.borrow().connected);

        disconnect_signal_scope(&scope);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), 1);
        assert!(scope.connections.borrow().is_empty());
    }

    #[test]
    fn tears_down_a_once_member_that_never_fired() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(0));
        let calls_c = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *calls_c.borrow_mut() += 1;
            }),
            Some(&SignalTrackedConnectOptions {
                once: true,
                ..Default::default()
            }),
            Some(&scope),
        );

        disconnect_signal_scope(&scope);

        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), 0);
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn tears_down_every_member_in_one_call_and_empties_the_scope() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        let first = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c.borrow_mut().push("a".to_string())),
            None,
            Some(&scope),
        );
        let calls_c2 = calls.clone();
        let second = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("b".to_string())),
            None,
            Some(&scope),
        );

        disconnect_signal_scope(&scope);

        emit_signal(&signal, Rc::new(()));
        assert!(calls.borrow().is_empty());
        assert!(scope.connections.borrow().is_empty());
        assert!(!first.borrow().connected);
        assert!(!second.borrow().connected);
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn tears_the_scope_down_from_inside_a_dispatch_without_skipping_the_surviving_slots() {
        let scope = create_signal_scope();
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let scope_c = scope.clone();
        let calls_c = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("first".to_string());
                disconnect_signal_scope(&scope_c);
            }),
            None,
            Some(&scope),
        );
        let calls_c2 = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("scoped".to_string())),
            None,
            Some(&scope),
        );
        let calls_c3 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c3.borrow_mut().push("plain".to_string())),
            None,
        );

        emit_signal(&signal, Rc::new(()));

        assert_eq!(*calls.borrow(), vec!["first", "plain"]);
        assert!(scope.connections.borrow().is_empty());
    }
}

mod initialize_signal_scope_tests {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_signal_scope() {
        let mut scope = SignalScope::default();
        initialize_signal_scope(&mut scope);
        assert!(scope.connections.borrow().is_empty());
    }
}
