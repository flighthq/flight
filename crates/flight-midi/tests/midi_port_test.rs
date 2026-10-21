use std::sync::atomic::{AtomicU8, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_entity::allocate_entity;
use flight_midi::contract::*;

use crate::{block_on, error, input_port, metadata, output_port, successful_attachment};

mod close_midi_port {
    use super::*;

    #[test]
    fn closes_through_the_origin_and_handles_current_state() {
        let connection = Arc::new(AtomicU8::new(1));
        let get_connection = connection.clone();
        let closed_connection = connection.clone();
        let closes = Arc::new(AtomicUsize::new(0));
        let close_calls = closes.clone();
        let port = create_midi_input_port_resource(
            &metadata("input"),
            MidiInputPortResourceOperations {
                attach_message: Arc::new(|_listener| Box::pin(async { Err(error()) })),
                attach_state_change: Arc::new(|_listener| Box::pin(async { Err(error()) })),
                close: Arc::new(move || {
                    close_calls.fetch_add(1, Ordering::SeqCst);
                    closed_connection.store(0, Ordering::SeqCst);
                    Box::pin(async { Ok(()) })
                }),
                get_connection: Arc::new(move || {
                    Ok(if get_connection.load(Ordering::SeqCst) == 0 {
                        MidiPortConnection::Closed
                    } else {
                        MidiPortConnection::Open
                    })
                }),
                get_state: Arc::new(|| Ok(MidiPortState::Connected)),
                open: Arc::new(|| Box::pin(async { Ok(()) })),
                provider: Arc::new(()),
            },
        );
        let port = MidiPort::Input(port);
        assert_eq!(
            block_on(close_midi_port(&port)).reason,
            MidiPortCloseReason::Closed
        );
        assert_eq!(
            block_on(close_midi_port(&port)).reason,
            MidiPortCloseReason::AlreadyClosed
        );
        assert_eq!(closes.load(Ordering::SeqCst), 1);
    }
}

mod create_midi_input_port_resource {
    use super::*;

    #[test]
    fn creates_distinct_entities_even_for_the_same_metadata() {
        let a = input_port("same");
        let b = input_port("same");
        assert!(!Arc::ptr_eq(&a, &b));
        assert_eq!(a.read().unwrap().type_, MidiPortType::Input);
    }
}

mod create_midi_output_port_resource {
    use super::*;

    #[test]
    fn creates_output_metadata_without_exposing_live_state() {
        let port = output_port("output");
        let port = port.read().unwrap();
        assert_eq!(port.id, "output");
        assert_eq!(port.type_, MidiPortType::Output);
        assert_eq!(port.manufacturer.as_deref(), Some("Flight"));
    }
}

mod dispose_midi_port {
    use super::*;

    #[test]
    fn retries_only_a_failed_owned_close_and_then_becomes_terminal() {
        let close_calls = Arc::new(AtomicUsize::new(0));
        let attempts = close_calls.clone();
        let port = create_midi_output_port_resource(
            &metadata("output"),
            MidiOutputPortResourceOperations {
                attach_state_change: Arc::new(|_listener| {
                    Box::pin(async {
                        Ok(MidiEventBackendAttachOutcome {
                            attachment: Some(successful_attachment()),
                            reason: MidiEventBackendAttachReason::Ok,
                            release_failed: None,
                        })
                    })
                }),
                close: Arc::new(move || {
                    let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async move { if attempt == 0 { Err(error()) } else { Ok(()) } })
                }),
                get_connection: Arc::new(|| Ok(MidiPortConnection::Open)),
                get_state: Arc::new(|| Ok(MidiPortState::Connected)),
                open: Arc::new(|| Box::pin(async { Ok(()) })),
                provider: Arc::new(()),
                send: Arc::new(|_data, _timestamp| Ok(())),
            },
        );
        let port = MidiPort::Output(port);
        let state = get_midi_port_resource_state(&port).unwrap();
        if let MidiPortResourceState::Output(state) = &mut *state.write().unwrap() {
            state.flight_opened = true;
        }
        let first = block_on(dispose_midi_port(&port));
        assert_eq!(first.reason, MidiPortDisposeReason::OperationFailed);
        assert_eq!(
            first.failures,
            Some(vec![MidiPortLifecycleFailure {
                operation: MidiPortLifecycleFailureOperation::Close,
            }])
        );
        assert_eq!(
            block_on(dispose_midi_port(&port)).reason,
            MidiPortDisposeReason::Ok
        );
        assert_eq!(
            block_on(dispose_midi_port(&port)).reason,
            MidiPortDisposeReason::AlreadyDisposed
        );
        assert_eq!(close_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn does_not_close_a_borrowed_already_open_port() {
        let closes = Arc::new(AtomicUsize::new(0));
        let close_calls = closes.clone();
        let port = create_midi_input_port_resource(
            &metadata("borrowed"),
            MidiInputPortResourceOperations {
                attach_message: Arc::new(|_listener| Box::pin(async { Err(error()) })),
                attach_state_change: Arc::new(|_listener| Box::pin(async { Err(error()) })),
                close: Arc::new(move || {
                    close_calls.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async { Ok(()) })
                }),
                get_connection: Arc::new(|| Ok(MidiPortConnection::Open)),
                get_state: Arc::new(|| Ok(MidiPortState::Connected)),
                open: Arc::new(|| Box::pin(async { Ok(()) })),
                provider: Arc::new(()),
            },
        );
        assert_eq!(
            block_on(dispose_midi_port(&MidiPort::Input(port))).reason,
            MidiPortDisposeReason::Ok
        );
        assert_eq!(closes.load(Ordering::SeqCst), 0);
    }
}

mod get_midi_port_connection {
    use super::*;

    #[test]
    fn pulls_each_snapshot_and_maps_provider_failure() {
        let port = input_port("input");
        assert_eq!(
            get_midi_port_connection(&MidiPort::Input(port.clone())),
            MidiPortConnectionOutcome {
                connection: Some(MidiPortConnection::Closed),
                reason: MidiPortConnectionOutcomeReason::Ok,
            }
        );
        let state = get_midi_port_resource_state(&MidiPort::Input(port.clone())).unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.operations.get_connection = Arc::new(|| Err(error()));
        }
        assert_eq!(
            get_midi_port_connection(&MidiPort::Input(port)).reason,
            MidiPortConnectionOutcomeReason::OperationFailed
        );
    }
}

