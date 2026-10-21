use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::connect_signal;
use flight_socket::contract::*;
use flight_stream::{create_readable_stream, create_writable_stream};

struct FakeSocket {
    backend: HostSocketCapability,
    sink: Arc<Mutex<Option<SocketEventSink>>>,
    opened: Arc<Mutex<Vec<String>>>,
    sent: Arc<Mutex<Vec<SocketMessageData>>>,
    sent_ptrs: Arc<Mutex<Vec<usize>>>,
    closes: Arc<Mutex<Vec<(Option<i32>, Option<String>)>>>,
    last_options: Arc<Mutex<Option<SocketOptions>>>,
}

fn fake_socket(open_returns_null: bool, send_returns: bool) -> FakeSocket {
    let sink = Arc::new(Mutex::new(None));
    let opened = Arc::new(Mutex::new(Vec::new()));
    let sent = Arc::new(Mutex::new(Vec::new()));
    let sent_ptrs = Arc::new(Mutex::new(Vec::new()));
    let closes = Arc::new(Mutex::new(Vec::new()));
    let last_options = Arc::new(Mutex::new(None));
    let sink_for_backend = sink.clone();
    let opened_for_backend = opened.clone();
    let sent_for_backend = sent.clone();
    let sent_ptrs_for_backend = sent_ptrs.clone();
    let closes_for_backend = closes.clone();
    let last_options_for_backend = last_options.clone();
    let backend = HostSocketCapability {
        provider: Arc::new(()),
        open_socket: Arc::new(move |options: &SocketOptions, events: &SocketEventSink| {
            *sink_for_backend.lock().unwrap() = Some(events.clone());
            *last_options_for_backend.lock().unwrap() = Some(options.clone());
            opened_for_backend.lock().unwrap().push(options.url.clone());
            if open_returns_null {
                return None;
            }
            let sent = sent_for_backend.clone();
            let sent_ptrs = sent_ptrs_for_backend.clone();
            let closes = closes_for_backend.clone();
            return Some(SocketConnection {
                send_socket_frame: Arc::new(move |data: &SocketMessageData| {
                    sent.lock().unwrap().push(data.clone());
                    sent_ptrs
                        .lock()
                        .unwrap()
                        .push(data as *const SocketMessageData as usize);
                    return send_returns;
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
    return FakeSocket {
        backend,
        sink,
        opened,
        sent,
        sent_ptrs,
        closes,
        last_options,
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
    return flight_entity::get_entity_binding_as::<SocketRuntime, Socket>(&current)
        .expect("socket runtime is attached")
        .clone();
}

fn sink_of(fake: &FakeSocket) -> SocketEventSink {
    let guard = fake.sink.lock().unwrap();
    return guard.as_ref().expect("backend captured a sink").clone();
}

mod attach_socket {
    use super::*;

    #[test]
    fn resumes_delivery_after_a_detach() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let signals = enable_socket_signals(&guard, &socket);
        let opens = Arc::new(Mutex::new(0));
        let counter = opens.clone();
        let signal = signals.read().unwrap().on_socket_open.clone();
        connect_signal(
            &signal,
            Arc::new(move |_args: &()| *counter.lock().unwrap() += 1),
            None,
        );
        detach_socket(&socket);
        attach_socket(&socket);
        (sink_of(&fake).handle_socket_open)();
        assert_eq!(*opens.lock().unwrap(), 1);
    }

    #[test]
    fn cannot_resume_delivery_after_terminal_disposal() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let signals = enable_socket_signals(&guard, &socket);
        let opens = Arc::new(Mutex::new(0));
        let counter = opens.clone();
        let signal = signals.read().unwrap().on_socket_open.clone();
        connect_signal(
            &signal,
            Arc::new(move |_args: &()| *counter.lock().unwrap() += 1),
            None,
        );
        dispose_socket(&socket);
        attach_socket(&socket);
        (sink_of(&fake).handle_socket_open)();
        assert_eq!(*opens.lock().unwrap(), 0);
        assert!(!runtime_of(&socket).delivering);
    }
}

mod close_socket {
    use super::*;

    #[test]
    fn transitions_to_closing_and_forwards_code_and_reason() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        (sink_of(&fake).handle_socket_open)();
        close_socket(&guard, &socket, Some(1000), Some("bye"));
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closing);
        assert_eq!(
            *fake.closes.lock().unwrap(),
            vec![(Some(1000), Some("bye".to_string()))]
        );
    }

    #[test]
    fn reaches_closed_once_the_backend_close_event_arrives() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let sink = sink_of(&fake);
        (sink.handle_socket_open)();
        close_socket(&guard, &socket, None, None);
        (sink.handle_socket_close)(&SocketCloseInfo {
            code: 1000,
            reason: String::new(),
            was_clean: true,
        });
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closed);
    }

    #[test]
    fn is_a_no_op_when_already_closed() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let sink = sink_of(&fake);
        (sink.handle_socket_open)();
        close_socket(&guard, &socket, None, None);
        (sink.handle_socket_close)(&SocketCloseInfo {
            code: 1000,
            reason: String::new(),
            was_clean: true,
        });
        close_socket(&guard, &socket, None, None);
        assert_eq!(fake.closes.lock().unwrap().len(), 1);
    }

    #[test]
    fn stays_closed_and_does_not_close_the_connection_again_after_disposal() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        dispose_socket(&socket);
        close_socket(&guard, &socket, None, None);
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closed);
        assert_eq!(fake.closes.lock().unwrap().len(), 1);
    }
}

