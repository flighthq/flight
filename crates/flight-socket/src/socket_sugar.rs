//! D18 sugar for the socket public lane: entity lifecycle methods, capability operations and
//! connection commands, each a thin delegate to its free function. Sugar contains no logic.

use flight_entity::Ref;

use crate::explain_socket_send_failure::explain_socket_send_failure;
use crate::socket::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, Mutex, RwLock};

    use flight_stream::{create_readable_stream, create_writable_stream};

    use super::*;

    struct Fake {
        host: HostSocketCapability,
        sink: Arc<Mutex<Option<SocketEventSink>>>,
        opened: Arc<Mutex<Vec<String>>>,
        sent: Arc<Mutex<Vec<SocketMessageData>>>,
        closes: Arc<Mutex<Vec<(Option<i32>, Option<String>)>>>,
    }

    fn fake(open_returns_null: bool, send_result: bool) -> Fake {
        let sink = Arc::new(Mutex::new(None));
        let opened = Arc::new(Mutex::new(Vec::new()));
        let sent = Arc::new(Mutex::new(Vec::new()));
        let closes = Arc::new(Mutex::new(Vec::new()));
        let sink_for_host = sink.clone();
        let opened_for_host = opened.clone();
        let sent_for_host = sent.clone();
        let closes_for_host = closes.clone();
        let host = HostSocketCapability {
            provider: Arc::new(()),
            open_socket: Arc::new(move |options: &SocketOptions, events: &SocketEventSink| {
                *sink_for_host.lock().unwrap() = Some(events.clone());
                opened_for_host.lock().unwrap().push(options.url.clone());
                if open_returns_null {
                    return None;
                }
                let sent = sent_for_host.clone();
                let closes = closes_for_host.clone();
                return Some(SocketConnection {
                    send_socket_frame: Arc::new(move |data: &SocketMessageData| {
                        sent.lock().unwrap().push(data.clone());
                        return send_result;
                    }),
                    close_socket_connection: Arc::new(
                        move |code: Option<i32>, reason: Option<&str>| {
                            closes
                                .lock()
                                .unwrap()
                                .push((code, reason.map(|value| value.to_string())));
                        },
                    ),
                });
            }),
            open_tcp_socket: None,
        };
        return Fake {
            host,
            sink,
            opened,
            sent,
            closes,
        };
    }

    fn dummy_sink() -> SocketEventSink {
        return SocketEventSink {
            handle_socket_open: Arc::new(|| {}),
            handle_socket_message: Arc::new(|_message: &SocketMessage| {}),
            handle_socket_close: Arc::new(|_info: &SocketCloseInfo| {}),
            handle_socket_error: Arc::new(|| {}),
        };
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

    fn runtime_of(socket: &Ref<Socket>) -> SocketRuntime {
        let current = socket.read().unwrap();
        return socket_runtime(&current).clone();
    }

    fn sink_of(fake: &Fake) -> SocketEventSink {
        let current = fake.sink.lock().unwrap();
        return current.as_ref().expect("host captured a sink").clone();
    }

    #[test]
    fn handle_socket_close_method_matches_handle_socket_close() {
        let codes = Arc::new(Mutex::new(Vec::new()));
        let recorder = codes.clone();
        let sink = SocketEventSink {
            handle_socket_open: Arc::new(|| {}),
            handle_socket_message: Arc::new(|_message: &SocketMessage| {}),
            handle_socket_close: Arc::new(move |info: &SocketCloseInfo| {
                recorder.lock().unwrap().push(info.code);
            }),
            handle_socket_error: Arc::new(|| {}),
        };
        let info = SocketCloseInfo {
            code: 1000,
            reason: "bye".to_string(),
            was_clean: true,
        };
        sink.handle_socket_close(&info);
        handle_socket_close(&sink, &info);
        assert_eq!(*codes.lock().unwrap(), vec![1000, 1000]);
    }

    #[test]
    fn handle_socket_error_method_matches_handle_socket_error() {
        let errors = Arc::new(Mutex::new(0));
        let counter = errors.clone();
        let sink = SocketEventSink {
            handle_socket_open: Arc::new(|| {}),
            handle_socket_message: Arc::new(|_message: &SocketMessage| {}),
            handle_socket_close: Arc::new(|_info: &SocketCloseInfo| {}),
            handle_socket_error: Arc::new(move || {
                *counter.lock().unwrap() += 1;
            }),
        };
        sink.handle_socket_error();
        handle_socket_error(&sink);
        assert_eq!(*errors.lock().unwrap(), 2);
    }

    #[test]
    fn handle_socket_message_method_matches_handle_socket_message() {
        let messages = Arc::new(Mutex::new(Vec::new()));
        let recorder = messages.clone();
        let sink = SocketEventSink {
            handle_socket_open: Arc::new(|| {}),
            handle_socket_message: Arc::new(move |message: &SocketMessage| {
                recorder.lock().unwrap().push(message.clone());
            }),
            handle_socket_close: Arc::new(|_info: &SocketCloseInfo| {}),
            handle_socket_error: Arc::new(|| {}),
        };
        let message = SocketMessage {
            data: SocketMessageData::Text("hi".to_string()),
            binary: false,
        };
        sink.handle_socket_message(&message);
        handle_socket_message(&sink, &message);
        assert_eq!(
            *messages.lock().unwrap(),
            vec![message.clone(), message.clone()]
        );
    }

    #[test]
    fn handle_socket_open_method_matches_handle_socket_open() {
        let opens = Arc::new(Mutex::new(0));
        let counter = opens.clone();
        let sink = SocketEventSink {
            handle_socket_open: Arc::new(move || {
                *counter.lock().unwrap() += 1;
            }),
            handle_socket_message: Arc::new(|_message: &SocketMessage| {}),
            handle_socket_close: Arc::new(|_info: &SocketCloseInfo| {}),
            handle_socket_error: Arc::new(|| {}),
        };
        sink.handle_socket_open();
        handle_socket_open(&sink);
        assert_eq!(*opens.lock().unwrap(), 2);
    }

    #[test]
    fn attach_method_matches_attach_socket() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        detach_socket(&method_socket);
        detach_socket(&free_socket);
        method_socket.attach();
        attach_socket(&free_socket);
        assert_eq!(
            runtime_of(&method_socket).delivering,
            runtime_of(&free_socket).delivering
        );
    }

    #[test]
    fn close_method_matches_close_socket() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        method_socket.close(&guard, Some(1000), Some("bye"));
        close_socket(&guard, &free_socket, Some(1000), Some("bye"));
        assert_eq!(
            get_socket_ready_state(&method_socket),
            get_socket_ready_state(&free_socket)
        );
        assert_eq!(
            *method_fake.closes.lock().unwrap(),
            *free_fake.closes.lock().unwrap()
        );
    }

    #[test]
    fn close_socket_connection_method_matches_close_socket_connection() {
        let method_closes = Arc::new(Mutex::new(Vec::new()));
        let free_closes = Arc::new(Mutex::new(Vec::new()));
        let method_recorder = method_closes.clone();
        let free_recorder = free_closes.clone();
        let connection = SocketConnection {
            send_socket_frame: Arc::new(|_data: &SocketMessageData| true),
            close_socket_connection: Arc::new(move |code: Option<i32>, reason: Option<&str>| {
                method_recorder
                    .lock()
                    .unwrap()
                    .push((code, reason.map(|value| value.to_string())));
            }),
        };
        let free_connection = SocketConnection {
            send_socket_frame: Arc::new(|_data: &SocketMessageData| true),
            close_socket_connection: Arc::new(move |code: Option<i32>, reason: Option<&str>| {
                free_recorder
                    .lock()
                    .unwrap()
                    .push((code, reason.map(|value| value.to_string())));
            }),
        };
        connection.close_socket_connection(Some(1001), Some("bye"));
        close_socket_connection(&free_connection, Some(1001), Some("bye"));
        assert_eq!(*method_closes.lock().unwrap(), *free_closes.lock().unwrap());
    }

    #[test]
    fn close_tcp_socket_connection_method_matches_close_tcp_socket_connection() {
        let method_count = Arc::new(Mutex::new(0));
        let free_count = Arc::new(Mutex::new(0));
        let method_counter = method_count.clone();
        let free_counter = free_count.clone();
        let connection = TcpSocketConnection {
            readable: create_readable_stream(Box::new(futures::io::empty())),
            writable: create_writable_stream(Box::new(futures::io::sink())),
            close_tcp_socket_connection: Arc::new(move || {
                *method_counter.lock().unwrap() += 1;
            }),
        };
        let free_connection = TcpSocketConnection {
            readable: create_readable_stream(Box::new(futures::io::empty())),
            writable: create_writable_stream(Box::new(futures::io::sink())),
            close_tcp_socket_connection: Arc::new(move || {
                *free_counter.lock().unwrap() += 1;
            }),
        };
        connection.close_tcp_socket_connection();
        close_tcp_socket_connection(&free_connection);
        assert_eq!(*method_count.lock().unwrap(), *free_count.lock().unwrap());
    }

    #[test]
    fn detach_method_matches_detach_socket() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        method_socket.detach();
        detach_socket(&free_socket);
        assert_eq!(
            runtime_of(&method_socket).delivering,
            runtime_of(&free_socket).delivering
        );
    }

    #[test]
    fn dispose_method_matches_dispose_socket() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        (sink_of(&method_fake).handle_socket_open)();
        (sink_of(&free_fake).handle_socket_open)();
        method_socket.dispose();
        dispose_socket(&free_socket);
        assert_eq!(
            runtime_of(&method_socket).disposed,
            runtime_of(&free_socket).disposed
        );
        assert_eq!(
            get_socket_ready_state(&method_socket),
            get_socket_ready_state(&free_socket)
        );
        assert_eq!(
            *method_fake.closes.lock().unwrap(),
            *free_fake.closes.lock().unwrap()
        );
    }

    #[test]
    fn enable_signals_method_matches_enable_socket_signals() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        let method_signals = method_socket.enable_signals(&guard);
        let free_signals = enable_socket_signals(&guard, &free_socket);
        assert!(Arc::ptr_eq(
            &method_signals,
            &method_socket.enable_signals(&guard)
        ));
        assert!(Arc::ptr_eq(
            &free_signals,
            &enable_socket_signals(&guard, &free_socket)
        ));
    }

    #[test]
    fn explain_send_failure_method_matches_explain_socket_send_failure() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        assert_eq!(
            method_socket.explain_send_failure(),
            explain_socket_send_failure(&free_socket)
        );
    }

    #[test]
    fn get_ready_state_method_matches_get_socket_ready_state() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        (sink_of(&method_fake).handle_socket_open)();
        (sink_of(&free_fake).handle_socket_open)();
        assert_eq!(
            method_socket.get_ready_state(),
            get_socket_ready_state(&free_socket)
        );
    }

    #[test]
    fn new_matches_create_socket() {
        let method_fake = fake(false, true);
        let free_fake = fake(false, true);
        let guard = guard_state();
        let method_socket = Socket::new(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        assert_eq!(
            method_socket.read().unwrap().url,
            free_socket.read().unwrap().url
        );
        assert_eq!(
            get_socket_ready_state(&method_socket),
            get_socket_ready_state(&free_socket)
        );
        assert_eq!(
            *method_fake.opened.lock().unwrap(),
            *free_fake.opened.lock().unwrap()
        );
    }

    #[test]
    fn open_socket_method_matches_open_socket() {
        let fake = fake(false, true);
        let sink = dummy_sink();
        let via_method = fake.host.open_socket(&options("ws://x"), &sink);
        let via_free = open_socket(&fake.host, &options("ws://x"), &sink);
        assert_eq!(via_method.is_some(), via_free.is_some());
        assert_eq!(
            *fake.opened.lock().unwrap(),
            vec!["ws://x".to_string(), "ws://x".to_string()]
        );
    }

    #[test]
    fn open_tcp_socket_method_matches_open_tcp_socket() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let seen_for_host = seen.clone();
        let host = HostSocketCapability {
            provider: Arc::new(()),
            open_socket: Arc::new(|_options, _events| None),
            open_tcp_socket: Some(Arc::new(move |options: &TcpSocketOptions| {
                seen_for_host
                    .lock()
                    .unwrap()
                    .push((options.host.clone(), options.port));
                return Some(TcpSocketConnection {
                    readable: create_readable_stream(Box::new(futures::io::empty())),
                    writable: create_writable_stream(Box::new(futures::io::sink())),
                    close_tcp_socket_connection: Arc::new(|| {}),
                });
            })),
        };
        let options = TcpSocketOptions {
            host: "db.internal".to_string(),
            port: 5432,
        };
        let via_method = host.open_tcp_socket(&options);
        let via_free = open_tcp_socket(Some(&host), &options);
        assert_eq!(via_method.is_some(), via_free.is_some());
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                ("db.internal".to_string(), 5432),
                ("db.internal".to_string(), 5432)
            ]
        );
    }

    #[test]
    fn send_message_method_matches_send_socket_message() {
        let method_fake = fake(false, false);
        let free_fake = fake(false, false);
        let guard = guard_state();
        let method_socket = create_socket(&guard, Some(&method_fake.host), &options("ws://x"));
        let free_socket = create_socket(&guard, Some(&free_fake.host), &options("ws://x"));
        (sink_of(&method_fake).handle_socket_open)();
        (sink_of(&free_fake).handle_socket_open)();
        let data = SocketMessageData::Text("ping".to_string());
        let method_result = method_socket.send_message(&guard, &data);
        let free_result = send_socket_message(&guard, &free_socket, &data);
        assert_eq!(method_result, free_result);
        assert_eq!(
            *method_fake.sent.lock().unwrap(),
            *free_fake.sent.lock().unwrap()
        );
    }

    #[test]
    fn send_socket_frame_method_matches_send_socket_frame() {
        let sent = Arc::new(Mutex::new(Vec::new()));
        let recorder = sent.clone();
        let connection = SocketConnection {
            send_socket_frame: Arc::new(move |data: &SocketMessageData| {
                recorder.lock().unwrap().push(data.clone());
                return true;
            }),
            close_socket_connection: Arc::new(|_code: Option<i32>, _reason: Option<&str>| {}),
        };
        let data = SocketMessageData::Text("ping".to_string());
        assert_eq!(
            connection.send_socket_frame(&data),
            send_socket_frame(&connection, &data)
        );
        assert_eq!(sent.lock().unwrap().len(), 2);
    }
}

