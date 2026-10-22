use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_midi::contract::*;

use crate::{block_on, input_port, metadata, output_port};

fn access_operations() -> MidiAccessResourceOperations {
    return MidiAccessResourceOperations {
        attach_state_change: Arc::new(|_listener| {
            Box::pin(async {
                Ok(MidiEventBackendAttachOutcome {
                    attachment: None,
                    reason: MidiEventBackendAttachReason::Ok,
                    release_failed: None,
                })
            })
        }),
        get_input_ports: Arc::new(|| Ok(Vec::new())),
        get_output_ports: Arc::new(|| Ok(Vec::new())),
        provider: Arc::new("access".to_string()),
    };
}

fn input_operations() -> MidiInputPortResourceOperations {
    return MidiInputPortResourceOperations {
        attach_message: Arc::new(|_listener| {
            Box::pin(async {
                Ok(MidiEventBackendAttachOutcome {
                    attachment: None,
                    reason: MidiEventBackendAttachReason::Ok,
                    release_failed: None,
                })
            })
        }),
        attach_state_change: Arc::new(|_listener| {
            Box::pin(async {
                Ok(MidiEventBackendAttachOutcome {
                    attachment: None,
                    reason: MidiEventBackendAttachReason::Ok,
                    release_failed: None,
                })
            })
        }),
        close: Arc::new(|| Box::pin(async { Ok(()) })),
        get_connection: Arc::new(|| Ok(MidiPortConnection::Closed)),
        get_state: Arc::new(|| Ok(MidiPortState::Connected)),
        open: Arc::new(|| Box::pin(async { Ok(()) })),
        provider: Arc::new("input".to_string()),
    };
}

fn output_operations() -> MidiOutputPortResourceOperations {
    return MidiOutputPortResourceOperations {
        attach_state_change: Arc::new(|_listener| {
            Box::pin(async {
                Ok(MidiEventBackendAttachOutcome {
                    attachment: None,
                    reason: MidiEventBackendAttachReason::Ok,
                    release_failed: None,
                })
            })
        }),
        close: Arc::new(|| Box::pin(async { Ok(()) })),
        get_connection: Arc::new(|| Ok(MidiPortConnection::Closed)),
        get_state: Arc::new(|| Ok(MidiPortState::Connected)),
        open: Arc::new(|| Box::pin(async { Ok(()) })),
        provider: Arc::new("output".to_string()),
        send: Arc::new(|_data, _timestamp| Ok(())),
    };
}

mod create_midi_event_attachment {
    use super::*;

    #[test]
    fn creates_an_origin_pinned_release_entity() {
        let attachment = create_midi_event_attachment(
            Arc::new("provider".to_string()),
            Arc::new(|| {
                Box::pin(async {
                    Ok(MidiEventReleaseOutcome {
                        reason: MidiEventReleaseReason::Ok,
                    })
                })
            }),
        );
        assert_eq!(
            block_on(release_midi_event_attachment(&attachment))
                .unwrap()
                .reason,
            MidiEventReleaseReason::Ok
        );
    }
}

mod get_midi_access_resource_state {
    use super::*;

    #[test]
    fn returns_only_the_exact_access_binding() {
        let access = create_midi_access_resource(access_operations());
        let state = get_midi_access_resource_state(&access).unwrap();
        assert!(!state.read().unwrap().disposed);
        let unbound = Arc::new(RwLock::new(allocate_entity::<MidiAccess>()));
        assert!(get_midi_access_resource_state(&unbound).is_none());
    }
}

mod get_midi_port_resource_state {
    use super::*;

    #[test]
    fn preserves_distinct_input_and_output_entities_with_matching_ids() {
        let input = input_port("same");
        let output = output_port("same");
        let input_state = get_midi_port_resource_state(&MidiPort::Input(input)).unwrap();
        let output_state = get_midi_port_resource_state(&MidiPort::Output(output)).unwrap();
        assert!(!Arc::ptr_eq(&input_state, &output_state));
    }
}

mod initialize_midi_event_attachment {
    use super::*;

    #[test]
    fn installs_the_exact_release_callback() {
        let mut attachment: MidiEventAttachment = allocate_entity();
        initialize_midi_event_attachment(
            &mut attachment,
            Arc::new("provider".to_string()),
            Arc::new(|| {
                Box::pin(async {
                    Ok(MidiEventReleaseOutcome {
                        reason: MidiEventReleaseReason::OperationFailed,
                    })
                })
            }),
        );
        let attachment = Arc::new(RwLock::new(attachment));
        assert_eq!(
            block_on(release_midi_event_attachment(&attachment))
                .unwrap()
                .reason,
            MidiEventReleaseReason::OperationFailed
        );
    }
}

mod release_midi_event_attachment {
    use super::*;

    #[test]
    fn reports_an_unbound_attachment_as_an_operation_failure() {
        let attachment = Arc::new(RwLock::new(allocate_entity::<MidiEventAttachment>()));
        assert_eq!(
            block_on(release_midi_event_attachment(&attachment))
                .unwrap()
                .reason,
            MidiEventReleaseReason::OperationFailed
        );
    }
}

mod retain_midi_access_resource_state {
    use super::*;

    #[test]
    fn binds_the_provider_operations_to_the_entity() {
        let provider: flight_host::ProviderRef = Arc::new("provider".to_string());
        let mut operations = access_operations();
        operations.provider = provider.clone();
        let mut access: MidiAccess = allocate_entity();
        retain_midi_access_resource_state(&mut access, operations);
        let access = Arc::new(RwLock::new(access));
        let state = get_midi_access_resource_state(&access).unwrap();
        assert!(Arc::ptr_eq(
            &state.read().unwrap().operations.provider,
            &provider
        ));
    }
}

mod retain_midi_input_port_resource_state {
    use super::*;

    #[test]
    fn binds_input_specific_message_state() {
        let mut port: MidiInputPort = allocate_entity();
        initialize_midi_input_port_resource(&mut port, &metadata("input"));
        retain_midi_input_port_resource_state(&mut port, input_operations());
        let port = Arc::new(RwLock::new(port));
        let state = get_midi_port_resource_state(&MidiPort::Input(port)).unwrap();
        assert!(matches!(
            &*state.read().unwrap(),
            MidiPortResourceState::Input(_)
        ));
    }
}

mod retain_midi_output_port_resource_state {
    use super::*;

    #[test]
    fn binds_output_specific_send_state() {
        let mut port: MidiOutputPort = allocate_entity();
        initialize_midi_output_port_resource(&mut port, &metadata("output"));
        retain_midi_output_port_resource_state(&mut port, output_operations());
        let port = Arc::new(RwLock::new(port));
        let state = get_midi_port_resource_state(&MidiPort::Output(port)).unwrap();
        assert!(matches!(
            &*state.read().unwrap(),
            MidiPortResourceState::Output(_)
        ));
    }
}
