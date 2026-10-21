use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_entity::allocate_entity;
use flight_midi::contract::*;
use flight_signals::{connect_signal, has_signal_slots};

use crate::{block_on, deferred, input_port, successful_attachment};

fn access(
    attach: Arc<dyn Fn(MidiAccessStateListener) -> MidiEventBackendAttachFuture + Send + Sync>,
) -> flight_entity::Ref<MidiAccess> {
    return create_midi_access_resource(MidiAccessResourceOperations {
        attach_state_change: attach,
        get_input_ports: Arc::new(|| Ok(Vec::new())),
        get_output_ports: Arc::new(|| Ok(Vec::new())),
        provider: Arc::new("access".to_string()),
    });
}

mod attach_midi_access_state_subscription {
    use super::*;

    #[test]
    fn serializes_concurrent_replacement_and_releases_the_stale_origin() {
        let (first_pending, first_resolver) = deferred();
        let (second_pending, second_resolver) = deferred();
        let pending = Arc::new(Mutex::new(vec![first_pending, second_pending]));
        let attach_calls = Arc::new(AtomicUsize::new(0));
        let calls = attach_calls.clone();
        let source = pending.clone();
        let access = access(Arc::new(move |_listener| {
            calls.fetch_add(1, Ordering::SeqCst);
            let future = source.lock().unwrap().remove(0);
            Box::pin(future)
        }));
        let releases = Arc::new(AtomicUsize::new(0));
        let attachment = |origin: &'static str| {
            let releases = releases.clone();
            create_midi_event_attachment(
                Arc::new(origin.to_string()),
                Arc::new(move || {
                    releases.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async {
                        Ok(MidiEventReleaseOutcome {
                            reason: MidiEventReleaseReason::Ok,
                        })
                    })
                }),
            )
        };
        let subscription = create_midi_access_state_subscription();
        let first_access = access.clone();
        let first_subscription = subscription.clone();
        let first = std::thread::spawn(move || {
            block_on(attach_midi_access_state_subscription(
                &first_access,
                &first_subscription,
            ))
        });
        while attach_calls.load(Ordering::SeqCst) != 1 {
            std::thread::yield_now();
        }
        let second_access = access.clone();
        let second_subscription = subscription.clone();
        let second = std::thread::spawn(move || {
            block_on(attach_midi_access_state_subscription(
                &second_access,
                &second_subscription,
            ))
        });
        first_resolver.resolve(Ok(MidiEventBackendAttachOutcome {
            attachment: Some(attachment("first")),
            reason: MidiEventBackendAttachReason::Ok,
            release_failed: None,
        }));
        while attach_calls.load(Ordering::SeqCst) != 2 {
            std::thread::yield_now();
        }
        second_resolver.resolve(Ok(MidiEventBackendAttachOutcome {
            attachment: Some(attachment("second")),
            reason: MidiEventBackendAttachReason::Ok,
            release_failed: None,
        }));
        assert_eq!(
            first.join().unwrap().reason,
            MidiSubscriptionAttachReason::Ok
        );
        assert_eq!(
            second.join().unwrap().reason,
            MidiSubscriptionAttachReason::Ok
        );
        assert_eq!(releases.load(Ordering::SeqCst), 1);
        assert_eq!(
            block_on(detach_midi_access_state_subscription(&subscription)).reason,
            MidiSubscriptionDetachReason::Ok
        );
        assert_eq!(releases.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn pins_the_access_origin_and_tracks_hotplug_identity() {
        let listener = Arc::new(Mutex::new(None));
        let captured = listener.clone();
        let access = access(Arc::new(move |next| {
            *captured.lock().unwrap() = Some(next);
            Box::pin(async {
                Ok(MidiEventBackendAttachOutcome {
                    attachment: Some(successful_attachment()),
                    reason: MidiEventBackendAttachReason::Ok,
                    release_failed: None,
                })
            })
        }));
        let subscription = create_midi_access_state_subscription();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let seen_ports = seen.clone();
        connect_signal(
            &subscription.read().unwrap().on_midi_access_state_change,
            Arc::new(move |port| seen_ports.lock().unwrap().push(port.clone())),
            None,
        );
        assert_eq!(
            block_on(attach_midi_access_state_subscription(
                &access,
                &subscription
            ))
            .reason,
            MidiSubscriptionAttachReason::Ok
        );
        let port = MidiPort::Input(input_port("hotplug"));
        listener.lock().unwrap().as_ref().unwrap()(&port);
        assert_eq!(seen.lock().unwrap().as_slice(), &[port.clone()]);
        assert_eq!(
            get_midi_access_resource_state(&access)
                .unwrap()
                .read()
                .unwrap()
                .known_ports,
            vec![port]
        );
    }
}

