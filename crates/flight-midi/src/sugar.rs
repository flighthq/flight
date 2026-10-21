#![allow(async_fn_in_trait)]

//! D18 Rust conveniences for the MIDI public lane. Every method is a thin delegate to a free
//! function; provider state, identity and lifecycle behavior remain in the contract layer.

use flight_entity::{Ref, Uint8Array};
use flight_permissions::HostMidiPermissionCapability;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::sync::Arc;
    use std::task::{Context, Poll, Waker};

    use flight_signals::has_signal_slots;

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    fn attach_outcome() -> MidiEventBackendAttachOutcome {
        return MidiEventBackendAttachOutcome {
            attachment: None,
            reason: MidiEventBackendAttachReason::Ok,
            release_failed: None,
        };
    }

    fn access_operations() -> MidiAccessResourceOperations {
        return MidiAccessResourceOperations {
            attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
            get_input_ports: Arc::new(|| Ok(Vec::new())),
            get_output_ports: Arc::new(|| Ok(Vec::new())),
            provider: Arc::new("access".to_string()),
        };
    }

    fn access_resource() -> Ref<MidiAccess> {
        return create_midi_access_resource(access_operations());
    }

    fn input_operations() -> MidiInputPortResourceOperations {
        return MidiInputPortResourceOperations {
            attach_message: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
            attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
            close: Arc::new(|| Box::pin(async { Ok(()) })),
            get_connection: Arc::new(|| Ok(MidiPortConnection::Closed)),
            get_state: Arc::new(|| Ok(MidiPortState::Connected)),
            open: Arc::new(|| Box::pin(async { Ok(()) })),
            provider: Arc::new("input".to_string()),
        };
    }

    fn metadata(id: &str) -> MidiPortMetadata {
        return MidiPortMetadata {
            id: id.to_string(),
            manufacturer: None,
            name: None,
            version: None,
        };
    }

    fn output_operations() -> MidiOutputPortResourceOperations {
        return MidiOutputPortResourceOperations {
            attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
            close: Arc::new(|| Box::pin(async { Ok(()) })),
            get_connection: Arc::new(|| Ok(MidiPortConnection::Open)),
            get_state: Arc::new(|| Ok(MidiPortState::Connected)),
            open: Arc::new(|| Box::pin(async { Ok(()) })),
            provider: Arc::new("output".to_string()),
            send: Arc::new(|_data, _timestamp| Ok(())),
        };
    }

    fn port_operations() -> MidiPortResourceOperations {
        return MidiPortResourceOperations {
            attach_state_change: Arc::new(|_listener| Box::pin(async { Ok(attach_outcome()) })),
            close: Arc::new(|| Box::pin(async { Ok(()) })),
            get_connection: Arc::new(|| Ok(MidiPortConnection::Pending)),
            get_state: Arc::new(|| Ok(MidiPortState::Connected)),
            open: Arc::new(|| Box::pin(async { Ok(()) })),
            provider: Arc::new("port".to_string()),
        };
    }

    #[test]
    fn host_midi_access_request_access_matches_free_function() {
        let capability = HostMidiAccessCapability {
            provider: Arc::new("access".to_string()),
            request_access: Arc::new(|| {
                Box::pin(async {
                    Ok(MidiAccessRequestOutcome {
                        access: None,
                        reason: MidiAccessRequestReason::Unsupported,
                    })
                })
            }),
        };
        assert_eq!(
            block_on(capability.request_access()),
            block_on(request_midi_access(&capability))
        );
    }

    #[test]
    fn host_midi_permission_get_permission_matches_free_function() {
        let capability = HostMidiPermissionCapability {
            get_permission: Arc::new(|| {
                Box::pin(async {
                    Ok(PermissionQueryOutcome {
                        reason: PermissionQueryReason::Ok,
                        state: Some(PermissionState::Granted),
                    })
                })
            }),
            provider: Arc::new("permission".to_string()),
        };
        assert_eq!(
            block_on(capability.get_permission()),
            block_on(get_midi_permission(&capability))
        );
    }

    #[test]
    fn midi_access_attach_state_subscription_matches_free_function() {
        let method_access = access_resource();
        let free_access = access_resource();
        let method_subscription = create_midi_access_state_subscription();
        let free_subscription = create_midi_access_state_subscription();
        assert_eq!(
            block_on(method_access.attach_state_subscription(&method_subscription)),
            block_on(attach_midi_access_state_subscription(
                &free_access,
                &free_subscription,
            ))
        );
    }

    #[test]
    fn midi_access_dispose_matches_free_function() {
        assert_eq!(
            block_on(access_resource().dispose()),
            block_on(dispose_midi_access(&access_resource()))
        );
    }

    #[test]
    fn midi_access_input_ports_matches_free_function() {
        assert!(access_resource().input_ports() == get_midi_access_input_ports(&access_resource()));
    }

    #[test]
    fn midi_access_output_ports_matches_free_function() {
        assert!(
            access_resource().output_ports() == get_midi_access_output_ports(&access_resource())
        );
    }

    #[test]
    fn midi_access_state_subscription_detach_matches_free_function() {
        assert_eq!(
            block_on(create_midi_access_state_subscription().detach()),
            block_on(detach_midi_access_state_subscription(
                &create_midi_access_state_subscription(),
            ))
        );
    }

    #[test]
    fn midi_access_state_subscription_dispose_matches_free_function() {
        assert_eq!(
            block_on(create_midi_access_state_subscription().dispose()),
            block_on(dispose_midi_access_state_subscription(
                &create_midi_access_state_subscription(),
            ))
        );
    }

    #[test]
    fn midi_access_state_subscription_new_matches_free_function() {
        assert_eq!(
            has_signal_slots(
                &MidiAccessStateSubscription::new()
                    .read()
                    .unwrap()
                    .on_midi_access_state_change
            ),
            has_signal_slots(
                &create_midi_access_state_subscription()
                    .read()
                    .unwrap()
                    .on_midi_access_state_change
            ),
        );
    }

    #[test]
    fn midi_event_attachment_release_matches_free_function() {
        let create = || {
            create_midi_event_attachment(
                Arc::new("attachment".to_string()),
                Arc::new(|| {
                    Box::pin(async {
                        Ok(MidiEventReleaseOutcome {
                            reason: MidiEventReleaseReason::Ok,
                        })
                    })
                }),
            )
        };
        assert_eq!(
            block_on(create().release()).unwrap(),
            block_on(release_midi_event_attachment(&create())).unwrap()
        );
    }

    #[test]
    fn midi_input_message_subscription_detach_matches_free_function() {
        assert_eq!(
            block_on(create_midi_input_message_subscription().detach()),
            block_on(detach_midi_input_message_subscription(
                &create_midi_input_message_subscription(),
            ))
        );
    }

    #[test]
    fn midi_input_message_subscription_dispose_matches_free_function() {
        assert_eq!(
            block_on(create_midi_input_message_subscription().dispose()),
            block_on(dispose_midi_input_message_subscription(
                &create_midi_input_message_subscription(),
            ))
        );
    }

    #[test]
    fn midi_input_message_subscription_new_matches_free_function() {
        assert_eq!(
            has_signal_slots(
                &MidiInputMessageSubscription::new()
                    .read()
                    .unwrap()
                    .on_midi_input_message
            ),
            has_signal_slots(
                &create_midi_input_message_subscription()
                    .read()
                    .unwrap()
                    .on_midi_input_message
            ),
        );
    }

    #[test]
    fn midi_input_port_attach_message_subscription_matches_free_function() {
        let method_port = create_midi_input_port_resource(&metadata("method"), input_operations());
        let free_port = create_midi_input_port_resource(&metadata("free"), input_operations());
        assert_eq!(
            block_on(
                method_port.attach_message_subscription(&create_midi_input_message_subscription(),)
            ),
            block_on(attach_midi_input_message_subscription(
                &free_port,
                &create_midi_input_message_subscription(),
            ))
        );
    }

    #[test]
    fn midi_output_port_send_message_matches_free_function() {
        let method_port =
            create_midi_output_port_resource(&metadata("method"), output_operations());
        let free_port = create_midi_output_port_resource(&metadata("free"), output_operations());
        assert_eq!(
            method_port.send_message(&[0x90, 60, 127], Some(42.5)),
            send_midi_message(&free_port, &[0x90, 60, 127], Some(42.5))
        );
    }

    #[test]
    fn midi_port_attach_state_subscription_matches_free_function() {
        let method_port = MidiPort::Input(create_midi_input_port_resource(
            &metadata("method"),
            input_operations(),
        ));
        let free_port = MidiPort::Input(create_midi_input_port_resource(
            &metadata("free"),
            input_operations(),
        ));
        assert_eq!(
            block_on(
                method_port.attach_state_subscription(&create_midi_port_state_subscription(),)
            ),
            block_on(attach_midi_port_state_subscription(
                &free_port,
                &create_midi_port_state_subscription(),
            ))
        );
    }

    #[test]
    fn midi_port_close_matches_free_function() {
        let create = || {
            MidiPort::Input(create_midi_input_port_resource(
                &metadata("input"),
                input_operations(),
            ))
        };
        assert_eq!(
            block_on(create().close()),
            block_on(close_midi_port(&create()))
        );
    }

    #[test]
    fn midi_port_connection_matches_free_function() {
        let create = || {
            MidiPort::Input(create_midi_input_port_resource(
                &metadata("input"),
                input_operations(),
            ))
        };
        assert_eq!(create().connection(), get_midi_port_connection(&create()));
    }

    #[test]
    fn midi_port_dispose_matches_free_function() {
        let create = || {
            MidiPort::Input(create_midi_input_port_resource(
                &metadata("input"),
                input_operations(),
            ))
        };
        assert_eq!(
            block_on(create().dispose()),
            block_on(dispose_midi_port(&create()))
        );
    }

    #[test]
    fn midi_port_open_matches_free_function() {
        let create = || {
            MidiPort::Input(create_midi_input_port_resource(
                &metadata("input"),
                input_operations(),
            ))
        };
        assert_eq!(
            block_on(create().open()),
            block_on(open_midi_port(&create()))
        );
    }

    #[test]
    fn midi_port_state_matches_free_function() {
        let create = || {
            MidiPort::Input(create_midi_input_port_resource(
                &metadata("input"),
                input_operations(),
            ))
        };
        assert_eq!(create().state(), get_midi_port_state(&create()));
    }

    #[test]
    fn midi_port_state_subscription_detach_matches_free_function() {
        assert_eq!(
            block_on(create_midi_port_state_subscription().detach()),
            block_on(detach_midi_port_state_subscription(
                &create_midi_port_state_subscription(),
            ))
        );
    }

    #[test]
    fn midi_port_state_subscription_dispose_matches_free_function() {
        assert_eq!(
            block_on(create_midi_port_state_subscription().dispose()),
            block_on(dispose_midi_port_state_subscription(
                &create_midi_port_state_subscription(),
            ))
        );
    }

    #[test]
    fn midi_port_state_subscription_new_matches_free_function() {
        assert_eq!(
            has_signal_slots(
                &MidiPortStateSubscription::new()
                    .read()
                    .unwrap()
                    .on_midi_port_state_change
            ),
            has_signal_slots(
                &create_midi_port_state_subscription()
                    .read()
                    .unwrap()
                    .on_midi_port_state_change
            ),
        );
    }

    #[test]
    fn midi_access_resource_operation_methods_match_free_functions() {
        let operations = access_operations();
        assert_eq!(
            block_on(operations.attach_state_change(Arc::new(|_port| {}))).unwrap(),
            block_on(attach_midi_access_resource_state_change(
                &operations,
                Arc::new(|_port| {}),
            ))
            .unwrap()
        );
        assert_eq!(
            operations.get_input_ports().unwrap().is_empty(),
            get_midi_access_resource_input_ports(&operations)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            operations.get_output_ports().unwrap().is_empty(),
            get_midi_access_resource_output_ports(&operations)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn midi_input_port_resource_operation_methods_match_free_functions() {
        let operations = input_operations();
        assert_eq!(
            block_on(operations.attach_message(Arc::new(|_data, _timestamp| {}))).unwrap(),
            block_on(attach_midi_input_port_resource_message(
                &operations,
                Arc::new(|_data, _timestamp| {}),
            ))
            .unwrap()
        );
        assert_eq!(
            block_on(operations.attach_state_change(Arc::new(|| {}))).unwrap(),
            block_on(attach_midi_input_port_resource_state_change(
                &operations,
                Arc::new(|| {}),
            ))
            .unwrap()
        );
        assert_eq!(
            block_on(operations.close()),
            block_on(close_midi_input_port_resource(&operations))
        );
        assert_eq!(
            operations.get_connection(),
            get_midi_input_port_resource_connection(&operations)
        );
        assert_eq!(
            operations.get_state(),
            read_midi_input_port_resource_state(&operations)
        );
        assert_eq!(
            block_on(operations.open()),
            block_on(open_midi_input_port_resource(&operations))
        );
    }

    #[test]
    fn midi_output_port_resource_operation_methods_match_free_functions() {
        let operations = output_operations();
        assert_eq!(
            block_on(operations.attach_state_change(Arc::new(|| {}))).unwrap(),
            block_on(attach_midi_output_port_resource_state_change(
                &operations,
                Arc::new(|| {}),
            ))
            .unwrap()
        );
        assert_eq!(
            block_on(operations.close()),
            block_on(close_midi_output_port_resource(&operations))
        );
        assert_eq!(
            operations.get_connection(),
            get_midi_output_port_resource_connection(&operations)
        );
        assert_eq!(
            operations.get_state(),
            read_midi_output_port_resource_state(&operations)
        );
        assert_eq!(
            block_on(operations.open()),
            block_on(open_midi_output_port_resource(&operations))
        );
        assert_eq!(
            operations.send(&[0x90, 60, 127], Some(42.5)),
            send_midi_output_port_resource(&operations, &[0x90, 60, 127], Some(42.5))
        );
    }

    #[test]
    fn midi_port_resource_operation_methods_match_free_functions() {
        let operations = port_operations();
        assert_eq!(
            block_on(operations.attach_state_change(Arc::new(|| {}))).unwrap(),
            block_on(attach_midi_port_resource_state_change(
                &operations,
                Arc::new(|| {}),
            ))
            .unwrap()
        );
        assert_eq!(
            block_on(operations.close()),
            block_on(close_midi_port_resource(&operations))
        );
        assert_eq!(
            operations.get_connection(),
            get_midi_port_resource_connection(&operations)
        );
        assert_eq!(
            operations.get_state(),
            read_midi_port_resource_state(&operations)
        );
        assert_eq!(
            block_on(operations.open()),
            block_on(open_midi_port_resource(&operations))
        );
    }

    #[test]
    fn midi_access_dispose_reason_string_methods_delegate() {
        assert_eq!(
            MidiAccessDisposeReason::parse("ok"),
            parse_midi_access_dispose_reason("ok")
        );
        assert_eq!(
            MidiAccessDisposeReason::Ok.to_str(),
            get_midi_access_dispose_reason_string(MidiAccessDisposeReason::Ok)
        );
    }

    #[test]
    fn midi_access_ports_reason_string_methods_delegate() {
        assert_eq!(
            MidiAccessPortsReason::parse("ok"),
            parse_midi_access_ports_reason("ok")
        );
        assert_eq!(
            MidiAccessPortsReason::Ok.to_str(),
            get_midi_access_ports_reason_string(MidiAccessPortsReason::Ok)
        );
    }

    #[test]
    fn midi_access_request_reason_string_methods_delegate() {
        assert_eq!(
            MidiAccessRequestReason::parse("accepted"),
            parse_midi_access_request_reason("accepted")
        );
        assert_eq!(
            MidiAccessRequestReason::Accepted.to_str(),
            get_midi_access_request_reason_string(MidiAccessRequestReason::Accepted)
        );
    }

    #[test]
    fn midi_event_backend_attach_reason_string_methods_delegate() {
        assert_eq!(
            MidiEventBackendAttachReason::parse("ok"),
            parse_midi_event_backend_attach_reason("ok")
        );
        assert_eq!(
            MidiEventBackendAttachReason::Ok.to_str(),
            get_midi_event_backend_attach_reason_string(MidiEventBackendAttachReason::Ok)
        );
    }

    #[test]
    fn midi_event_release_reason_string_methods_delegate() {
        assert_eq!(
            MidiEventReleaseReason::parse("ok"),
            parse_midi_event_release_reason("ok")
        );
        assert_eq!(
            MidiEventReleaseReason::Ok.to_str(),
            get_midi_event_release_reason_string(MidiEventReleaseReason::Ok)
        );
    }

    #[test]
    fn midi_message_send_reason_string_methods_delegate() {
        assert_eq!(
            MidiMessageSendReason::parse("sent"),
            parse_midi_message_send_reason("sent")
        );
        assert_eq!(
            MidiMessageSendReason::Sent.to_str(),
            get_midi_message_send_reason_string(MidiMessageSendReason::Sent)
        );
    }

    #[test]
    fn midi_port_close_reason_string_methods_delegate() {
        assert_eq!(
            MidiPortCloseReason::parse("closed"),
            parse_midi_port_close_reason("closed")
        );
        assert_eq!(
            MidiPortCloseReason::Closed.to_str(),
            get_midi_port_close_reason_string(MidiPortCloseReason::Closed)
        );
    }

    #[test]
    fn midi_port_connection_outcome_reason_string_methods_delegate() {
        assert_eq!(
            MidiPortConnectionOutcomeReason::parse("ok"),
            parse_midi_port_connection_outcome_reason("ok")
        );
        assert_eq!(
            MidiPortConnectionOutcomeReason::Ok.to_str(),
            get_midi_port_connection_outcome_reason_string(MidiPortConnectionOutcomeReason::Ok)
        );
    }

    #[test]
    fn midi_port_connection_string_methods_delegate() {
        assert_eq!(
            MidiPortConnection::parse("open"),
            parse_midi_port_connection("open")
        );
        assert_eq!(
            MidiPortConnection::Open.to_str(),
            get_midi_port_connection_string(MidiPortConnection::Open)
        );
    }

    #[test]
    fn midi_port_dispose_reason_string_methods_delegate() {
        assert_eq!(
            MidiPortDisposeReason::parse("ok"),
            parse_midi_port_dispose_reason("ok")
        );
        assert_eq!(
            MidiPortDisposeReason::Ok.to_str(),
            get_midi_port_dispose_reason_string(MidiPortDisposeReason::Ok)
        );
    }

    #[test]
    fn midi_port_lifecycle_failure_operation_string_methods_delegate() {
        assert_eq!(
            MidiPortLifecycleFailureOperation::parse("close"),
            parse_midi_port_lifecycle_failure_operation("close")
        );
        assert_eq!(
            MidiPortLifecycleFailureOperation::Close.to_str(),
            get_midi_port_lifecycle_failure_operation_string(
                MidiPortLifecycleFailureOperation::Close
            )
        );
    }

    #[test]
    fn midi_port_open_reason_string_methods_delegate() {
        assert_eq!(
            MidiPortOpenReason::parse("opened"),
            parse_midi_port_open_reason("opened")
        );
        assert_eq!(
            MidiPortOpenReason::Opened.to_str(),
            get_midi_port_open_reason_string(MidiPortOpenReason::Opened)
        );
    }

    #[test]
    fn midi_port_state_outcome_reason_string_methods_delegate() {
        assert_eq!(
            MidiPortStateOutcomeReason::parse("ok"),
            parse_midi_port_state_outcome_reason("ok")
        );
        assert_eq!(
            MidiPortStateOutcomeReason::Ok.to_str(),
            get_midi_port_state_outcome_reason_string(MidiPortStateOutcomeReason::Ok)
        );
    }

    #[test]
    fn midi_port_state_string_methods_delegate() {
        assert_eq!(
            MidiPortState::parse("connected"),
            parse_midi_port_state("connected")
        );
        assert_eq!(
            MidiPortState::Connected.to_str(),
            get_midi_port_state_string(MidiPortState::Connected)
        );
    }

    #[test]
    fn midi_port_type_string_methods_delegate() {
        assert_eq!(MidiPortType::parse("input"), parse_midi_port_type("input"));
        assert_eq!(
            MidiPortType::Input.to_str(),
            get_midi_port_type_string(MidiPortType::Input)
        );
    }

    #[test]
    fn midi_subscription_attach_reason_string_methods_delegate() {
        assert_eq!(
            MidiSubscriptionAttachReason::parse("ok"),
            parse_midi_subscription_attach_reason("ok")
        );
        assert_eq!(
            MidiSubscriptionAttachReason::Ok.to_str(),
            get_midi_subscription_attach_reason_string(MidiSubscriptionAttachReason::Ok)
        );
    }

    #[test]
    fn midi_subscription_detach_reason_string_methods_delegate() {
        assert_eq!(
            MidiSubscriptionDetachReason::parse("ok"),
            parse_midi_subscription_detach_reason("ok")
        );
        assert_eq!(
            MidiSubscriptionDetachReason::Ok.to_str(),
            get_midi_subscription_detach_reason_string(MidiSubscriptionDetachReason::Ok)
        );
    }

    #[test]
    fn midi_subscription_dispose_reason_string_methods_delegate() {
        assert_eq!(
            MidiSubscriptionDisposeReason::parse("ok"),
            parse_midi_subscription_dispose_reason("ok")
        );
        assert_eq!(
            MidiSubscriptionDisposeReason::Ok.to_str(),
            get_midi_subscription_dispose_reason_string(MidiSubscriptionDisposeReason::Ok)
        );
    }
}

impl HostMidiAccessCapability {
    pub async fn request_access(&self) -> MidiAccessRequestOutcome {
        return request_midi_access(self).await;
    }
}

impl MidiAccessDisposeReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_access_dispose_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_access_dispose_reason_string(self);
    }
}

