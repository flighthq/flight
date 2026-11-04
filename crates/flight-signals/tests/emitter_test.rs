use std::sync::{Arc, Mutex};

use flight_signals::*;

struct ValueEvent {
    value: i32,
}

mod cancel_signal {
    use super::*;

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal: Signal<()> = create_signal();
        cancel_signal(&signal);
        emit_signal(&signal, &());
    }

    #[test]
    fn stops_emit_after_the_canceling_slot() {
        let signal: Signal<()> = create_signal();
        let order: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let cancel_signal_handle = signal.clone();
        let first_order = order.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                first_order.lock().unwrap().push(1);
                cancel_signal(&cancel_signal_handle);
            }),
            None,
        );
        let second_order = order.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| second_order.lock().unwrap().push(2)),
            None,
        );
        emit_signal(&signal, &());
        assert_eq!(*order.lock().unwrap(), vec![1]);
    }

    #[test]
    fn does_not_prevent_subsequent_emits() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let cancel_signal_handle = signal.clone();
        let first_count = count.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                *first_count.lock().unwrap() += 1;
                cancel_signal(&cancel_signal_handle);
            }),
            None,
        );
        let second_count = count.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| *second_count.lock().unwrap() += 1),
            None,
        );
        emit_signal(&signal, &());
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 2);
    }
}

mod emit_signal {
    use super::*;