// ============================================================================
// D18 sugar: capability and connection methods delegate to the free functions
// ============================================================================

impl HostSocketCapability {
    pub fn open_socket(
        &self,
        options: &SocketOptions,
        events: &SocketEventSink,
    ) -> Option<SocketConnection> {
        return open_socket(self, options, events);
    }

    pub fn open_tcp_socket(&self, options: &TcpSocketOptions) -> Option<TcpSocketConnection> {
        return open_tcp_socket(Some(self), options);
    }
}

impl SocketEventSink {
    pub fn handle_socket_close(&self, info: &SocketCloseInfo) {
        return handle_socket_close(self, info);
    }

    pub fn handle_socket_error(&self) {
        return handle_socket_error(self);
    }

    pub fn handle_socket_message(&self, message: &SocketMessage) {
        return handle_socket_message(self, message);
    }

    pub fn handle_socket_open(&self) {
        return handle_socket_open(self);
    }
}

/// The convenience constructor mirrors `create_socket` (D18).
impl Socket {
    pub fn new(
        guard_state: &SocketGuardStateRef,
        host_socket: Option<&HostSocketCapability>,
        options: &SocketOptions,
    ) -> Ref<Socket> {
        return create_socket(guard_state, host_socket, options);
    }
}

impl SocketConnection {
    pub fn close_socket_connection(&self, code: Option<i32>, reason: Option<&str>) {
        return close_socket_connection(self, code, reason);
    }