impl MidiAccessResourceOperations {
    pub async fn attach_state_change(
        &self,
        listener: MidiAccessStateListener,
    ) -> MidiEventBackendAttachProviderResult {
        return attach_midi_access_resource_state_change(self, listener).await;
    }

    pub fn get_input_ports(&self) -> MidiInputPortsProviderResult {
        return get_midi_access_resource_input_ports(self);
    }

    pub fn get_output_ports(&self) -> MidiOutputPortsProviderResult {
        return get_midi_access_resource_output_ports(self);
    }
}

pub trait MidiAccessMethods {
    async fn attach_state_subscription(
        &self,
        subscription: &Ref<MidiAccessStateSubscription>,
    ) -> MidiSubscriptionAttachOutcome;
    async fn dispose(&self) -> MidiAccessDisposeOutcome;
    fn input_ports(&self) -> MidiAccessPortsOutcome<MidiInputPort>;
    fn output_ports(&self) -> MidiAccessPortsOutcome<MidiOutputPort>;
}

impl MidiAccessMethods for Ref<MidiAccess> {
    async fn attach_state_subscription(
        &self,
        subscription: &Ref<MidiAccessStateSubscription>,
    ) -> MidiSubscriptionAttachOutcome {
        return attach_midi_access_state_subscription(self, subscription).await;
    }