mod create_socket {
    use super::*;

    #[test]
    fn opens_through_the_backend_in_the_connecting_state_and_records_the_url() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://host/path"));
        assert_eq!(socket.read().unwrap().url, "ws://host/path");
        assert_eq!(
            get_socket_ready_state(&socket),
            SocketReadyState::Connecting
        );
        assert_eq!(
            fake.last_options.lock().unwrap().as_ref().unwrap().url,
            "ws://host/path"
        );
    }

    #[test]
    fn passes_protocols_and_binary_type_through_to_the_backend() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        create_socket(
            &guard,
            Some(&fake.backend),
            &SocketOptions {
                url: "ws://x".to_string(),
                protocols: Some(vec!["a".to_string(), "b".to_string()]),
                binary_type: Some(SocketBinaryType::ArrayBuffer),
            },
        );
        let last = fake.last_options.lock().unwrap();
        let recorded = last.as_ref().unwrap();
        assert_eq!(
            recorded.protocols,
            Some(vec!["a".to_string(), "b".to_string()])
        );
        assert_eq!(recorded.binary_type, Some(SocketBinaryType::ArrayBuffer));
    }

    #[test]
    fn tolerates_a_null_connection_from_an_unsupported_transport() {
        let fake = fake_socket(true, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("tcp://x"));
        assert_eq!(
            get_socket_ready_state(&socket),
            SocketReadyState::Connecting
        );
        assert!(runtime_of(&socket).connection.is_none());
        assert!(!send_socket_message(
            &guard,
            &socket,
            &SocketMessageData::Text("x".to_string())
        ));
    }

    #[test]
    fn emits_text_and_binary_messages_with_the_source_flag_and_payload_identity() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let signals = enable_socket_signals(&guard, &socket);
        let received = Arc::new(Mutex::new(Vec::new()));
        let pointers = Arc::new(Mutex::new(Vec::new()));
        let received_out = received.clone();
        let pointers_out = pointers.clone();
        let signal = signals.read().unwrap().on_socket_message.clone();
        connect_signal(
            &signal,
            Arc::new(move |message: &SocketMessage| {
                received_out.lock().unwrap().push(message.clone());
                pointers_out
                    .lock()
                    .unwrap()
                    .push(message as *const SocketMessage as usize);
            }),
            None,
        );
        let sink = sink_of(&fake);
        (sink.handle_socket_open)();
        let text_message = SocketMessage {
            data: SocketMessageData::Text("hi".to_string()),
            binary: false,
        };
        (sink.handle_socket_message)(&text_message);
        let binary_message = SocketMessage {
            data: SocketMessageData::Binary(vec![1u8, 2u8].into_boxed_slice()),
            binary: true,
        };
        (sink.handle_socket_message)(&binary_message);
        assert_eq!(
            *received.lock().unwrap(),
            vec![text_message.clone(), binary_message.clone()]
        );
        let pointers = pointers.lock().unwrap();
        assert_eq!(pointers[0], &text_message as *const SocketMessage as usize);
        assert_eq!(
            pointers[1],
            &binary_message as *const SocketMessage as usize
        );
    }

    #[test]
    fn emits_close_info_with_code_reason_and_was_clean() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let signals = enable_socket_signals(&guard, &socket);
        let infos = Arc::new(Mutex::new(Vec::new()));
        let infos_out = infos.clone();
        let signal = signals.read().unwrap().on_socket_close.clone();
        connect_signal(
            &signal,
            Arc::new(move |info: &SocketCloseInfo| infos_out.lock().unwrap().push(info.clone())),
            None,
        );
        (sink_of(&fake).handle_socket_close)(&SocketCloseInfo {
            code: 1006,
            reason: "gone".to_string(),
            was_clean: false,
        });
        assert_eq!(
            *infos.lock().unwrap(),
            vec![SocketCloseInfo {
                code: 1006,
                reason: "gone".to_string(),
                was_clean: false,
            }]
        );
    }

    #[test]
    fn emits_on_socket_error() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let signals = enable_socket_signals(&guard, &socket);
        let errors = Arc::new(Mutex::new(0));
        let counter = errors.clone();
        let signal = signals.read().unwrap().on_socket_error.clone();
        connect_signal(
            &signal,
            Arc::new(move |_args: &()| *counter.lock().unwrap() += 1),
            None,
        );
        (sink_of(&fake).handle_socket_error)();
        assert_eq!(*errors.lock().unwrap(), 1);
    }
}

