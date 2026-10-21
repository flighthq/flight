use std::sync::{Arc, Mutex, RwLock};

use flight_socket::contract::*;

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

fn runtime_of(socket: &flight_entity::Ref<Socket>) -> SocketRuntime {
    let current = socket.read().unwrap();
    return flight_entity::get_entity_binding_as::<SocketRuntime, Socket>(&current)
        .expect("socket runtime is attached")
        .clone();
}

fn recording_backend(label: &'static str, opened: Arc<Mutex<Vec<String>>>) -> HostSocketCapability {
    return HostSocketCapability {
        provider: Arc::new(()),
        open_socket: Arc::new(move |_options: &SocketOptions, _events: &SocketEventSink| {
            opened.lock().unwrap().push(label.to_string());
            return Some(SocketConnection {
                send_socket_frame: Arc::new(|_data: &SocketMessageData| true),
                close_socket_connection: Arc::new(|_code: Option<i32>, _reason: Option<&str>| {}),
            });
        }),
        open_tcp_socket: None,
    };
}

mod create_socket {
    use super::*;

    #[test]
    fn opens_through_the_capability_carried_by_the_host_it_is_given() {
        let opened = Arc::new(Mutex::new(Vec::new()));
        let backend = recording_backend("a", opened.clone());
        let guard = guard_state();
        create_socket(&guard, Some(&backend), &options("wss://example.test"));
        assert_eq!(*opened.lock().unwrap(), vec!["a".to_string()]);
    }

    #[test]
    fn keeps_two_hosts_independent() {
        let opened = Arc::new(Mutex::new(Vec::new()));
        let first = recording_backend("first", opened.clone());
        let second = recording_backend("second", opened.clone());
        let guard = guard_state();
        create_socket(&guard, Some(&first), &options("wss://one.test"));
        create_socket(&guard, Some(&second), &options("wss://two.test"));
        assert_eq!(
            *opened.lock().unwrap(),
            vec!["first".to_string(), "second".to_string()]
        );
    }

    #[test]
    fn yields_no_connection_when_the_host_carries_no_socket_capability() {
        let guard = guard_state();
        let socket = create_socket(&guard, None, &options("wss://absent.test"));
        assert!(runtime_of(&socket).connection.is_none());
        assert_eq!(
            get_socket_ready_state(&socket),
            SocketReadyState::Connecting
        );
    }

    #[test]
    fn does_not_consult_one_host_capability_when_another_host_is_passed() {
        let opened = Arc::new(Mutex::new(Vec::new()));
        _ = recording_backend("unused", opened.clone());
        let used = recording_backend("used", opened.clone());
        let guard = guard_state();
        create_socket(&guard, Some(&used), &options("wss://x.test"));
        assert_eq!(*opened.lock().unwrap(), vec!["used".to_string()]);
    }
}