    async fn dispose(&self) -> MidiAccessDisposeOutcome {
        return dispose_midi_access(self).await;
    }

    fn input_ports(&self) -> MidiAccessPortsOutcome<MidiInputPort> {
        return get_midi_access_input_ports(self);
    }

    fn output_ports(&self) -> MidiAccessPortsOutcome<MidiOutputPort> {
        return get_midi_access_output_ports(self);
    }
}

impl MidiAccessPortsReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_access_ports_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_access_ports_reason_string(self);
    }
}

impl MidiAccessRequestReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_access_request_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_access_request_reason_string(self);
    }
}

impl MidiAccessStateSubscription {
    pub fn new() -> Ref<Self> {
        return create_midi_access_state_subscription();
    }
}

pub trait MidiAccessStateSubscriptionMethods {
    async fn detach(&self) -> MidiSubscriptionDetachOutcome;
    async fn dispose(&self) -> MidiSubscriptionDisposeOutcome;
}

impl MidiAccessStateSubscriptionMethods for Ref<MidiAccessStateSubscription> {
    async fn detach(&self) -> MidiSubscriptionDetachOutcome {
        return detach_midi_access_state_subscription(self).await;
    }

    async fn dispose(&self) -> MidiSubscriptionDisposeOutcome {
        return dispose_midi_access_state_subscription(self).await;
    }
}

