use flight_midi::contract::*;

mod get_midi_access_dispose_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_access_dispose_reason_string(MidiAccessDisposeReason::AlreadyDisposed),
            "already-disposed"
        );
    }
}

mod get_midi_access_ports_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_access_ports_reason_string(MidiAccessPortsReason::Disposed),
            "disposed"
        );
    }
}

mod get_midi_access_request_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_access_request_reason_string(MidiAccessRequestReason::SecurityRestricted),
            "security-restricted"
        );
    }
}

mod get_midi_event_backend_attach_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_event_backend_attach_reason_string(
                MidiEventBackendAttachReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_midi_event_release_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_event_release_reason_string(MidiEventReleaseReason::Ok),
            "ok"
        );
    }
}

mod get_midi_message_send_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_message_send_reason_string(MidiMessageSendReason::SystemExclusiveNotEnabled),
            "system-exclusive-not-enabled"
        );
    }
}

mod get_midi_port_close_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_close_reason_string(MidiPortCloseReason::AlreadyClosed),
            "already-closed"
        );
    }
}

mod get_midi_port_connection_outcome_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_connection_outcome_reason_string(
                MidiPortConnectionOutcomeReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_midi_port_connection_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_connection_string(MidiPortConnection::Pending),
            "pending"
        );
    }
}

mod get_midi_port_dispose_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_dispose_reason_string(MidiPortDisposeReason::AlreadyDisposed),
            "already-disposed"
        );
    }
}

mod get_midi_port_lifecycle_failure_operation_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_lifecycle_failure_operation_string(
                MidiPortLifecycleFailureOperation::MessageSubscriptionRelease
            ),
            "message-subscription-release"
        );
    }
}

mod get_midi_port_open_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_open_reason_string(MidiPortOpenReason::AlreadyOpen),
            "already-open"
        );
    }
}

mod get_midi_port_state_outcome_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_state_outcome_reason_string(MidiPortStateOutcomeReason::Disposed),
            "disposed"
        );
    }
}

mod get_midi_port_state_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_port_state_string(MidiPortState::Disconnected),
            "disconnected"
        );
    }
}

mod get_midi_port_type_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(get_midi_port_type_string(MidiPortType::Output), "output");
    }
}

mod get_midi_subscription_attach_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_subscription_attach_reason_string(
                MidiSubscriptionAttachReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_midi_subscription_detach_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_subscription_detach_reason_string(MidiSubscriptionDetachReason::NotAttached),
            "not-attached"
        );
    }
}

mod get_midi_subscription_dispose_reason_string {
    use super::*;
    #[test]
    fn returns_canonical_text() {
        assert_eq!(
            get_midi_subscription_dispose_reason_string(
                MidiSubscriptionDisposeReason::AlreadyDisposed
            ),
            "already-disposed"
        );
    }
}

mod parse_midi_access_dispose_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_access_dispose_reason("ok"),
            Some(MidiAccessDisposeReason::Ok)
        );
        assert_eq!(parse_midi_access_dispose_reason("other"), None);
    }
}

mod parse_midi_access_ports_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_access_ports_reason("ok"),
            Some(MidiAccessPortsReason::Ok)
        );
        assert_eq!(parse_midi_access_ports_reason("other"), None);
    }
}

mod parse_midi_access_request_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_access_request_reason("permission-denied"),
            Some(MidiAccessRequestReason::PermissionDenied)
        );
        assert_eq!(parse_midi_access_request_reason("other"), None);
    }
}

mod parse_midi_event_backend_attach_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_event_backend_attach_reason("ok"),
            Some(MidiEventBackendAttachReason::Ok)
        );
        assert_eq!(parse_midi_event_backend_attach_reason("other"), None);
    }
}

mod parse_midi_event_release_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_event_release_reason("operation-failed"),
            Some(MidiEventReleaseReason::OperationFailed)
        );
        assert_eq!(parse_midi_event_release_reason("other"), None);
    }
}

mod parse_midi_message_send_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_message_send_reason("sent"),
            Some(MidiMessageSendReason::Sent)
        );
        assert_eq!(parse_midi_message_send_reason("other"), None);
    }
}

mod parse_midi_port_close_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_close_reason("closed"),
            Some(MidiPortCloseReason::Closed)
        );
        assert_eq!(parse_midi_port_close_reason("other"), None);
    }
}

mod parse_midi_port_connection {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_connection("open"),
            Some(MidiPortConnection::Open)
        );
        assert_eq!(parse_midi_port_connection("other"), None);
    }
}

mod parse_midi_port_connection_outcome_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_connection_outcome_reason("ok"),
            Some(MidiPortConnectionOutcomeReason::Ok)
        );
        assert_eq!(parse_midi_port_connection_outcome_reason("other"), None);
    }
}

mod parse_midi_port_dispose_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_dispose_reason("ok"),
            Some(MidiPortDisposeReason::Ok)
        );
        assert_eq!(parse_midi_port_dispose_reason("other"), None);
    }
}

mod parse_midi_port_lifecycle_failure_operation {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_lifecycle_failure_operation("close"),
            Some(MidiPortLifecycleFailureOperation::Close)
        );
        assert_eq!(parse_midi_port_lifecycle_failure_operation("other"), None);
    }
}

mod parse_midi_port_open_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_open_reason("opened"),
            Some(MidiPortOpenReason::Opened)
        );
        assert_eq!(parse_midi_port_open_reason("other"), None);
    }
}

mod parse_midi_port_state {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_state("connected"),
            Some(MidiPortState::Connected)
        );
        assert_eq!(parse_midi_port_state("other"), None);
    }
}

mod parse_midi_port_state_outcome_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_port_state_outcome_reason("ok"),
            Some(MidiPortStateOutcomeReason::Ok)
        );
        assert_eq!(parse_midi_port_state_outcome_reason("other"), None);
    }
}

mod parse_midi_port_type {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(parse_midi_port_type("input"), Some(MidiPortType::Input));
        assert_eq!(parse_midi_port_type("other"), None);
    }
}

mod parse_midi_subscription_attach_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_subscription_attach_reason("ok"),
            Some(MidiSubscriptionAttachReason::Ok)
        );
        assert_eq!(parse_midi_subscription_attach_reason("other"), None);
    }
}

mod parse_midi_subscription_detach_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_subscription_detach_reason("not-attached"),
            Some(MidiSubscriptionDetachReason::NotAttached)
        );
        assert_eq!(parse_midi_subscription_detach_reason("other"), None);
    }
}

mod parse_midi_subscription_dispose_reason {
    use super::*;
    #[test]
    fn parses_exact_text_and_rejects_unknown_values() {
        assert_eq!(
            parse_midi_subscription_dispose_reason("ok"),
            Some(MidiSubscriptionDisposeReason::Ok)
        );
        assert_eq!(parse_midi_subscription_dispose_reason("other"), None);
    }
}