    #[test]
    fn clear_replaces_a_custom_callback_with_noop_even_without_data() {
        let signal: Signal<()> = create_signal();
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        *signal.emit.write().unwrap() = Arc::new(move |_| *count.lock().unwrap() += 1);
        emit_signal(&signal, &());
        clear_signal(&signal);
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 1);
        assert!(signal.data.read().unwrap().is_none());
    }

    #[test]
    fn first_connect_replaces_a_custom_callback_with_native_data_dispatch() {
        let signal: Signal<()> = create_signal();
        let custom_calls = Arc::new(Mutex::new(0));
        let custom_count = custom_calls.clone();
        let custom: SignalSlot<()> = Arc::new(move |_| *custom_count.lock().unwrap() += 1);
        *signal.emit.write().unwrap() = custom.clone();
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_| *count.lock().unwrap() += 1),
            None,
        );
        assert!(!Arc::ptr_eq(&signal.emit.read().unwrap(), &custom));
        emit_signal(&signal, &());
        assert_eq!(*custom_calls.lock().unwrap(), 0);
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    /// flight-compiler: rust-only — JavaScript has no RwLock contention state to probe.
    #[test]
    fn emitter_cell_is_unlocked_while_a_callback_replaces_it() {
        let signal: Signal<()> = create_signal();
        let cell = signal.emit.clone();
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        *signal.emit.write().unwrap() = Arc::new(move |_| {
            *count.lock().unwrap() += 1;
            *cell
                .try_write()
                .expect("emit callback must run outside cell lock") = Arc::new(|_| {});
        });
        emit_signal(&signal, &());
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn native_and_safe_once_teardown_replace_emitters_installed_during_dispatch() {
        for safe in [false, true] {
            let signal: Signal<()> = create_signal();
            let cell = signal.emit.clone();
            let custom_calls = Arc::new(Mutex::new(0));
            let count = custom_calls.clone();
            let options = SignalConnectOptions {
                priority: None,
                once: Some(true),
            };
            connect_signal(
                &signal,
                Arc::new(move |_| {
                    let callback_count = count.clone();
                    *cell.write().unwrap() =
                        Arc::new(move |_: &()| *callback_count.lock().unwrap() += 1);
                }),
                Some(&options),
            );
            if safe {
                emit_signal_safe(&signal, &());
            } else {
                emit_signal(&signal, &());
            }
            emit_signal(&signal, &());
            assert_eq!(*custom_calls.lock().unwrap(), 0);
            assert!(signal.data.read().unwrap().is_none());
        }
    }

    #[test]
    fn clear_during_dispatch_does_not_let_old_teardown_erase_a_later_custom_emitter() {
        let signal: Signal<()> = create_signal();
        let callback_signal = signal.clone();
        // A source spread has an independent emit field; this closure explicitly targets the original cell.
        let original_cell = signal.emit.clone();
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_| {
                clear_signal(&callback_signal);
                let callback_count = count.clone();
                *original_cell.write().unwrap() =
                    Arc::new(move |_: &()| *callback_count.lock().unwrap() += 1);
            }),
            Some(&SignalConnectOptions {
                priority: None,
                once: Some(true),
            }),
        );
        emit_signal(&signal, &());
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn invokes_a_required_custom_emitter_instead_of_bypassing_it_for_slots() {
        let signal: Signal<i32> = create_signal();
        let calls: Arc<Mutex<Vec<(&'static str, i32)>>> = Arc::new(Mutex::new(Vec::new()));
        let slots = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |value| slots.lock().unwrap().push(("slot", *value))),
            None,
        );
        let custom = calls.clone();
        *signal.emit.write().unwrap() =
            Arc::new(move |value| custom.lock().unwrap().push(("custom", *value)));
        emit_signal(&signal, &7);
        assert_eq!(*calls.lock().unwrap(), [("custom", 7)]);
        emit_signal_safe(&signal, &8);
        assert_eq!(*calls.lock().unwrap(), [("custom", 7), ("slot", 8)]);
    }

    #[test]
    fn spread_wrapper_shares_slots_but_only_its_own_emission_marks_the_wrapper() {
        let original: Signal<i32> = create_signal();
        let seen: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let output = seen.clone();
        connect_signal(
            &original,
            Arc::new(move |value| output.lock().unwrap().push(*value)),
            None,
        );
        let marked = Arc::new(Mutex::new(0));
        let count = marked.clone();
        let original_emit = original.emit.read().unwrap().clone();
        let wrapper = original.clone();
        *wrapper.emit.write().unwrap() = Arc::new(move |value| {
            *count.lock().unwrap() += 1;
            original_emit(value);
        });
        assert!(Arc::ptr_eq(&wrapper.data, &original.data));
        assert!(!Arc::ptr_eq(&wrapper.emit, &original.emit));
        assert!(!Arc::ptr_eq(
            &wrapper.emit.read().unwrap(),
            &original.emit.read().unwrap()
        ));
        emit_signal(&original, &1);
        assert_eq!(*marked.lock().unwrap(), 0);
        emit_signal(&wrapper, &2);
        assert_eq!(*marked.lock().unwrap(), 1);
        assert_eq!(*seen.lock().unwrap(), [1, 2]);
    }

    #[test]
    fn spread_wrapper_calls_an_original_custom_emitter_even_without_signal_data() {
        let original: Signal<i32> = create_signal();
        let seen: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let output = seen.clone();
        *original.emit.write().unwrap() =
            Arc::new(move |value| output.lock().unwrap().push(*value));
        let wrapped_calls = Arc::new(Mutex::new(0));
        let count = wrapped_calls.clone();
        let original_emit = original.emit.read().unwrap().clone();
        let wrapper = original.clone();
        *wrapper.emit.write().unwrap() = Arc::new(move |value| {
            *count.lock().unwrap() += 1;
            original_emit(value);
        });
        emit_signal(&original, &1);
        emit_signal(&wrapper, &2);
        assert_eq!(*seen.lock().unwrap(), [1, 2]);
        assert_eq!(*wrapped_calls.lock().unwrap(), 1);
        assert!(original.data.read().unwrap().is_none());
    }

    #[test]
    fn clone_copies_emitter_value_and_data_but_has_a_fresh_entity_runtime() {
        let mut original: Signal<()> = create_signal();
        flight_entity::set_entity_uid(&mut original, "original".to_string());
        let mut clone = original.clone();
        assert!(Arc::ptr_eq(&clone.data, &original.data));
        assert!(Arc::ptr_eq(
            &clone.emit.read().unwrap(),
            &original.emit.read().unwrap()
        ));
        assert!(!flight_entity::has_entity_runtime(&clone));
        assert_ne!(flight_entity::get_entity_uid(&mut clone), "original");
    }

    /// flight-compiler: rust-only — TypeScript exposes the callback value, not its Rust lock cell.
    #[test]
    fn clone_owns_an_independent_emitter_cell() {
        let original: Signal<()> = create_signal();
        let clone = original.clone();
        assert!(!Arc::ptr_eq(&clone.emit, &original.emit));
    }

    #[test]
    fn calls_all_connected_slots() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        for _ in 0..2 {
            let slot_count = count.clone();
            connect_signal(
                &signal,
                Arc::new(move |_: &()| *slot_count.lock().unwrap() += 1),
                None,
            );
        }
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 2);
    }

    #[test]
    fn passes_typed_payload_to_each_slot() {
        let signal: Signal<ValueEvent> = create_signal();
        let received: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let out = received.clone();
        connect_signal(
            &signal,
            Arc::new(move |event: &ValueEvent| out.lock().unwrap().push(event.value)),
            None,
        );
        emit_signal(&signal, &ValueEvent { value: 42 });
        assert_eq!(*received.lock().unwrap(), vec![42]);
    }

    #[test]
    fn resets_cancelled_before_each_emit() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let cancel_signal_handle = signal.clone();
        let first_count = count.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                *first_count.lock().unwrap() += 1;
                cancel_signal(&cancel_signal_handle);
            }),
            None,
        );
        let second_count = count.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| *second_count.lock().unwrap() += 1),
            None,
        );
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 1);
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 2);
    }

    #[test]
    fn removes_once_slots_after_they_fire() {
        let signal: Signal<()> = create_signal();
        let count = Arc::new(Mutex::new(0));
        let counter = count.clone();
        let options = SignalConnectOptions {
            priority: None,
            once: Some(true),
        };
        connect_signal(
            &signal,
            Arc::new(move |_: &()| *counter.lock().unwrap() += 1),
            Some(&options),
        );
        emit_signal(&signal, &());
        emit_signal(&signal, &());
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal: Signal<()> = create_signal();
        emit_signal(&signal, &());
    }

    #[test]
    fn runs_the_slot_that_shifts_into_a_disconnected_earlier_position() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let a_calls = calls.clone();
        let a_id = connect_signal(
            &signal,
            Arc::new(move |_: &()| a_calls.lock().unwrap().push("a")),
            None,
        );
        let b_calls = calls.clone();
        let b_signal = signal.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                b_calls.lock().unwrap().push("b");
                disconnect_signal(&b_signal, a_id);
            }),
            None,
        );
        let c_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| c_calls.lock().unwrap().push("c")),
            None,
        );
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["a", "b", "c"]);
    }

    #[test]
    fn keeps_dispatching_to_later_slots_after_a_slot_disconnects_itself() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let a_calls = calls.clone();
        let a_signal = signal.clone();
        let id_holder: Arc<Mutex<Option<SlotId>>> = Arc::new(Mutex::new(None));
        let holder = id_holder.clone();
        let id = connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                a_calls.lock().unwrap().push("a");
                let current_id = *holder.lock().unwrap();
                if let Some(current_id) = current_id {
                    disconnect_signal(&a_signal, current_id);
                }
            }),
            None,
        );
        *id_holder.lock().unwrap() = Some(id);
        let b_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| b_calls.lock().unwrap().push("b")),
            None,
        );
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["a", "b"]);
    }

    #[test]
    fn does_not_deliver_to_a_slot_disconnected_earlier_in_the_same_dispatch() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let id_holder: Arc<Mutex<Option<SlotId>>> = Arc::new(Mutex::new(None));
        let holder = id_holder.clone();
        let a_calls = calls.clone();
        let a_signal = signal.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                a_calls.lock().unwrap().push("a");
                let current_id = *holder.lock().unwrap();
                if let Some(current_id) = current_id {
                    disconnect_signal(&a_signal, current_id);
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
        let c_calls = calls.clone();
        let c_id = connect_signal(
            &signal,
            Arc::new(move |_: &()| c_calls.lock().unwrap().push("c")),
            None,
        );
        *id_holder.lock().unwrap() = Some(c_id);
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["a", "b"]);
    }

    #[test]
    fn gives_a_nested_emit_its_own_cursor_unskewed_by_a_disconnect_inside_it() {
        let signal: Signal<()> = create_signal();
        let nested: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let depth = Arc::new(Mutex::new(0));
        let reentered = Arc::new(Mutex::new(false));
        let nested_signal = signal.clone();
        let a_nested = nested.clone();
        let a_depth = depth.clone();
        let a_reentered = reentered.clone();
        let a_id = connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                if *a_depth.lock().unwrap() > 0 {
                    a_nested.lock().unwrap().push("a");
                }
                let mut reentered = a_reentered.lock().unwrap();
                if !*reentered {
                    *reentered = true;
                    drop(reentered);
                    *a_depth.lock().unwrap() += 1;
                    emit_signal(&nested_signal, &());
                    *a_depth.lock().unwrap() -= 1;
                }
            }),
            None,
        );
        let b_nested = nested.clone();
        let b_depth = depth.clone();
        let b_signal = signal.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                if *b_depth.lock().unwrap() > 0 {
                    b_nested.lock().unwrap().push("b");
                }
                disconnect_signal(&b_signal, a_id);
            }),
            None,
        );
        let c_nested = nested.clone();
        let c_depth = depth.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                if *c_depth.lock().unwrap() > 0 {
                    c_nested.lock().unwrap().push("c");
                }
            }),
            None,
        );
        emit_signal(&signal, &());
        assert_eq!(*nested.lock().unwrap(), vec!["a", "b", "c"]);
    }

    #[test]
    fn fires_a_once_slot_exactly_once_when_a_nested_emit_walks_past_it() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let once_calls = calls.clone();
        let options = SignalConnectOptions {
            priority: None,
            once: Some(true),
        };
        connect_signal(
            &signal,
            Arc::new(move |_: &()| once_calls.lock().unwrap().push("once")),
            Some(&options),
        );
        let reentered = Arc::new(Mutex::new(false));
        let nested_signal = signal.clone();
        let outer_calls = calls.clone();
        let outer_reentered = reentered.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                outer_calls.lock().unwrap().push("outer");
                let mut reentered = outer_reentered.lock().unwrap();
                if !*reentered {
                    *reentered = true;
                    drop(reentered);
                    emit_signal(&nested_signal, &());
                }
            }),
            None,
        );
        let tail_calls = calls.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| tail_calls.lock().unwrap().push("tail")),
            None,
        );
        emit_signal(&signal, &());
        let snapshot = calls.lock().unwrap();
        let once: Vec<&&str> = snapshot.iter().filter(|name| **name == "once").collect();
        assert_eq!(once.len(), 1);
        let tail: Vec<&&str> = snapshot.iter().filter(|name| **name == "tail").collect();
        assert_eq!(tail.len(), 2);
    }

    #[test]
    fn purges_disconnected_entries_once_the_outermost_emit_exits() {
        let signal: Signal<()> = create_signal();
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let a_calls = calls.clone();
        let b_calls = calls.clone();
        let b_signal = signal.clone();
        let b_id = connect_signal(
            &signal,
            Arc::new(move |_: &()| b_calls.lock().unwrap().push("b")),
            None,
        );
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                a_calls.lock().unwrap().push("a");
                disconnect_signal(&b_signal, b_id);
            }),
            None,
        );
        emit_signal(&signal, &());
        assert!(!is_slot_connected(&signal, b_id));
        assert!(has_signal_slots(&signal));
        let state = signal.data.read().unwrap();
        let data = state.as_ref().unwrap();
        assert_eq!(data.slots.len(), 1);
        assert_eq!(data.priorities.len(), 1);
        assert_eq!(data.repeat.len(), 1);
        drop(state);
        *calls.lock().unwrap() = Vec::new();
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), vec!["a"]);
    }

    #[test]
    fn returns_the_signal_to_its_empty_state_when_every_slot_disconnects_during_dispatch() {
        let signal: Signal<()> = create_signal();
        let a_signal = signal.clone();
        let id_holder: Arc<Mutex<Option<SlotId>>> = Arc::new(Mutex::new(None));
        let holder = id_holder.clone();
        let id = connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                let current_id = *holder.lock().unwrap();
                if let Some(current_id) = current_id {
                    disconnect_signal(&a_signal, current_id);
                }
            }),
            None,
        );
        *id_holder.lock().unwrap() = Some(id);
        emit_signal(&signal, &());
        assert!(!has_signal_slots(&signal));
        assert!(!is_slot_connected(&signal, id));
        assert!(signal.data.read().unwrap().is_none());
    }

    #[test]
    fn reports_no_slots_from_inside_the_dispatch_that_disconnected_the_last_one() {
        let signal: Signal<()> = create_signal();
        let observed: Arc<Mutex<Vec<bool>>> = Arc::new(Mutex::new(Vec::new()));
        let id_holder: Arc<Mutex<Option<SlotId>>> = Arc::new(Mutex::new(None));
        let holder = id_holder.clone();
        let slot_signal = signal.clone();
        let seen = observed.clone();
        let id = connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                let current_id = *holder.lock().unwrap();
                if let Some(current_id) = current_id {
                    disconnect_signal(&slot_signal, current_id);
                }
                seen.lock().unwrap().push(has_signal_slots(&slot_signal));
            }),
            None,
        );
        *id_holder.lock().unwrap() = Some(id);
        emit_signal(&signal, &());
        assert_eq!(*observed.lock().unwrap(), vec![false]);
    }

    #[test]
    fn reports_a_slot_disconnected_mid_dispatch_as_disconnected_from_inside_the_same_dispatch() {
        let signal: Signal<()> = create_signal();
        let observed: Arc<Mutex<Vec<bool>>> = Arc::new(Mutex::new(Vec::new()));
        let b_id = connect_signal(&signal, Arc::new(|_: &()| {}), None);
        let slot_signal = signal.clone();
        let seen = observed.clone();
        connect_signal(
            &signal,
            Arc::new(move |_: &()| {
                disconnect_signal(&slot_signal, b_id);
                seen.lock()
                    .unwrap()
                    .push(is_slot_connected(&slot_signal, b_id));
                seen.lock().unwrap().push(has_signal_slots(&slot_signal));
            }),
            None,
        );
        emit_signal(&signal, &());
        assert_eq!(*observed.lock().unwrap(), vec![false, true]);
    }
}
