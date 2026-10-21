use std::sync::{Arc, Mutex};

use flight_signals::*;

mod clear_signal {
    use super::*;

    #[test]
    fn removes_all_slots() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        for _ in 0..2 {
            let count = count.clone();
            connect_signal(
                &signal,
                Arc::new(move |_: &()| *count.lock().unwrap() += 1),
                None,
            );
        }
        clear_signal(&signal);
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 0);
    }
}

mod connect_signal {
    use super::*;

    #[test]
    fn connects_a_slot_that_receives_emits() {
        let signal: Signal<()> = create_signal();
        let called = Arc::new(Mutex::new(false));
        let flag = called.clone();
        connect_signal(&signal, Arc::new(move |_: &()| *flag.lock().unwrap() = true), None);
        emit_signal(&signal, &());
        assert!(*called.lock().unwrap());
    }

    #[test]
    fn connects_multiple_slots_emitted_in_insertion_order() {
        let signal: Signal<()> = create_signal();
        let order = Arc::new(Mutex::new(Vec::new()));
        for value in [1, 2, 3] {
            let order = order.clone();
            connect_signal(
                &signal,
                Arc::new(move |_: &()| order.lock().unwrap().push(value)),
                None,
            );
        }
        emit_signal(&signal, &());
        assert_eq!(*order.lock().unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn passes_typed_payload_to_slot() {
        #[derive(Clone, Debug, PartialEq)]
        struct PairEvent {
            x: i32,
            y: i32,
        }

        let signal: Signal<PairEvent> = create_signal();
        let received = Arc::new(Mutex::new(None));
        let out = received.clone();
        connect_signal(
            &signal,
            Arc::new(move |event: &PairEvent| *out.lock().unwrap() = Some(event.clone())),
            None,
        );
        emit_signal(&signal, &PairEvent { x: 3, y: 7 });
        assert_eq!(*received.lock().unwrap(), Some(PairEvent { x: 3, y: 7 }));
    }

    #[test]
    fn removes_slot_after_first_emit_when_once_is_set() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let options = SignalConnectOptions {
            priority: None,
            once: Some(true),
        };
        connect_signal(&signal, Arc::new(move |_: &()| *counter.lock().unwrap() += 1), Some(&options));
        emit_signal(&signal, &());
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn keeps_slot_across_emits_when_once_is_not_set() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        connect_signal(&signal, Arc::new(move |_: &()| *counter.lock().unwrap() += 1), None);
        emit_signal(&signal, &());
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 2);
    }

    #[test]
    fn emits_higher_priority_slots_first() {
        let signal: Signal<()> = create_signal();
        let order = Arc::new(Mutex::new(Vec::new()));
        for (value, priority) in [(1, 0), (2, 10), (3, 5)] {
            let order = order.clone();
            let options = SignalConnectOptions {
                priority: Some(priority),
                once: None,
            };
            connect_signal(
                &signal,
                Arc::new(move |_: &()| order.lock().unwrap().push(value)),
                Some(&options),
            );
        }
        emit_signal(&signal, &());
        assert_eq!(*order.lock().unwrap(), vec![2, 3, 1]);
    }

    #[test]
    fn delivers_to_every_slot_when_a_slot_re_emits_the_same_signal() {
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let reentered = Arc::new(Mutex::new(false));
        let nested_signal = signal.clone();
        let first_calls = calls.clone();
        let first_reentered = reentered.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                first_calls.lock().unwrap().push("a");
                let mut reentered = first_reentered.lock().unwrap();
                if !*reentered {
                    *reentered = true;
                    drop(reentered);
                    emit_signal(&nested_signal, &());
                }
            }),
            None,
        );
        let tail_calls = calls.clone();
        connect_signal(&signal, Arc::new(move |_: &()| tail_calls.lock().unwrap().push("b")), None);
        emit_signal(&signal, &());
        let calls = calls.lock().unwrap();
        assert!(calls.contains(&"a"));
        assert!(calls.contains(&"b"));
    }

    #[test]
    fn removes_a_once_slot_exactly_once_across_a_reentrant_emit() {
        let signal: Signal<()> = create_signal();
        let once_count = Arc::new(Mutex::new(0));
        let counter = once_count.clone();
        let options = SignalConnectOptions {
            priority: None,
            once: Some(true),
        };
        connect_signal(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );

        let reentered = Arc::new(Mutex::new(false));
        let nested_signal = signal.clone();
        let flag = reentered.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                let mut reentered = flag.lock().unwrap();
                if !*reentered {
                    *reentered = true;
                    drop(reentered);
                    emit_signal(&nested_signal, &());
                }
            }),
            None,
        );
        emit_signal(&signal, &());
        emit_signal(&signal, &());
        assert_eq!(*once_count.lock().unwrap(), 1);
    }
}

mod disconnect_signal {
    use super::*;

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal: Signal<()> = create_signal();
        disconnect_signal(&signal, SlotId(999));
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn removes_a_specific_slot() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let id = connect_signal(&signal, Arc::new(move |_: &()| *counter.lock().unwrap() += 1), None);
        disconnect_signal(&signal, id);
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 0);
    }

    #[test]
    fn does_not_remove_other_slots() {
        let signal: Signal<()> = create_signal();
        let a = Arc::new(Mutex::new(0));
        let b = Arc::new(Mutex::new(0));
        let a_counter = a.clone();
        let b_counter = b.clone();
        let slot_a = connect_signal(&signal, Arc::new(move |_: &()| *a_counter.lock().unwrap() += 1), None);
        connect_signal(&signal, Arc::new(move |_: &()| *b_counter.lock().unwrap() += 1), None);
        disconnect_signal(&signal, slot_a);
        emit_signal(&signal, &());
        assert_eq!(*a.lock().unwrap(), 0);
        assert_eq!(*b.lock().unwrap(), 1);
    }
}

mod has_signal_slots {
    use super::*;

    #[test]
    fn returns_false_when_no_slot_is_connected() {
        let signal: Signal<()> = create_signal();
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn returns_true_when_at_least_one_slot_is_connected() {
        let signal: Signal<()> = create_signal();
        connect_signal(&signal, Arc::new(|_: &()| {}), None);
        assert!(has_signal_slots(&signal));
    }

    #[test]
    fn returns_false_after_the_last_slot_is_disconnected() {
        let signal: Signal<()> = create_signal();
        let id = connect_signal(&signal, Arc::new(|_: &()| {}), None);
        disconnect_signal(&signal, id);
        assert!(!has_signal_slots(&signal));
    }
}

mod is_slot_connected {
    use super::*;

    #[test]
    fn returns_true_when_slot_is_connected() {
        let signal: Signal<()> = create_signal();
        let id = connect_signal(&signal, Arc::new(|_: &()| {}), None);
        assert!(is_slot_connected(&signal, id));
    }

    #[test]
    fn returns_false_when_slot_is_not_connected() {
        let signal: Signal<()> = create_signal();
        assert!(!is_slot_connected(&signal, SlotId(999)));
    }

    #[test]
    fn returns_false_after_slot_is_disconnected() {
        let signal: Signal<()> = create_signal();
        let id = connect_signal(&signal, Arc::new(|_: &()| {}), None);
        disconnect_signal(&signal, id);
        assert!(!is_slot_connected(&signal, id));
    }
}