mod detach_socket {
    use super::*;

    #[test]
    fn stops_backend_events_from_reaching_the_signals() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let signals = enable_socket_signals(&guard, &socket);
        let opens = Arc::new(Mutex::new(0));
        let counter = opens.clone();
        let signal = signals.read().unwrap().on_socket_open.clone();
        connect_signal(
            &signal,
            Arc::new(move |_args: &()| *counter.lock().unwrap() += 1),
            None,
        );
        detach_socket(&socket);
        (sink_of(&fake).handle_socket_open)();
        assert_eq!(*opens.lock().unwrap(), 0);
        assert_eq!(
            get_socket_ready_state(&socket),
            SocketReadyState::Connecting
        );
    }
}

mod dispose_socket {
    use super::*;

    #[test]
    fn closes_an_open_connection_and_detaches_so_later_events_fire_no_signal() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let signals = enable_socket_signals(&guard, &socket);
        let messages = Arc::new(Mutex::new(0));
        let counter = messages.clone();
        let signal = signals.read().unwrap().on_socket_message.clone();
        connect_signal(
            &signal,
            Arc::new(move |_message: &SocketMessage| *counter.lock().unwrap() += 1),
            None,
        );
        let sink = sink_of(&fake);
        (sink.handle_socket_open)();
        dispose_socket(&socket);
        assert_eq!(fake.closes.lock().unwrap().len(), 1);
        let runtime = runtime_of(&socket);
        assert!(runtime.connection.is_none());
        assert!(runtime.signals.is_none());
        assert!(runtime.disposed);
        assert!(!runtime.delivering);
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closed);
        (sink.handle_socket_message)(&SocketMessage {
            data: SocketMessageData::Text("x".to_string()),
            binary: false,
        });
        assert_eq!(*messages.lock().unwrap(), 0);
    }

    #[test]
    fn is_safe_to_call_on_a_fresh_socket() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        dispose_socket(&socket);
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closed);
        assert!(runtime_of(&socket).disposed);
    }
}

mod enable_socket_signals {
    use super::*;

    #[test]
    fn returns_the_same_group_on_repeated_calls() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        let first = enable_socket_signals(&guard, &socket);
        let second = enable_socket_signals(&guard, &socket);
        assert!(Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn leaves_a_bare_socket_without_signals() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        assert!(runtime_of(&socket).signals.is_none());
    }