mod attach_midi_input_message_subscription {
    use super::*;

    #[test]
    fn copies_each_native_payload_and_preserves_event_time() {
        let listener = Arc::new(Mutex::new(None));
        let captured = listener.clone();
        let input = input_port("input");
        let state = get_midi_port_resource_state(&MidiPort::Input(input.clone())).unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.operations.attach_message = Arc::new(move |next| {
                *captured.lock().unwrap() = Some(next);
                Box::pin(async {
                    Ok(MidiEventBackendAttachOutcome {
                        attachment: Some(successful_attachment()),
                        reason: MidiEventBackendAttachReason::Ok,
                        release_failed: None,
                    })
                })
            });
        }
        let subscription = create_midi_input_message_subscription();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured_messages = seen.clone();
        connect_signal(
            &subscription.read().unwrap().on_midi_input_message,
            Arc::new(move |message| captured_messages.lock().unwrap().push(message.clone())),
            None,
        );
        assert_eq!(
            block_on(attach_midi_input_message_subscription(
                &input,
                &subscription
            ))
            .reason,
            MidiSubscriptionAttachReason::Ok
        );
        let mut native = vec![0x90, 60, 127];
        listener.lock().unwrap().as_ref().unwrap()(&native, 42.5);
        native[1] = 1;
        let seen = seen.lock().unwrap();
        assert_eq!(&*seen[0].data, &[0x90, 60, 127]);
        assert_eq!(seen[0].timestamp, 42.5);
    }
}

mod attach_midi_port_state_subscription {
    use super::*;

    #[test]
    fn emits_the_originating_port_and_keeps_state_pull_based() {
        let listener = Arc::new(Mutex::new(None));
        let captured = listener.clone();
        let input = input_port("input");
        let port = MidiPort::Input(input.clone());
        let state = get_midi_port_resource_state(&port).unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.operations.attach_state_change = Arc::new(move |next| {
                *captured.lock().unwrap() = Some(next);
                Box::pin(async {
                    Ok(MidiEventBackendAttachOutcome {
                        attachment: Some(successful_attachment()),
                        reason: MidiEventBackendAttachReason::Ok,
                        release_failed: None,
                    })
                })
            });
        }
        let subscription = create_midi_port_state_subscription();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let seen_ports = seen.clone();
        connect_signal(
            &subscription.read().unwrap().on_midi_port_state_change,
            Arc::new(move |changed| seen_ports.lock().unwrap().push(changed.clone())),
            None,
        );
        assert_eq!(
            block_on(attach_midi_port_state_subscription(&port, &subscription)).reason,
            MidiSubscriptionAttachReason::Ok
        );
        listener.lock().unwrap().as_ref().unwrap()();
        assert_eq!(seen.lock().unwrap().as_slice(), &[port.clone()]);
        assert_eq!(
            get_midi_port_state(&port).state,
            Some(MidiPortState::Connected)
        );
    }
}

mod create_midi_access_state_subscription {
    use super::*;

    #[test]
    fn creates_a_detached_entity_with_an_empty_signal() {
        let subscription = create_midi_access_state_subscription();
        assert!(!has_signal_slots(
            &subscription.read().unwrap().on_midi_access_state_change
        ));
    }
}

mod create_midi_input_message_subscription {
    use super::*;

    #[test]
    fn creates_a_detached_entity_with_an_empty_signal() {
        let subscription = create_midi_input_message_subscription();
        assert!(!has_signal_slots(
            &subscription.read().unwrap().on_midi_input_message
        ));
    }
}

mod create_midi_port_state_subscription {
    use super::*;

    #[test]
    fn creates_a_detached_entity_with_an_empty_signal() {
        let subscription = create_midi_port_state_subscription();
        assert!(!has_signal_slots(
            &subscription.read().unwrap().on_midi_port_state_change
        ));
    }
}

mod detach_midi_access_state_subscription {
    use super::*;

