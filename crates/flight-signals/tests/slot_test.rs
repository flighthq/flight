use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::*;

mod clear_signal_tests {
    use super::*;

    #[test]
    fn removes_all_slots() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
        );
        let count_c2 = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c2.borrow_mut() += 1;
            }),
            None,
        );
        clear_signal(&signal);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 0);
    }
}

mod connect_signal_tests {
    use super::*;

    #[test]
    fn connects_a_slot_that_receives_emits() {
        let signal = create_signal();
        let called = Rc::new(RefCell::new(false));
        let called_c = called.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *called_c.borrow_mut() = true;
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert!(*called.borrow());
    }

    #[test]
    fn connects_multiple_slots_emitted_in_insertion_order() {
        let signal = create_signal();
        let order = Rc::new(RefCell::new(Vec::<i32>::new()));
        let order_c = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| order_c.borrow_mut().push(1)),
            None,
        );
        let order_c2 = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| order_c2.borrow_mut().push(2)),
            None,
        );
        let order_c3 = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| order_c3.borrow_mut().push(3)),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*order.borrow(), vec![1, 2, 3]);
    }

    #[test]
    fn delivers_to_every_slot_when_a_slot_re_emits_the_same_signal() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let reentered = Rc::new(RefCell::new(false));
        let signal_c = signal.clone();
        let calls_c = calls.clone();
        let reentered_c = reentered.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("a".to_string());
                if !*reentered_c.borrow() {
                    *reentered_c.borrow_mut() = true;
                    emit_signal(&signal_c, Rc::new(()));
                }
            }),
            None,
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c2.borrow_mut().push("b".to_string());
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert!(calls.borrow().contains(&"a".to_string()));
        assert!(calls.borrow().contains(&"b".to_string()));
    }

    #[test]
    fn emits_higher_priority_slots_first() {
        let signal = create_signal();
        let order = Rc::new(RefCell::new(Vec::<i32>::new()));
        let order_c = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| order_c.borrow_mut().push(1)),
            Some(&SignalConnectOptions {
                priority: 0,
                once: false,
            }),
        );
        let order_c2 = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| order_c2.borrow_mut().push(2)),
            Some(&SignalConnectOptions {
                priority: 10,
                once: false,
            }),
        );
        let order_c3 = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| order_c3.borrow_mut().push(3)),
            Some(&SignalConnectOptions {
                priority: 5,
                once: false,
            }),
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*order.borrow(), vec![2, 3, 1]);
    }

    #[test]
    fn keeps_slot_across_emits_when_once_is_not_set() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 2);
    }

    #[test]
    fn passes_typed_arguments_to_slot() {
        let signal = create_signal();
        let received = Rc::new(RefCell::new(None::<(i32, i32)>));
        let received_c = received.clone();
        connect_signal(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let (x, y) = *args.downcast_ref::<(i32, i32)>().unwrap();
                *received_c.borrow_mut() = Some((x, y));
            }),
            None,
        );
        emit_signal(&signal, Rc::new((3_i32, 7_i32)));
        assert_eq!(*received.borrow(), Some((3, 7)));
    }

    #[test]
    fn removes_a_once_slot_exactly_once_across_a_re_entrant_emit() {
        let signal = create_signal();
        let once_count = Rc::new(RefCell::new(0));
        let once_count_c = once_count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *once_count_c.borrow_mut() += 1;
            }),
            Some(&SignalConnectOptions {
                once: true,
                ..Default::default()
            }),
        );
        let reentered = Rc::new(RefCell::new(false));
        let signal_c = signal.clone();
        let reentered_c = reentered.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                if !*reentered_c.borrow() {
                    *reentered_c.borrow_mut() = true;
                    emit_signal(&signal_c, Rc::new(()));
                }
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*once_count.borrow(), 1);
    }

    #[test]
    fn removes_slot_after_first_emit_when_once_is_true() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            Some(&SignalConnectOptions {
                once: true,
                ..Default::default()
            }),
        );
        emit_signal(&signal, Rc::new(()));
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 1);
    }
}