impl MidiEventAttachmentMethods for Ref<MidiEventAttachment> {
    async fn release(&self) -> MidiEventReleaseProviderResult {
        return release_midi_event_attachment(self).await;
    }
}

impl MidiEventBackendAttachReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_event_backend_attach_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_event_backend_attach_reason_string(self);
    }
}

pub trait MidiEventAttachmentMethods {
    async fn release(&self) -> MidiEventReleaseProviderResult;
}

impl MidiEventReleaseReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_event_release_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_event_release_reason_string(self);
    }
}

pub trait MidiInputPortMethods {
    async fn attach_message_subscription(
        &self,
        subscription: &Ref<MidiInputMessageSubscription>,
    ) -> MidiSubscriptionAttachOutcome;
}

impl MidiInputPortMethods for Ref<MidiInputPort> {
    async fn attach_message_subscription(
        &self,
        subscription: &Ref<MidiInputMessageSubscription>,
    ) -> MidiSubscriptionAttachOutcome {
        return attach_midi_input_message_subscription(self, subscription).await;
    }
}

impl MidiInputPortResourceOperations {
    pub async fn attach_message(
        &self,
        listener: MidiInputMessageListener,
    ) -> MidiEventBackendAttachProviderResult {
        return attach_midi_input_port_resource_message(self, listener).await;
    }