    #[test]
    fn returns_an_inert_stable_group_without_reviving_a_disposed_socket() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        dispose_socket(&socket);
        let first = enable_socket_signals(&guard, &socket);
        let second = enable_socket_signals(&guard, &socket);
        assert!(Arc::ptr_eq(&first, &second));
        assert!(!runtime_of(&socket).delivering);
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closed);
    }
}

mod get_socket_ready_state {
    use super::*;

    #[test]
    fn reflects_connecting_open_closing_closed_transitions() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        assert_eq!(
            get_socket_ready_state(&socket),
            SocketReadyState::Connecting
        );
        let sink = sink_of(&fake);
        (sink.handle_socket_open)();
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Open);
        close_socket(&guard, &socket, None, None);
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closing);
        (sink.handle_socket_close)(&SocketCloseInfo {
            code: 1000,
            reason: String::new(),
            was_clean: true,
        });
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Closed);
    }
}

mod initialize_socket {
    use super::*;

    #[test]
    fn attaches_a_connecting_runtime_before_the_provider_runs() {
        let mut socket: Socket = allocate_entity();
        socket.url = "ws://x".to_string();
        initialize_socket(&mut socket);
        assert!(flight_entity::has_entity_runtime(&socket));
        let runtime = flight_entity::get_entity_binding_as::<SocketRuntime, Socket>(&socket)
            .expect("runtime is attached");
        assert_eq!(runtime.ready_state, SocketReadyState::Connecting);
        assert!(runtime.delivering);
        assert!(!runtime.disposed);
        assert!(runtime.connection.is_none());
        assert!(runtime.signals.is_none());
    }
}

mod open_tcp_socket {
    use super::*;

    fn tcp_options() -> TcpSocketOptions {
        return TcpSocketOptions {
            host: "localhost".to_string(),
            port: 9000,
        };
    }

    fn tcp_connection(close: Arc<dyn Fn() + Send + Sync>) -> TcpSocketConnection {
        return TcpSocketConnection {
            readable: create_readable_stream(Box::new(futures::io::empty())),
            writable: create_writable_stream(Box::new(futures::io::sink())),
            close_tcp_socket_connection: close,
        };
    }

    #[test]
    fn forwards_the_endpoint_unchanged_and_returns_the_backend_connection_by_identity() {
        let close: Arc<dyn Fn() + Send + Sync> = Arc::new(|| {});
        let close_for_backend = close.clone();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let seen_for_backend = seen.clone();
        let backend = HostSocketCapability {
            provider: Arc::new(()),
            open_socket: Arc::new(|_options, _events| None),
            open_tcp_socket: Some(Arc::new(move |options: &TcpSocketOptions| {
                seen_for_backend
                    .lock()
                    .unwrap()
                    .push((options.host.clone(), options.port));
                return Some(tcp_connection(close_for_backend.clone()));
            })),
        };
        let connection = open_tcp_socket(
            Some(&backend),
            &TcpSocketOptions {
                host: "db.internal".to_string(),
                port: 5432,
            },
        )
        .expect("the backend returns a connection");
        assert!(Arc::ptr_eq(&connection.close_tcp_socket_connection, &close));
        assert_eq!(
            *seen.lock().unwrap(),
            vec![("db.internal".to_string(), 5432)]
        );
    }

    #[test]
    fn returns_null_when_the_host_carries_no_socket_backend() {
        assert!(open_tcp_socket(None, &tcp_options()).is_none());
    }

    #[test]
    fn returns_null_for_a_framed_only_backend_without_attempting_framed_open_socket() {
        let opened = Arc::new(Mutex::new(0));
        let opened_for_backend = opened.clone();
        let backend = HostSocketCapability {
            provider: Arc::new(()),
            open_socket: Arc::new(move |_options, _events| {
                *opened_for_backend.lock().unwrap() += 1;
                return None;
            }),
            open_tcp_socket: None,
        };
        assert!(open_tcp_socket(Some(&backend), &tcp_options()).is_none());
        assert_eq!(*opened.lock().unwrap(), 0);
    }