    pub fn send_socket_frame(&self, data: &SocketMessageData) -> bool {
        return send_socket_frame(self, data);
    }
}

impl TcpSocketConnection {
    pub fn close_tcp_socket_connection(&self) {
        return close_tcp_socket_connection(self);
    }
}

/// Sugar for the shared socket entity. The socket lives behind `Ref` identity, so the lifecycle
/// methods mirror the public functions on that handle; the caller-owned guard state stays explicit
/// on every method that can emit a notice.
pub trait SocketMethods {
    fn attach(&self);
    fn close(&self, guard_state: &SocketGuardStateRef, code: Option<i32>, reason: Option<&str>);
    fn detach(&self);
    fn dispose(&self);
    fn enable_signals(&self, guard_state: &SocketGuardStateRef) -> Ref<SocketSignals>;
    fn explain_send_failure(&self) -> Option<SocketSendFailureExplanation>;
    fn get_ready_state(&self) -> SocketReadyState;
    fn send_message(&self, guard_state: &SocketGuardStateRef, data: &SocketMessageData) -> bool;
}

impl SocketMethods for Ref<Socket> {
    fn attach(&self) {
        return attach_socket(self);
    }

    fn close(&self, guard_state: &SocketGuardStateRef, code: Option<i32>, reason: Option<&str>) {
        return close_socket(guard_state, self, code, reason);
    }

    fn detach(&self) {
        return detach_socket(self);
    }

    fn dispose(&self) {
        return dispose_socket(self);
    }

    fn enable_signals(&self, guard_state: &SocketGuardStateRef) -> Ref<SocketSignals> {
        return enable_socket_signals(guard_state, self);
    }

    fn explain_send_failure(&self) -> Option<SocketSendFailureExplanation> {
        return explain_socket_send_failure(self);
    }

    fn get_ready_state(&self) -> SocketReadyState {
        return get_socket_ready_state(self);
    }

    fn send_message(&self, guard_state: &SocketGuardStateRef, data: &SocketMessageData) -> bool {
        return send_socket_message(guard_state, self, data);
    }
}