    pub async fn attach_state_change(
        &self,
        listener: MidiPortStateListener,
    ) -> MidiEventBackendAttachProviderResult {
        return attach_midi_input_port_resource_state_change(self, listener).await;
    }

    pub async fn close(&self) -> MidiPortCommandResult {
        return close_midi_input_port_resource(self).await;
    }

    pub fn get_connection(&self) -> MidiPortConnectionProviderResult {
        return get_midi_input_port_resource_connection(self);
    }

    pub fn get_state(&self) -> MidiPortStateProviderResult {
        return read_midi_input_port_resource_state(self);
    }

    pub async fn open(&self) -> MidiPortCommandResult {
        return open_midi_input_port_resource(self).await;
    }
}

impl MidiInputMessageSubscription {
    pub fn new() -> Ref<Self> {
        return create_midi_input_message_subscription();
    }
}

pub trait MidiInputMessageSubscriptionMethods {
    async fn detach(&self) -> MidiSubscriptionDetachOutcome;
    async fn dispose(&self) -> MidiSubscriptionDisposeOutcome;
}

impl MidiInputMessageSubscriptionMethods for Ref<MidiInputMessageSubscription> {
    async fn detach(&self) -> MidiSubscriptionDetachOutcome {
        return detach_midi_input_message_subscription(self).await;
    }

