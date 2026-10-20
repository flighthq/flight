use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::*;

mod emit_signal_safe_tests {
    use super::*;

    #[test]
    fn does_not_call_a_slot_added_during_the_current_safe_dispatch() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let added = Rc::new(RefCell::new(false));

        let signal_c = signal.clone();
        let calls_c = calls.clone();
        let added_c = added.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("a".to_string());
                if !*added_c.borrow() {
                    *added_c.borrow_mut() = true;
                    let calls_inner = calls_c.clone();
                    connect_signal(
                        &signal_c,
                        Rc::new(move |_: Rc<dyn Any>| {
                            calls_inner.borrow_mut().push("added".to_string());
                        }),
                        None,
                    );
                }
            }),
            None,
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("b".to_string())),
            None,
        );

        emit_signal_safe(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["a", "b"]);

        calls.borrow_mut().clear();
        emit_signal_safe(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["a", "b", "added"]);
    }

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal = create_signal();
        emit_signal_safe(&signal, Rc::new(())); // should not panic
    }

    #[test]
    fn gives_a_nested_safe_emission_its_own_snapshot_and_arguments() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let nested = Rc::new(RefCell::new(false));

        let signal_c = signal.clone();
        let calls_c = calls.clone();
        let nested_c = nested.clone();
        connect_signal(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let value = args.downcast_ref::<String>().unwrap().clone();
                calls_c.borrow_mut().push(format!("a:{}", value));
                if !*nested_c.borrow() {
                    *nested_c.borrow_mut() = true;
                    emit_signal_safe(&signal_c, Rc::new("nested".to_string()));
                }
            }),
            None,
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let value = args.downcast_ref::<String>().unwrap().clone();
                calls_c2.borrow_mut().push(format!("b:{}", value));
            }),
            None,
        );

        emit_signal_safe(&signal, Rc::new("outer".to_string()));

        assert_eq!(
            *calls.borrow(),
            vec!["a:outer", "a:nested", "b:nested", "b:outer"]
        );
    }

    #[test]
    fn passes_typed_arguments_in_priority_order() {
        let signal = create_signal();
        let received = Rc::new(RefCell::new(Vec::<String>::new()));
        let received_c = received.clone();
        connect_signal(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                received_c.borrow_mut().push(format!("low:{}", v));
            }),
            Some(&SignalConnectOptions {
                priority: -1,
                once: false,
            }),
        );
        let received_c2 = received.clone();
        connect_signal(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                received_c2.borrow_mut().push(format!("high:{}", v));
            }),
            Some(&SignalConnectOptions {
                priority: 10,
                once: false,
            }),
        );
        let received_c3 = received.clone();
        connect_signal(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                received_c3.borrow_mut().push(format!("normal:{}", v));
            }),
            None,
        );

        emit_signal_safe(&signal, Rc::new(42_i32));

        assert_eq!(*received.borrow(), vec!["high:42", "normal:42", "low:42"]);
    }

    #[test]
    fn removes_a_once_slot_before_invoking_it_so_nested_safe_emission_cannot_repeat_it() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let nested = Rc::new(RefCell::new(false));

        let signal_c = signal.clone();
        let calls_c = calls.clone();
        let nested_c = nested.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("once".to_string());
                if !*nested_c.borrow() {
                    *nested_c.borrow_mut() = true;
                    emit_signal_safe(&signal_c, Rc::new(()));
                }
            }),
            Some(&SignalConnectOptions {
                once: true,
                ..Default::default()
            }),
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("tail".to_string())),
            None,
        );

        emit_signal_safe(&signal, Rc::new(()));
        emit_signal_safe(&signal, Rc::new(()));

        assert_eq!(
            *calls.borrow(),
            vec!["once", "tail", "tail", "tail"]
        );
    }

    #[test]
    fn still_calls_a_copied_slot_removed_during_the_current_safe_dispatch() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let removed: SlotFn = {
            let calls = calls.clone();
            Rc::new(move |_: Rc<dyn Any>| calls.borrow_mut().push("removed".to_string()))
        };
        let removed_ref = removed.clone();
        let signal_c = signal.clone();
        let calls_c = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("first".to_string());
                disconnect_signal(&signal_c, &removed_ref);
            }),
            None,
        );
        connect_signal(&signal, removed, None);

        emit_signal_safe(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["first", "removed"]);

        calls.borrow_mut().clear();
        emit_signal_safe(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["first"]);
    }

    #[test]
    fn stops_after_cancellation_and_resets_cancellation_before_the_next_safe_emission() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let cancel = Rc::new(RefCell::new(true));

        let signal_c = signal.clone();
        let calls_c = calls.clone();
        let cancel_c = cancel.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("first".to_string());
                if *cancel_c.borrow() {
                    cancel_signal(&signal_c);
                }
            }),
            None,
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| calls_c2.borrow_mut().push("second".to_string())),
            None,
        );

        emit_signal_safe(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["first"]);

        *cancel.borrow_mut() = false;
        emit_signal_safe(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["first", "first", "second"]);
    }
}
