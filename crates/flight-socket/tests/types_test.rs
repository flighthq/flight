use std::sync::Arc;

use flight_socket::contract::*;
use flight_stream::{create_readable_stream, create_writable_stream};

mod get_socket_binary_type_string {
    use super::*;

    #[test]
    fn returns_the_source_literal() {
        assert_eq!(
            get_socket_binary_type_string(SocketBinaryType::ArrayBuffer),
            "arraybuffer"
        );
    }
}

mod get_socket_guard_operation_string {
    use super::*;

    #[test]
    fn returns_the_source_camel_case_literals() {
        assert_eq!(
            get_socket_guard_operation_string(SocketGuardOperation::CreateSocket),
            "createSocket"
        );
        assert_eq!(
            get_socket_guard_operation_string(SocketGuardOperation::CloseSocket),
            "closeSocket"
        );
        assert_eq!(
            get_socket_guard_operation_string(SocketGuardOperation::EnableSocketSignals),
            "enableSocketSignals"
        );
        assert_eq!(
            get_socket_guard_operation_string(SocketGuardOperation::SendSocketMessage),
            "sendSocketMessage"
        );
    }
}

mod get_socket_guard_reason_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_socket_guard_reason_string(SocketGuardReason::NoConnection),
            "no-connection"
        );
        assert_eq!(
            get_socket_guard_reason_string(SocketGuardReason::Disposed),
            "disposed"
        );
    }
}

mod get_socket_ready_state_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_socket_ready_state_string(SocketReadyState::Connecting),
            "connecting"
        );
        assert_eq!(
            get_socket_ready_state_string(SocketReadyState::Open),
            "open"
        );
        assert_eq!(
            get_socket_ready_state_string(SocketReadyState::Closing),
            "closing"
        );
        assert_eq!(
            get_socket_ready_state_string(SocketReadyState::Closed),
            "closed"
        );
    }
}

mod get_socket_send_failure_reason_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_socket_send_failure_reason_string(SocketSendFailureReason::Disposed),
            "disposed"
        );
        assert_eq!(
            get_socket_send_failure_reason_string(SocketSendFailureReason::NoConnection),
            "no-connection"
        );
        assert_eq!(
            get_socket_send_failure_reason_string(SocketSendFailureReason::NotOpen),
            "not-open"
        );
    }
}

mod parse_socket_binary_type {
    use super::*;

    #[test]
    fn round_trips_the_source_literal() {
        assert_eq!(
            parse_socket_binary_type(get_socket_binary_type_string(SocketBinaryType::ArrayBuffer)),
            Some(SocketBinaryType::ArrayBuffer)
        );
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_socket_binary_type("blob"), None);
    }
}

mod parse_socket_guard_operation {
    use super::*;

    #[test]
    fn round_trips_every_operation() {
        for operation in [
            SocketGuardOperation::CreateSocket,
            SocketGuardOperation::CloseSocket,
            SocketGuardOperation::EnableSocketSignals,
            SocketGuardOperation::SendSocketMessage,
        ] {
            assert_eq!(
                parse_socket_guard_operation(get_socket_guard_operation_string(operation)),
                Some(operation)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_socket_guard_operation("detachSocket"), None);
    }
}

mod parse_socket_guard_reason {
    use super::*;

    #[test]
    fn round_trips_every_reason() {
        for reason in [SocketGuardReason::NoConnection, SocketGuardReason::Disposed] {
            assert_eq!(
                parse_socket_guard_reason(get_socket_guard_reason_string(reason)),
                Some(reason)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_socket_guard_reason("not-open"), None);
    }
}

mod parse_socket_ready_state {
    use super::*;

    #[test]
    fn round_trips_every_phase() {
        for state in [
            SocketReadyState::Connecting,
            SocketReadyState::Open,
            SocketReadyState::Closing,
            SocketReadyState::Closed,
        ] {
            assert_eq!(
                parse_socket_ready_state(get_socket_ready_state_string(state)),
                Some(state)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_socket_ready_state("opening"), None);
    }
}

mod parse_socket_send_failure_reason {
    use super::*;

    #[test]
    fn round_trips_every_reason() {
        for reason in [
            SocketSendFailureReason::Disposed,
            SocketSendFailureReason::NoConnection,
            SocketSendFailureReason::NotOpen,
        ] {
            assert_eq!(
                parse_socket_send_failure_reason(get_socket_send_failure_reason_string(reason)),
                Some(reason)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_socket_send_failure_reason("open"), None);
    }
}

mod socket_transport_contract {
    use super::*;

    #[test]
    fn tcp_connection_publishes_byte_streams_and_an_explicit_close() {
        let closed = Arc::new(Arc::new(std::sync::Mutex::new(0)));
        let closed_for_connection = closed.clone();
        let connection = TcpSocketConnection {
            readable: create_readable_stream(Box::new(futures::io::empty())),
            writable: create_writable_stream(Box::new(futures::io::sink())),
            close_tcp_socket_connection: Arc::new(move || {
                *closed_for_connection.lock().unwrap() += 1;
            }),
        };
        let _readable = &connection.readable;
        let _writable = &connection.writable;
        (connection.close_tcp_socket_connection)();
        assert_eq!(*closed.lock().unwrap(), 1);
    }

    #[test]
    fn tcp_options_name_a_host_and_port_only() {
        let options = TcpSocketOptions {
            host: "db.internal".to_string(),
            port: 5432,
        };
        assert_eq!(options.host, "db.internal");
        assert_eq!(options.port, 5432);
    }

    #[test]
    fn host_group_keeps_the_connection_slot_optional() {
        let empty = HostSocketCapabilities { connection: None };
        assert!(empty.connection.is_none());
        let populated = HostSocketCapabilities {
            connection: Some(HostSocketCapability {
                provider: Arc::new(()),
                open_socket: Arc::new(|_options, _events| None),
                open_tcp_socket: None,
            }),
        };
        assert!(populated.connection.is_some());
    }
}