    async fn dispose(&self) -> MidiSubscriptionDisposeOutcome {
        return dispose_midi_input_message_subscription(self).await;
    }
}

impl MidiMessageSendReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_message_send_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_message_send_reason_string(self);
    }
}

pub trait MidiOutputPortMethods {
    fn send_message(&self, data: &Uint8Array, timestamp: Option<f64>) -> MidiMessageSendOutcome;
}

impl MidiOutputPortMethods for Ref<MidiOutputPort> {
    // flight-lint: allow(f64) D1: the optional Web MIDI send timestamp preserves fractional milliseconds
    fn send_message(&self, data: &Uint8Array, timestamp: Option<f64>) -> MidiMessageSendOutcome {
        return send_midi_message(self, data, timestamp);
    }
}

impl MidiOutputPortResourceOperations {
    pub async fn attach_state_change(
        &self,
        listener: MidiPortStateListener,
    ) -> MidiEventBackendAttachProviderResult {
        return attach_midi_output_port_resource_state_change(self, listener).await;
    }

    pub async fn close(&self) -> MidiPortCommandResult {
        return close_midi_output_port_resource(self).await;
    }

    pub fn get_connection(&self) -> MidiPortConnectionProviderResult {
        return get_midi_output_port_resource_connection(self);
    }