mod get_midi_port_state {
    use super::*;

    #[test]
    fn pulls_provider_state_without_mirroring_it_publicly() {
        let port = output_port("output");
        assert_eq!(
            get_midi_port_state(&MidiPort::Output(port)),
            MidiPortStateOutcome {
                reason: MidiPortStateOutcomeReason::Ok,
                state: Some(MidiPortState::Connected),
            }
        );
    }
}

mod initialize_midi_input_port_resource {
    use super::*;

    #[test]
    fn copies_immutable_input_metadata() {
        let mut port: MidiInputPort = allocate_entity();
        initialize_midi_input_port_resource(&mut port, &metadata("input"));
        assert_eq!(port.id, "input");
        assert_eq!(port.type_, MidiPortType::Input);
    }
}

mod initialize_midi_output_port_resource {
    use super::*;

    #[test]
    fn copies_immutable_output_metadata() {
        let mut port: MidiOutputPort = allocate_entity();
        initialize_midi_output_port_resource(&mut port, &metadata("output"));
        assert_eq!(port.id, "output");
        assert_eq!(port.type_, MidiPortType::Output);
    }
}

mod open_midi_port {
    use super::*;

    #[test]
    fn rejects_disconnected_and_pending_ports_before_opening() {
        let port = input_port("input");
        let midi_port = MidiPort::Input(port.clone());
        let state = get_midi_port_resource_state(&midi_port).unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.operations.get_state = Arc::new(|| Ok(MidiPortState::Disconnected));
        }
        assert_eq!(
            block_on(open_midi_port(&midi_port)).reason,
            MidiPortOpenReason::Disconnected
        );
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.operations.get_state = Arc::new(|| Ok(MidiPortState::Connected));
            state.operations.get_connection = Arc::new(|| Ok(MidiPortConnection::Pending));
        }
        assert_eq!(
            block_on(open_midi_port(&midi_port)).reason,
            MidiPortOpenReason::OperationFailed
        );
    }

    #[test]
    fn records_only_opens_performed_by_flight() {
        let opens = Arc::new(AtomicUsize::new(0));
        let open_calls = opens.clone();
        let port = input_port("input");
        let midi_port = MidiPort::Input(port.clone());
        let state = get_midi_port_resource_state(&midi_port).unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.operations.open = Arc::new(move || {
                open_calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { Ok(()) })
            });
        }
        assert_eq!(
            block_on(open_midi_port(&midi_port)).reason,
            MidiPortOpenReason::Opened
        );
        assert_eq!(opens.load(Ordering::SeqCst), 1);
        if let MidiPortResourceState::Input(state) = &*state.read().unwrap() {
            assert!(state.flight_opened);
        }
    }
}

mod send_midi_message {
    use super::*;

    #[test]
    fn validates_before_touching_the_provider() {
        let calls = Arc::new(AtomicUsize::new(0));
        let send_calls = calls.clone();
        let port = output_port("output");
        let state = get_midi_port_resource_state(&MidiPort::Output(port.clone())).unwrap();
        if let MidiPortResourceState::Output(state) = &mut *state.write().unwrap() {
            state.operations.send = Arc::new(move |_data, _timestamp| {
                send_calls.fetch_add(1, Ordering::SeqCst);
                Ok(())
            });
        }
        for data in [
            vec![],
            vec![0x70],
            vec![0x90, 60],
            vec![0x90, 0x80, 1],
            vec![0xf4],
        ] {
            assert_eq!(
                send_midi_message(&port, &data, None).reason,
                MidiMessageSendReason::InvalidMessage
            );
        }
        assert_eq!(
            send_midi_message(&port, &[0xf0, 1], None).reason,
            MidiMessageSendReason::SystemExclusiveNotEnabled
        );
        assert_eq!(
            send_midi_message(&port, &[0x90, 60, 127], Some(f64::NAN)).reason,
            MidiMessageSendReason::InvalidMessage
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn copies_valid_bytes_and_preserves_the_timestamp() {
        let sent = Arc::new(Mutex::new(Vec::new()));
        let captured = sent.clone();
        let port = output_port("output");
        let state = get_midi_port_resource_state(&MidiPort::Output(port.clone())).unwrap();
        if let MidiPortResourceState::Output(state) = &mut *state.write().unwrap() {
            state.operations.get_connection = Arc::new(|| Ok(MidiPortConnection::Open));
            state.operations.send = Arc::new(move |data, timestamp| {
                captured.lock().unwrap().push((data, timestamp));
                Ok(())
            });
        }
        let mut data = vec![0x90, 60, 127];
        assert_eq!(
            send_midi_message(&port, &data, Some(42.5)).reason,
            MidiMessageSendReason::Sent
        );
        data[1] = 1;
        assert_eq!(
            *sent.lock().unwrap(),
            vec![(vec![0x90, 60, 127], Some(42.5))]
        );
    }
}
