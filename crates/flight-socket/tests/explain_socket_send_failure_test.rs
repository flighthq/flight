use std::sync::{Arc, Mutex, RwLock};

use flight_socket::contract::*;

struct Fixture {
    backend: HostSocketCapability,
    sink: Arc<Mutex<Option<SocketEventSink>>>,
}

fn fixture(has_connection: bool, send_result: bool) -> Fixture {
    let sink = Arc::new(Mutex::new(None));
    let sink_for_backend = sink.clone();
    let backend = HostSocketCapability {
        provider: Arc::new(()),
        open_socket: Arc::new(move |_options: &SocketOptions, events: &SocketEventSink| {
            *sink_for_backend.lock().unwrap() = Some(events.clone());
            if !has_connection {
                return None;
            }
            return Some(SocketConnection {
                send_socket_frame: Arc::new(move |_data: &SocketMessageData| send_result),
                close_socket_connection: Arc::new(|_code: Option<i32>, _reason: Option<&str>| {}),
            });
        }),
        open_tcp_socket: None,
    };
    return Fixture { backend, sink };
}

fn guard_state() -> SocketGuardStateRef {
    return Arc::new(RwLock::new(SocketGuardState {
        guard: None,
        enabled: false,
    }));
}

fn options(url: &str) -> SocketOptions {
    return SocketOptions {
        url: url.to_string(),
        protocols: None,
        binary_type: None,
    };
}

fn sink_of(fixture: &Fixture) -> SocketEventSink {
    let current = fixture.sink.lock().unwrap();
    return current.as_ref().expect("backend captured a sink").clone();
}

mod explain_socket_send_failure {
    use super::*;

    #[test]
    fn identifies_an_unsupported_backend_with_no_connection() {
        let fixture = fixture(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fixture.backend), &options("tcp://host"));
        assert_eq!(
            explain_socket_send_failure(&socket),
            Some(SocketSendFailureExplanation {
                reason: SocketSendFailureReason::NoConnection,
                ready_state: SocketReadyState::Connecting,
                url: "tcp://host".to_string(),
            })
        );
    }

    #[test]
    fn reports_the_current_non_open_phase_when_a_connection_exists() {
        let fixture = fixture(true, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fixture.backend), &options("ws://host"));
        assert_eq!(
            explain_socket_send_failure(&socket),
            Some(SocketSendFailureExplanation {
                reason: SocketSendFailureReason::NotOpen,
                ready_state: SocketReadyState::Connecting,
                url: "ws://host".to_string(),
            })
        );
    }

    #[test]
    fn returns_null_once_the_socket_can_reach_its_backend_even_when_that_backend_returns_false() {
        let fixture = fixture(true, false);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fixture.backend), &options("ws://host"));
        (sink_of(&fixture).handle_socket_open)();
        assert!(!send_socket_message(
            &guard,
            &socket,
            &SocketMessageData::Text("frame".to_string())
        ));
        assert_eq!(explain_socket_send_failure(&socket), None);
    }

    #[test]
    fn distinguishes_terminal_disposal_from_other_closed_or_disconnected_states() {
        let fixture = fixture(true, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fixture.backend), &options("ws://host"));
        dispose_socket(&socket);
        assert_eq!(
            explain_socket_send_failure(&socket),
            Some(SocketSendFailureExplanation {
                reason: SocketSendFailureReason::Disposed,
                ready_state: SocketReadyState::Closed,
                url: "ws://host".to_string(),
            })
        );
    }
}