    pub fn get_state(&self) -> MidiPortStateProviderResult {
        return read_midi_output_port_resource_state(self);
    }

    pub async fn open(&self) -> MidiPortCommandResult {
        return open_midi_output_port_resource(self).await;
    }

    // flight-lint: allow(f64) D1: the optional Web MIDI send timestamp preserves fractional milliseconds
    pub fn send(&self, data: &Uint8Array, timestamp: Option<f64>) -> MidiSendProviderResult {
        return send_midi_output_port_resource(self, data, timestamp);
    }
}

impl MidiPort {
    pub async fn attach_state_subscription(
        &self,
        subscription: &Ref<MidiPortStateSubscription>,
    ) -> MidiSubscriptionAttachOutcome {
        return attach_midi_port_state_subscription(self, subscription).await;
    }

    pub async fn close(&self) -> MidiPortCloseOutcome {
        return close_midi_port(self).await;
    }

    pub fn connection(&self) -> MidiPortConnectionOutcome {
        return get_midi_port_connection(self);
    }

    pub async fn dispose(&self) -> MidiPortDisposeOutcome {
        return dispose_midi_port(self).await;
    }

    pub async fn open(&self) -> MidiPortOpenOutcome {
        return open_midi_port(self).await;
    }

    pub fn state(&self) -> MidiPortStateOutcome {
        return get_midi_port_state(self);
    }
}

