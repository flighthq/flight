use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_midi::contract::*;

use crate::{block_on, error, input_port, output_port, successful_attachment};

fn operations(
    inputs: Vec<flight_entity::Ref<MidiInputPort>>,
    outputs: Vec<flight_entity::Ref<MidiOutputPort>>,
) -> MidiAccessResourceOperations {
    return MidiAccessResourceOperations {
        attach_state_change: Arc::new(|_listener| {
            Box::pin(async {
                Ok(MidiEventBackendAttachOutcome {
                    attachment: Some(successful_attachment()),
                    reason: MidiEventBackendAttachReason::Ok,
                    release_failed: None,
                })
            })
        }),
        get_input_ports: Arc::new(move || Ok(inputs.clone())),
        get_output_ports: Arc::new(move || Ok(outputs.clone())),
        provider: Arc::new("access".to_string()),
    };
}

mod create_midi_access_resource {
    use super::*;

    #[test]
    fn creates_an_empty_entity_with_private_provider_state() {
        let access = create_midi_access_resource(operations(Vec::new(), Vec::new()));
        let state = get_midi_access_resource_state(&access).unwrap();
        assert!(!state.read().unwrap().disposed);
        assert!(state.read().unwrap().known_ports.is_empty());
    }
}

mod dispose_midi_access {
    use super::*;

    #[test]
    fn disposes_each_known_identity_once_and_is_terminal() {
        let input = input_port("input");
        let output = output_port("output");
        let access = create_midi_access_resource(operations(
            vec![input.clone(), input.clone()],
            vec![output.clone()],
        ));
        assert_eq!(get_midi_access_input_ports(&access).ports.unwrap().len(), 2);
        assert_eq!(
            get_midi_access_output_ports(&access).ports.unwrap().len(),
            1
        );
        assert_eq!(
            block_on(dispose_midi_access(&access)).reason,
            MidiAccessDisposeReason::Ok
        );
        assert_eq!(
            block_on(dispose_midi_access(&access)).reason,
            MidiAccessDisposeReason::AlreadyDisposed
        );
        assert_eq!(
            block_on(dispose_midi_port(&MidiPort::Input(input))).reason,
            MidiPortDisposeReason::AlreadyDisposed
        );
        assert_eq!(
            block_on(dispose_midi_port(&MidiPort::Output(output))).reason,
            MidiPortDisposeReason::AlreadyDisposed
        );
    }

    #[test]
    fn flattens_failed_port_cleanup_with_stable_metadata() {
        let closes = Arc::new(AtomicUsize::new(0));
        let close_calls = closes.clone();
        let port = create_midi_input_port_resource(
            &crate::metadata("failed"),
            MidiInputPortResourceOperations {
                attach_message: Arc::new(|_listener| Box::pin(async { Err(error()) })),
                attach_state_change: Arc::new(|_listener| Box::pin(async { Err(error()) })),
                close: Arc::new(move || {
                    close_calls.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async { Err(error()) })
                }),
                get_connection: Arc::new(|| Ok(MidiPortConnection::Closed)),
                get_state: Arc::new(|| Ok(MidiPortState::Connected)),
                open: Arc::new(|| Box::pin(async { Ok(()) })),
                provider: Arc::new(()),
            },
        );
        let state = get_midi_port_resource_state(&MidiPort::Input(port.clone())).unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state.write().unwrap() {
            state.flight_opened = true;
            state.operations.get_connection = Arc::new(|| Err(error()));
        }
        let access = create_midi_access_resource(operations(vec![port], Vec::new()));
        let _ = get_midi_access_input_ports(&access);
        let outcome = block_on(dispose_midi_access(&access));
        assert_eq!(outcome.reason, MidiAccessDisposeReason::OperationFailed);
        assert_eq!(
            outcome.failures,
            Some(vec![MidiAccessLifecycleFailure {
                id: Some("failed".to_string()),
                operation: MidiPortLifecycleFailureOperation::Close,
                type_: Some(MidiPortType::Input),
            }])
        );
        assert_eq!(closes.load(Ordering::SeqCst), 1);
    }
}

mod get_midi_access_input_ports {
    use super::*;

    #[test]
    fn returns_fresh_lists_while_retaining_stable_port_identity() {
        let input = input_port("input");
        let access = create_midi_access_resource(operations(vec![input.clone()], Vec::new()));
        let first = get_midi_access_input_ports(&access).ports.unwrap();
        let second = get_midi_access_input_ports(&access).ports.unwrap();
        assert!(Arc::ptr_eq(&first[0], &input));
        assert!(Arc::ptr_eq(&first[0], &second[0]));
        assert_eq!(
            get_midi_access_resource_state(&access)
                .unwrap()
                .read()
                .unwrap()
                .known_ports
                .len(),
            1
        );
    }
}

mod get_midi_access_output_ports {
    use super::*;

    #[test]
    fn maps_provider_failure_and_disposed_state() {
        let mut failed = operations(Vec::new(), Vec::new());
        failed.get_output_ports = Arc::new(|| Err(error()));
        let access = create_midi_access_resource(failed);
        assert_eq!(
            get_midi_access_output_ports(&access).reason,
            MidiAccessPortsReason::OperationFailed
        );
        assert_eq!(
            block_on(dispose_midi_access(&access)).reason,
            MidiAccessDisposeReason::Ok
        );
        assert_eq!(
            get_midi_access_output_ports(&access).reason,
            MidiAccessPortsReason::Disposed
        );
    }
}

mod initialize_midi_access_resource {
    use super::*;

    #[test]
    fn leaves_construction_state_unbound_until_retained() {
        let mut access: MidiAccess = allocate_entity();
        initialize_midi_access_resource(&mut access);
        let access = Arc::new(RwLock::new(access));
        assert!(get_midi_access_resource_state(&access).is_none());
    }
}

mod request_midi_access {
    use super::*;

    #[test]
    fn preserves_provider_outcomes_and_maps_rejection() {
        let access = create_midi_access_resource(operations(Vec::new(), Vec::new()));
        let accepted_access = access.clone();
        let accepted = HostMidiAccessCapability {
            provider: Arc::new("accepted".to_string()),
            request_access: Arc::new(move || {
                let access = accepted_access.clone();
                Box::pin(async move {
                    Ok(MidiAccessRequestOutcome {
                        access: Some(access),
                        reason: MidiAccessRequestReason::Accepted,
                    })
                })
            }),
        };
        let outcome = block_on(request_midi_access(&accepted));
        assert_eq!(outcome.reason, MidiAccessRequestReason::Accepted);
        assert!(Arc::ptr_eq(&outcome.access.unwrap(), &access));

        let rejected = HostMidiAccessCapability {
            provider: Arc::new("rejected".to_string()),
            request_access: Arc::new(|| Box::pin(async { Err(error()) })),
        };
        assert_eq!(
            block_on(request_midi_access(&rejected)).reason,
            MidiAccessRequestReason::OperationFailed
        );
    }
}