    #[test]
    fn retains_a_failed_exact_release_for_retry() {
        let calls = Arc::new(AtomicUsize::new(0));
        let release_calls = calls.clone();
        let access = access(Arc::new(move |_listener| {
            let calls = release_calls.clone();
            Box::pin(async move {
                Ok(MidiEventBackendAttachOutcome {
                    attachment: Some(create_midi_event_attachment(
                        Arc::new("origin".to_string()),
                        Arc::new(move || {
                            let attempt = calls.fetch_add(1, Ordering::SeqCst);
                            Box::pin(async move {
                                Ok(MidiEventReleaseOutcome {
                                    reason: if attempt == 0 {
                                        MidiEventReleaseReason::OperationFailed
                                    } else {
                                        MidiEventReleaseReason::Ok
                                    },
                                })
                            })
                        }),
                    )),
                    reason: MidiEventBackendAttachReason::Ok,
                    release_failed: None,
                })
            })
        }));
        let subscription = create_midi_access_state_subscription();
        let _ = block_on(attach_midi_access_state_subscription(
            &access,
            &subscription,
        ));
        assert_eq!(
            block_on(detach_midi_access_state_subscription(&subscription)).reason,
            MidiSubscriptionDetachReason::OperationFailed
        );
        assert_eq!(
            block_on(detach_midi_access_state_subscription(&subscription)).reason,
            MidiSubscriptionDetachReason::Ok
        );
        assert_eq!(
            block_on(detach_midi_access_state_subscription(&subscription)).reason,
            MidiSubscriptionDetachReason::NotAttached
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}

mod detach_midi_input_message_subscription {
    use super::*;

    #[test]
    fn releases_once_and_then_reports_not_attached() {
        let input = input_port("input");
        let subscription = create_midi_input_message_subscription();
        let _ = block_on(attach_midi_input_message_subscription(
            &input,
            &subscription,
        ));
        assert_eq!(
            block_on(detach_midi_input_message_subscription(&subscription)).reason,
            MidiSubscriptionDetachReason::Ok
        );
        assert_eq!(
            block_on(detach_midi_input_message_subscription(&subscription)).reason,
            MidiSubscriptionDetachReason::NotAttached
        );
    }
}

mod detach_midi_port_state_subscription {
    use super::*;

    #[test]
    fn releases_native_attachment_without_clearing_consumer_slots() {
        let port = MidiPort::Input(input_port("input"));
        let subscription = create_midi_port_state_subscription();
        connect_signal(
            &subscription.read().unwrap().on_midi_port_state_change,
            Arc::new(|_port| {}),
            None,
        );
        let _ = block_on(attach_midi_port_state_subscription(&port, &subscription));
        assert_eq!(
            block_on(detach_midi_port_state_subscription(&subscription)).reason,
            MidiSubscriptionDetachReason::Ok
        );
        assert!(has_signal_slots(
            &subscription.read().unwrap().on_midi_port_state_change
        ));
    }
}

mod dispose_midi_access_state_subscription {
    use super::*;

    #[test]
    fn invalidates_in_flight_attach_releases_its_origin_and_stays_terminal() {
        let (pending, resolver) = deferred();
        let pending = Arc::new(Mutex::new(Some(pending)));
        let attach_started = Arc::new(AtomicBool::new(false));
        let started = attach_started.clone();
        let source = pending.clone();
        let access = access(Arc::new(move |_listener| {
            started.store(true, Ordering::SeqCst);
            let future = source.lock().unwrap().take().unwrap();
            Box::pin(future)
        }));
        let subscription = create_midi_access_state_subscription();
        connect_signal(
            &subscription.read().unwrap().on_midi_access_state_change,
            Arc::new(|_port| {}),
            None,
        );
        let attach_access = access.clone();
        let attach_subscription = subscription.clone();
        let attaching = std::thread::spawn(move || {
            block_on(attach_midi_access_state_subscription(
                &attach_access,
                &attach_subscription,
            ))
        });
        while !attach_started.load(Ordering::SeqCst) {
            std::thread::yield_now();
        }
        let dispose_subscription = subscription.clone();
        let disposing = std::thread::spawn(move || {
            block_on(dispose_midi_access_state_subscription(
                &dispose_subscription,
            ))
        });
        resolver.resolve(Ok(MidiEventBackendAttachOutcome {
            attachment: Some(successful_attachment()),
            reason: MidiEventBackendAttachReason::Ok,
            release_failed: None,
        }));
        assert_eq!(
            attaching.join().unwrap().reason,
            MidiSubscriptionAttachReason::Ok
        );
        assert_eq!(
            disposing.join().unwrap().reason,
            MidiSubscriptionDisposeReason::Ok
        );
        assert!(!has_signal_slots(
            &subscription.read().unwrap().on_midi_access_state_change
        ));
        assert_eq!(
            block_on(dispose_midi_access_state_subscription(&subscription)).reason,
            MidiSubscriptionDisposeReason::AlreadyDisposed
        );
        assert_eq!(
            block_on(attach_midi_access_state_subscription(
                &access,
                &subscription
            ))
            .reason,
            MidiSubscriptionAttachReason::OperationFailed
        );
    }
}

mod dispose_midi_input_message_subscription {
    use super::*;

    #[test]
    fn clears_slots_on_release_failure_and_retries_only_the_release() {
        let calls = Arc::new(AtomicUsize::new(0));
        let release_calls = calls.clone();
        let input = input_port("input");
        let state = get_midi_port_resource_state(&MidiPort::Input(input.clone())).unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.operations.attach_message = Arc::new(move |_listener| {
                let calls = release_calls.clone();
                Box::pin(async move {
                    Ok(MidiEventBackendAttachOutcome {
                        attachment: Some(create_midi_event_attachment(
                            Arc::new("origin".to_string()),
                            Arc::new(move || {
                                let attempt = calls.fetch_add(1, Ordering::SeqCst);
                                Box::pin(async move {
                                    Ok(MidiEventReleaseOutcome {
                                        reason: if attempt == 0 {
                                            MidiEventReleaseReason::OperationFailed
                                        } else {
                                            MidiEventReleaseReason::Ok
                                        },
                                    })
                                })
                            }),
                        )),
                        reason: MidiEventBackendAttachReason::Ok,
                        release_failed: None,
                    })
                })
            });
        }
        let subscription = create_midi_input_message_subscription();
        connect_signal(
            &subscription.read().unwrap().on_midi_input_message,
            Arc::new(|_message| {}),
            None,
        );
        let _ = block_on(attach_midi_input_message_subscription(
            &input,
            &subscription,
        ));
        assert_eq!(
            block_on(dispose_midi_input_message_subscription(&subscription)),
            MidiSubscriptionDisposeOutcome {
                attach_failed: Some(false),
                reason: MidiSubscriptionDisposeReason::OperationFailed,
                release_failed: Some(true),
            }
        );
        assert!(!has_signal_slots(
            &subscription.read().unwrap().on_midi_input_message
        ));
        assert_eq!(
            block_on(dispose_midi_input_message_subscription(&subscription)).reason,
            MidiSubscriptionDisposeReason::Ok
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}

mod dispose_midi_port_state_subscription {
    use super::*;

    #[test]
    fn is_idempotent_after_successful_terminal_release() {
        let port = MidiPort::Input(input_port("input"));
        let subscription = create_midi_port_state_subscription();
        let _ = block_on(attach_midi_port_state_subscription(&port, &subscription));
        assert_eq!(
            block_on(dispose_midi_port_state_subscription(&subscription)).reason,
            MidiSubscriptionDisposeReason::Ok
        );
        assert_eq!(
            block_on(dispose_midi_port_state_subscription(&subscription)).reason,
            MidiSubscriptionDisposeReason::AlreadyDisposed
        );
    }
}

mod initialize_midi_access_state_subscription {
    use super::*;

    #[test]
    fn installs_an_empty_access_signal() {
        let mut subscription: MidiAccessStateSubscription = allocate_entity();
        initialize_midi_access_state_subscription(&mut subscription);
        assert!(!has_signal_slots(&subscription.on_midi_access_state_change));
    }
}

mod initialize_midi_input_message_subscription {
    use super::*;

    #[test]
    fn installs_an_empty_message_signal() {
        let mut subscription: MidiInputMessageSubscription = allocate_entity();
        initialize_midi_input_message_subscription(&mut subscription);
        assert!(!has_signal_slots(&subscription.on_midi_input_message));
    }
}

mod initialize_midi_port_state_subscription {
    use super::*;

    #[test]
    fn installs_an_empty_port_signal() {
        let mut subscription: MidiPortStateSubscription = allocate_entity();
        initialize_midi_port_state_subscription(&mut subscription);
        assert!(!has_signal_slots(&subscription.on_midi_port_state_change));
    }
}