impl MidiPortCloseReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_close_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_close_reason_string(self);
    }
}

impl MidiPortConnection {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_connection(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_connection_string(self);
    }
}

impl MidiPortConnectionOutcomeReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_connection_outcome_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_connection_outcome_reason_string(self);
    }
}

impl MidiPortDisposeReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_dispose_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_dispose_reason_string(self);
    }
}

impl MidiPortLifecycleFailureOperation {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_lifecycle_failure_operation(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_lifecycle_failure_operation_string(self);
    }
}

impl MidiPortOpenReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_open_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_open_reason_string(self);
    }
}

impl MidiPortResourceOperations {
    pub async fn attach_state_change(
        &self,
        listener: MidiPortStateListener,
    ) -> MidiEventBackendAttachProviderResult {
        return attach_midi_port_resource_state_change(self, listener).await;
    }

    pub async fn close(&self) -> MidiPortCommandResult {
        return close_midi_port_resource(self).await;
    }

    pub fn get_connection(&self) -> MidiPortConnectionProviderResult {
        return get_midi_port_resource_connection(self);
    }

    pub fn get_state(&self) -> MidiPortStateProviderResult {
        return read_midi_port_resource_state(self);
    }

    pub async fn open(&self) -> MidiPortCommandResult {
        return open_midi_port_resource(self).await;
    }
}

impl MidiPortState {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_state(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_state_string(self);
    }
}

impl MidiPortStateOutcomeReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_state_outcome_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_state_outcome_reason_string(self);
    }
}

impl MidiPortStateSubscription {
    pub fn new() -> Ref<Self> {
        return create_midi_port_state_subscription();
    }
}

pub trait MidiPortStateSubscriptionMethods {
    async fn detach(&self) -> MidiSubscriptionDetachOutcome;
    async fn dispose(&self) -> MidiSubscriptionDisposeOutcome;
}

impl MidiPortStateSubscriptionMethods for Ref<MidiPortStateSubscription> {
    async fn detach(&self) -> MidiSubscriptionDetachOutcome {
        return detach_midi_port_state_subscription(self).await;
    }

    async fn dispose(&self) -> MidiSubscriptionDisposeOutcome {
        return dispose_midi_port_state_subscription(self).await;
    }
}

impl MidiPortType {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_port_type(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_port_type_string(self);
    }
}

impl MidiSubscriptionAttachReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_subscription_attach_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_subscription_attach_reason_string(self);
    }
}

impl MidiSubscriptionDetachReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_subscription_detach_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_subscription_detach_reason_string(self);
    }
}

impl MidiSubscriptionDisposeReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_midi_subscription_dispose_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_midi_subscription_dispose_reason_string(self);
    }
}

pub trait HostMidiPermissionCapabilityMethods {
    async fn get_permission(&self) -> PermissionQueryOutcome;
}

impl HostMidiPermissionCapabilityMethods for HostMidiPermissionCapability {
    async fn get_permission(&self) -> PermissionQueryOutcome {
        return get_midi_permission(self).await;
    }
}