    #[test]
    fn preserves_an_explicit_null_from_a_backend_that_cannot_open_the_endpoint() {
        let backend = HostSocketCapability {
            provider: Arc::new(()),
            open_socket: Arc::new(|_options, _events| None),
            open_tcp_socket: Some(Arc::new(|_options: &TcpSocketOptions| None)),
        };
        assert!(open_tcp_socket(Some(&backend), &tcp_options()).is_none());
    }
}

mod send_socket_message {
    use super::*;

    #[test]
    fn sends_through_the_connection_and_returns_true_when_open() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        (sink_of(&fake).handle_socket_open)();
        assert!(send_socket_message(
            &guard,
            &socket,
            &SocketMessageData::Text("ping".to_string())
        ));
        assert_eq!(
            *fake.sent.lock().unwrap(),
            vec![SocketMessageData::Text("ping".to_string())]
        );
    }

    #[test]
    fn returns_false_without_throwing_when_not_open() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        assert!(!send_socket_message(
            &guard,
            &socket,
            &SocketMessageData::Text("ping".to_string())
        ));
        assert!(fake.sent.lock().unwrap().is_empty());
    }

    #[test]
    fn returns_false_after_disposal_without_reaching_the_released_connection() {
        let fake = fake_socket(false, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        (sink_of(&fake).handle_socket_open)();
        dispose_socket(&socket);
        assert!(!send_socket_message(
            &guard,
            &socket,
            &SocketMessageData::Text("ping".to_string())
        ));
        assert!(fake.sent.lock().unwrap().is_empty());
    }

    #[test]
    fn returns_false_for_an_open_state_whose_backend_supplied_no_connection() {
        let fake = fake_socket(true, true);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("tcp://x"));
        (sink_of(&fake).handle_socket_open)();
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Open);
        assert!(!send_socket_message(
            &guard,
            &socket,
            &SocketMessageData::Text("ping".to_string())
        ));
    }

    #[test]
    fn forwards_binary_data_by_identity_and_propagates_false() {
        let fake = fake_socket(false, false);
        let guard = guard_state();
        let socket = create_socket(&guard, Some(&fake.backend), &options("ws://x"));
        (sink_of(&fake).handle_socket_open)();
        let frame = SocketMessageData::Binary(vec![1u8, 2u8, 3u8].into_boxed_slice());
        assert!(!send_socket_message(&guard, &socket, &frame));
        assert_eq!(
            fake.sent.lock().unwrap()[0],
            SocketMessageData::Binary(vec![1u8, 2u8, 3u8].into_boxed_slice())
        );
        assert_eq!(
            fake.sent_ptrs.lock().unwrap()[0],
            &frame as *const SocketMessageData as usize
        );
        assert_eq!(get_socket_ready_state(&socket), SocketReadyState::Open);
    }
}

mod set_socket_guard {
    use super::*;

    #[test]
    fn installs_and_removes_the_core_notice_hook() {
        let guard = guard_state();
        let notices = Arc::new(Mutex::new(Vec::new()));
        let notices_out = notices.clone();
        set_socket_guard(
            &guard,
            Some(Arc::new(move |notice: &SocketGuardNotice| {
                notices_out.lock().unwrap().push(format!(
                    "{}:{}",
                    get_socket_guard_operation_string(notice.operation),
                    get_socket_guard_reason_string(notice.reason)
                ));
            })),
        );
        let unsupported = fake_socket(true, true);
        create_socket(&guard, Some(&unsupported.backend), &options("tcp://x"));

        let supported = fake_socket(false, true);
        let socket = create_socket(&guard, Some(&supported.backend), &options("ws://x"));
        dispose_socket(&socket);
        close_socket(&guard, &socket, None, None);
        send_socket_message(&guard, &socket, &SocketMessageData::Text("x".to_string()));
        enable_socket_signals(&guard, &socket);
        set_socket_guard(&guard, None);
        close_socket(&guard, &socket, None, None);

        assert_eq!(
            *notices.lock().unwrap(),
            vec![
                "createSocket:no-connection",
                "closeSocket:disposed",
                "sendSocketMessage:disposed",
                "enableSocketSignals:disposed",
            ]
        );
    }
}