mod disconnect_signal_tests {
    use super::*;

    #[test]
    fn does_not_remove_other_slots() {
        let signal = create_signal();
        let a = Rc::new(RefCell::new(0));
        let b = Rc::new(RefCell::new(0));
        let a_c = a.clone();
        let slot_a: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            *a_c.borrow_mut() += 1;
        });
        connect_signal(&signal, slot_a.clone(), None);
        let b_c = b.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *b_c.borrow_mut() += 1;
            }),
            None,
        );
        disconnect_signal(&signal, &slot_a);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*a.borrow(), 0);
        assert_eq!(*b.borrow(), 1);
    }

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal = create_signal();
        let slot: SlotFn = Rc::new(|_: Rc<dyn Any>| {});
        disconnect_signal(&signal, &slot); // should not panic
    }

    #[test]
    fn removes_a_specific_slot() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let slot: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            *count_c.borrow_mut() += 1;
        });
        connect_signal(&signal, slot.clone(), None);
        disconnect_signal(&signal, &slot);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 0);
    }
}

mod emit_signal_dispatch_mutation {
    use super::*;

    #[test]
    fn does_not_deliver_to_a_slot_disconnected_earlier_in_the_same_dispatch() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let c_slot: SlotFn = {
            let calls = calls.clone();
            Rc::new(move |_: Rc<dyn Any>| {
                calls.borrow_mut().push("c".to_string());
            })
        };
        let c_slot_ref = c_slot.clone();
        let signal_c = signal.clone();
        let calls_c = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("a".to_string());
                disconnect_signal(&signal_c, &c_slot_ref);
            }),
            None,
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c2.borrow_mut().push("b".to_string());
            }),
            None,
        );
        connect_signal(&signal, c_slot, None);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["a", "b"]);
    }

    #[test]
    fn fires_a_once_slot_exactly_once_when_a_nested_emit_walks_past_it() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let calls_c = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("once".to_string());
            }),
            Some(&SignalConnectOptions {
                once: true,
                ..Default::default()
            }),
        );
        let reentered = Rc::new(RefCell::new(false));
        let signal_c = signal.clone();
        let reentered_c = reentered.clone();
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c2.borrow_mut().push("outer".to_string());
                if !*reentered_c.borrow() {
                    *reentered_c.borrow_mut() = true;
                    emit_signal(&signal_c, Rc::new(()));
                }
            }),
            None,
        );
        let calls_c3 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c3.borrow_mut().push("tail".to_string());
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(
            calls
                .borrow()
                .iter()
                .filter(|n| n.as_str() == "once")
                .count(),
            1
        );
        assert_eq!(
            calls
                .borrow()
                .iter()
                .filter(|n| n.as_str() == "tail")
                .count(),
            2
        );
    }

    #[test]
    fn gives_a_nested_emit_its_own_cursor_unskewed_by_a_disconnect_inside_it() {
        let signal = create_signal();
        let nested = Rc::new(RefCell::new(Vec::<String>::new()));
        let depth = Rc::new(RefCell::new(0_i32));
        let reentered = Rc::new(RefCell::new(false));

        // slot a
        let a_holder: Rc<RefCell<Option<SlotFn>>> = Rc::new(RefCell::new(None));
        let a_holder_ref = a_holder.clone();
        let signal_c = signal.clone();
        let nested_c = nested.clone();
        let depth_c = depth.clone();
        let reentered_c = reentered.clone();
        let a_slot: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            let d = *depth_c.borrow();
            if d > 0 {
                nested_c.borrow_mut().push("a".to_string());
            }
            if !*reentered_c.borrow() {
                *reentered_c.borrow_mut() = true;
                *depth_c.borrow_mut() += 1;
                emit_signal(&signal_c, Rc::new(()));
                *depth_c.borrow_mut() -= 1;
            }
        });
        *a_holder.borrow_mut() = Some(a_slot.clone());
        connect_signal(&signal, a_slot, None);

        let signal_c2 = signal.clone();
        let nested_c2 = nested.clone();
        let depth_c2 = depth.clone();
        let a_holder_c2 = a_holder_ref.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                let d = *depth_c2.borrow();
                if d > 0 {
                    nested_c2.borrow_mut().push("b".to_string());
                }
                let a_ref = a_holder_c2.borrow().as_ref().unwrap().clone();
                disconnect_signal(&signal_c2, &a_ref);
            }),
            None,
        );

        let nested_c3 = nested.clone();
        let depth_c3 = depth.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                let d = *depth_c3.borrow();
                if d > 0 {
                    nested_c3.borrow_mut().push("c".to_string());
                }
            }),
            None,
        );

        emit_signal(&signal, Rc::new(()));
        assert_eq!(*nested.borrow(), vec!["a", "b", "c"]);
    }

    #[test]
    fn keeps_dispatching_to_later_slots_after_a_slot_disconnects_itself() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));

        let a_holder: Rc<RefCell<Option<SlotFn>>> = Rc::new(RefCell::new(None));
        let calls_a = calls.clone();
        let signal_a = signal.clone();
        let a_holder_ref = a_holder.clone();
        let a: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            calls_a.borrow_mut().push("a".to_string());
            let a_ref = a_holder_ref.borrow().as_ref().unwrap().clone();
            disconnect_signal(&signal_a, &a_ref);
        });
        *a_holder.borrow_mut() = Some(a.clone());
        connect_signal(&signal, a, None);

        let calls_b = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_b.borrow_mut().push("b".to_string());
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["a", "b"]);
    }

    #[test]
    fn purges_disconnected_entries_once_the_outermost_emit_exits() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let b_slot: SlotFn = {
            let calls = calls.clone();
            Rc::new(move |_: Rc<dyn Any>| {
                calls.borrow_mut().push("b".to_string());
            })
        };
        let b_ref = b_slot.clone();
        let signal_c = signal.clone();
        let calls_a = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_a.borrow_mut().push("a".to_string());
                disconnect_signal(&signal_c, &b_ref);
            }),
            None,
        );
        connect_signal(&signal, b_slot.clone(), None);
        emit_signal(&signal, Rc::new(()));
        assert!(!is_slot_connected(&signal, &b_slot));
        assert!(has_signal_slots(&signal));
        // Check internal array lengths (compaction happened)
        {
            let data_opt = signal.data.borrow();
            let data_rc = data_opt.as_ref().unwrap();
            let data = data_rc.borrow();
            assert_eq!(data.slots.len(), 1);
            assert_eq!(data.priorities.len(), 1);
            assert_eq!(data.repeat.len(), 1);
        }
        calls.borrow_mut().clear();
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["a"]);
    }

    #[test]
    fn reports_a_slot_disconnected_mid_dispatch_as_disconnected_from_inside_the_same_dispatch() {
        let signal = create_signal();
        let observed = Rc::new(RefCell::new(Vec::<bool>::new()));
        let b_slot: SlotFn = Rc::new(|_: Rc<dyn Any>| {});
        let b_ref = b_slot.clone();
        let signal_c = signal.clone();
        let observed_c = observed.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                disconnect_signal(&signal_c, &b_ref);
                observed_c
                    .borrow_mut()
                    .push(is_slot_connected(&signal_c, &b_ref));
                observed_c.borrow_mut().push(has_signal_slots(&signal_c));
            }),
            None,
        );
        connect_signal(&signal, b_slot, None);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*observed.borrow(), vec![false, true]);
    }

    #[test]
    fn reports_no_slots_from_inside_the_dispatch_that_disconnected_the_last_one() {
        let signal = create_signal();
        let observed = Rc::new(RefCell::new(Vec::<bool>::new()));

        let a_holder: Rc<RefCell<Option<SlotFn>>> = Rc::new(RefCell::new(None));
        let signal_c = signal.clone();
        let observed_c = observed.clone();
        let a_holder_ref = a_holder.clone();
        let a: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            let a_ref = a_holder_ref.borrow().as_ref().unwrap().clone();
            disconnect_signal(&signal_c, &a_ref);
            observed_c.borrow_mut().push(has_signal_slots(&signal_c));
        });
        *a_holder.borrow_mut() = Some(a.clone());
        connect_signal(&signal, a, None);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*observed.borrow(), vec![false]);
    }

    #[test]
    fn returns_the_signal_to_its_empty_state_when_every_slot_disconnects_during_dispatch() {
        let signal = create_signal();
        let a_holder: Rc<RefCell<Option<SlotFn>>> = Rc::new(RefCell::new(None));
        let signal_c = signal.clone();
        let a_holder_ref = a_holder.clone();
        let a: SlotFn = Rc::new(move |_: Rc<dyn Any>| {
            let a_ref = a_holder_ref.borrow().as_ref().unwrap().clone();
            disconnect_signal(&signal_c, &a_ref);
        });
        *a_holder.borrow_mut() = Some(a.clone());
        connect_signal(&signal, a.clone(), None);
        emit_signal(&signal, Rc::new(()));
        assert!(!has_signal_slots(&signal));
        assert!(!is_slot_connected(&signal, &a));
        assert!(signal.data.borrow().is_none());
    }

    #[test]
    fn runs_the_slot_that_shifts_into_a_disconnected_earlier_position() {
        let signal = create_signal();
        let calls = Rc::new(RefCell::new(Vec::<String>::new()));
        let a_slot: SlotFn = {
            let calls = calls.clone();
            Rc::new(move |_: Rc<dyn Any>| {
                calls.borrow_mut().push("a".to_string());
            })
        };
        let a_ref = a_slot.clone();
        connect_signal(&signal, a_slot, None);
        let signal_c = signal.clone();
        let calls_c = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c.borrow_mut().push("b".to_string());
                disconnect_signal(&signal_c, &a_ref);
            }),
            None,
        );
        let calls_c2 = calls.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                calls_c2.borrow_mut().push("c".to_string());
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*calls.borrow(), vec!["a", "b", "c"]);
    }
}

