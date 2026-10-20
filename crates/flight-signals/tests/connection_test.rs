use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::*;

mod connect_signal_tracked_tests {
    use super::*;

    #[test]
    fn disconnects_a_once_connection_after_one_ordinary_emission() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            Some(&SignalTrackedConnectOptions {
                once: true,
                ..Default::default()
            }),
            None,
        );

        emit_signal(&signal, Rc::new(()));
        emit_signal(&signal, Rc::new(()));

        assert_eq!(*count.borrow(), 1);
        assert!(!connection.borrow().connected);
        assert!(!is_slot_connected(&signal, &connection.borrow().slot));
    }

    #[test]
    fn disconnects_a_once_connection_after_one_safe_emission() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            Some(&SignalTrackedConnectOptions {
                once: true,
                ..Default::default()
            }),
            None,
        );

        emit_signal_safe(&signal, Rc::new(()));
        emit_signal_safe(&signal, Rc::new(()));

        assert_eq!(*count.borrow(), 1);
        assert!(!connection.borrow().connected);
        assert!(!is_slot_connected(&signal, &connection.borrow().slot));
    }

    #[test]
    fn preserves_priority_ordering_among_tracked_and_ordinary_slots() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c.borrow_mut().push("low".to_string())),
            Some(&SignalConnectOptions {
                priority: -1,
                once: false,
            }),
        );
        let calls_c2 = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("high".to_string())),
            Some(&SignalTrackedConnectOptions {
                priority: Some(10),
                once: false,
            }),
            None,
        );
        let calls_c3 = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c3.borrow_mut().push("normal".to_string())),
            None,
            None,
        );

        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["high", "normal", "low"]);
    }

    #[test]
    fn returns_a_connected_handle_whose_slot_receives_typed_arguments() {
        let signal = create_signal();
        let received = Rc::new(RefCell::new(Vec::<i32>::new()));
        let received_c = received.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                received_c.borrow_mut().push(v);
            }),
            None,
            None,
        );

        assert!(Rc::ptr_eq(&connection.borrow().signal.data, &signal.data));
        assert!(connection.borrow().connected);
        assert!(!connection.borrow().paused);
        assert!(is_slot_connected(&signal, &connection.borrow().slot));

        emit_signal(&signal, Rc::new(42_i32));
        assert_eq!(*received.borrow(), vec![42]);
    }

    #[test]
    fn skips_a_connection_disconnected_before_its_turn_in_ordinary_dispatch() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        let later = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c.borrow_mut().push("later".to_string())),
            None,
            None,
        );
        let later_clone = later.clone();
        let calls_c2 = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c2.borrow_mut().push("first".to_string());
                disconnect_signal_connection(&later_clone);
            }),
            Some(&SignalTrackedConnectOptions {
                priority: Some(10),
                once: false,
            }),
            None,
        );

        emit_signal(&signal, Rc::new(()));

        assert_eq!(*calls.borrow(), vec!["first"]);
        assert!(!later.borrow().connected);
    }

    #[test]
    fn still_invokes_a_snapshotted_connection_disconnected_during_safe_dispatch() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        let later = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c.borrow_mut().push("later".to_string())),
            None,
            None,
        );
        let later_clone = later.clone();
        let calls_c2 = calls.clone();
        connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c2.borrow_mut().push("first".to_string());
                disconnect_signal_connection(&later_clone);
            }),
            Some(&SignalTrackedConnectOptions {
                priority: Some(10),
                once: false,
            }),
            None,
        );

        emit_signal_safe(&signal, Rc::new(()));

        assert_eq!(*calls.borrow(), vec!["first", "later"]);
        assert!(!later.borrow().connected);
    }
}

mod disconnect_signal_connection_tests {
    use super::*;

    #[test]
    fn disconnects_idempotently_and_records_the_inactive_state() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
            None,
        );

        disconnect_signal_connection(&connection);
        disconnect_signal_connection(&connection);
        emit_signal(&signal, Rc::new(()));

        assert_eq!(*count.borrow(), 0);
        assert!(!connection.borrow().connected);
        assert!(!is_slot_connected(&signal, &connection.borrow().slot));
    }
}

mod pause_signal_connection_tests {
    use super::*;

    #[test]
    fn does_not_consume_a_paused_once_connection_in_either_emission_mode() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            Some(&SignalTrackedConnectOptions {
                once: true,
                ..Default::default()
            }),
            None,
        );

        pause_signal_connection(&connection);
        emit_signal(&signal, Rc::new(()));
        emit_signal_safe(&signal, Rc::new(()));
        resume_signal_connection(&connection);
        emit_signal(&signal, Rc::new(()));
        emit_signal_safe(&signal, Rc::new(()));

        assert_eq!(*count.borrow(), 1);
        assert!(!connection.borrow().connected);
    }

    #[test]
    fn skips_a_paused_connection_during_ordinary_emission_without_removing_it() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
            None,
        );

        pause_signal_connection(&connection);
        emit_signal(&signal, Rc::new(()));

        assert_eq!(*count.borrow(), 0);
        assert!(connection.borrow().connected);
        assert!(connection.borrow().paused);
        assert!(is_slot_connected(&signal, &connection.borrow().slot));
    }

    #[test]
    fn skips_a_paused_connection_during_safe_emission_without_removing_it() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
            None,
        );

        pause_signal_connection(&connection);
        emit_signal_safe(&signal, Rc::new(()));

        assert_eq!(*count.borrow(), 0);
        assert!(connection.borrow().connected);
        assert!(connection.borrow().paused);
        assert!(is_slot_connected(&signal, &connection.borrow().slot));
    }
}

mod resume_signal_connection_tests {
    use super::*;

    #[test]
    fn restores_a_paused_connection_at_its_original_priority_position() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        let connection = connect_signal_tracked(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c.borrow_mut().push("high".to_string())),
            Some(&SignalTrackedConnectOptions {
                priority: Some(10),
                once: false,
            }),
            None,
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("low".to_string())),
            None,
        );

        pause_signal_connection(&connection);
        emit_signal(&signal, Rc::new(()));
        resume_signal_connection(&connection);
        emit_signal(&signal, Rc::new(()));

        assert_eq!(*calls.borrow(), vec!["low", "high", "low"]);
        assert!(connection.borrow().connected);
        assert!(!connection.borrow().paused);
    }
}