mod has_signal_slots_tests {
    use super::*;

    #[test]
    fn returns_false_after_the_last_slot_is_disconnected() {
        let signal = create_signal();
        let slot: SlotFn = Rc::new(|_: Rc<dyn Any>| {});
        connect_signal(&signal, slot.clone(), None);
        disconnect_signal(&signal, &slot);
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn returns_false_when_no_slot_is_connected() {
        let signal = create_signal();
        assert!(!has_signal_slots(&signal));
    }

    #[test]
    fn returns_true_when_at_least_one_slot_is_connected() {
        let signal = create_signal();
        connect_signal(&signal, Rc::new(|_: Rc<dyn Any>| {}), None);
        assert!(has_signal_slots(&signal));
    }
}

mod is_slot_connected_tests {
    use super::*;

    #[test]
    fn returns_false_after_slot_is_disconnected() {
        let signal = create_signal();
        let slot: SlotFn = Rc::new(|_: Rc<dyn Any>| {});
        connect_signal(&signal, slot.clone(), None);
        disconnect_signal(&signal, &slot);
        assert!(!is_slot_connected(&signal, &slot));
    }

    #[test]
    fn returns_false_when_slot_is_not_connected() {
        let signal = create_signal();
        let slot: SlotFn = Rc::new(|_: Rc<dyn Any>| {});
        assert!(!is_slot_connected(&signal, &slot));
    }

    #[test]
    fn returns_true_when_slot_is_connected() {
        let signal = create_signal();
        let slot: SlotFn = Rc::new(|_: Rc<dyn Any>| {});
        connect_signal(&signal, slot.clone(), None);
        assert!(is_slot_connected(&signal, &slot));
    }
}
