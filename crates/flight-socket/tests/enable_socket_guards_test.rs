use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries, remove_log_sink,
};
use flight_socket::contract::*;

fn backend_with_connection() -> HostSocketCapability {
    return HostSocketCapability {
        provider: Arc::new(()),
        open_socket: Arc::new(|_options: &SocketOptions, _events: &SocketEventSink| {
            return Some(SocketConnection {
                send_socket_frame: Arc::new(|_data: &SocketMessageData| true),
                close_socket_connection: Arc::new(|_code: Option<i32>, _reason: Option<&str>| {}),
            });
        }),
        open_tcp_socket: None,
    };
}

fn backend_without_connection() -> HostSocketCapability {
    return HostSocketCapability {
        provider: Arc::new(()),
        open_socket: Arc::new(|_options: &SocketOptions, _events: &SocketEventSink| None),
        open_tcp_socket: None,
    };
}

fn capture_log(log: &LogStateRef, run: impl FnOnce()) -> Vec<LogEntry> {
    let sink = create_memory_log_sink(8);
    add_log_sink(log, sink.sink.clone());
    run();
    remove_log_sink(log, &sink.sink);
    return {
        let mut collected = Vec::new();
        get_memory_log_sink_entries(&mut collected, &sink);
        collected
    };
}

fn clock() -> (Arc<AtomicU64>, Arc<dyn Fn() -> f64 + Send + Sync>) {
    let ticks = Arc::new(AtomicU64::new(0));
    let clock_ticks = ticks.clone();
    let clock: Arc<dyn Fn() -> f64 + Send + Sync> = Arc::new(move || {
        return clock_ticks.fetch_add(10, Ordering::SeqCst) as f64;
    });
    return (ticks, clock);
}

fn field(entry: &LogEntry, key: &str) -> String {
    return match &entry.data {
        LogData::Record(record) => match record.get(key) {
            Some(LogValue::Str(value)) => value.clone(),
            _ => String::new(),
        },
        LogData::Message(message) => message.clone(),
    };
}

fn guard_state() -> SocketGuardStateRef {
    return Arc::new(RwLock::new(SocketGuardState {
        guard: None,
        enabled: false,
    }));
}

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn operations(entries: &[LogEntry]) -> Vec<String> {
    let mut out = Vec::new();
    for entry in entries {
        out.push(field(entry, "operation"));
    }
    return out;
}

fn options(url: &str) -> SocketOptions {
    return SocketOptions {
        url: url.to_string(),
        protocols: None,
        binary_type: None,
    };
}

mod are_socket_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_the_global_guard_hook_is_installed() {
        let state = guard_state();
        let log = log_state();
        let (_ticks, clock) = clock();
        enable_socket_guards(&state, &log, clock);
        assert!(are_socket_guards_enabled(&state));
        disable_socket_guards(&state);
        assert!(!are_socket_guards_enabled(&state));
    }
}

mod disable_socket_guards {
    use super::*;

    #[test]
    fn restores_silent_core_behavior() {
        let state = guard_state();
        let log = log_state();
        let (_ticks, clock) = clock();
        enable_socket_guards(&state, &log, clock);
        disable_socket_guards(&state);
        let backend = backend_without_connection();
        let entries = capture_log(&log, || {
            create_socket(&state, Some(&backend), &options("tcp://silent"));
        });
        assert!(entries.is_empty());
    }
}

mod enable_socket_guards {
    use super::*;

    #[test]
    fn samples_the_clock_at_operation_time_not_enable_time() {
        let state = guard_state();
        let log = log_state();
        let (ticks, clock) = clock();
        enable_socket_guards(&state, &log, clock);
        let backend = backend_with_connection();
        let socket = create_socket(&state, Some(&backend), &options("ws://clock"));
        dispose_socket(&socket);
        let entries = capture_log(&log, || {
            close_socket(&state, &socket, None, None);
            send_socket_message(
                &state,
                &socket,
                &SocketMessageData::Text("frame".to_string()),
            );
        });
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].timestamp_ms, 0.0);
        assert_eq!(entries[1].timestamp_ms, 10.0);
        assert_eq!(ticks.load(Ordering::SeqCst), 20);
    }

    #[test]
    fn stays_silent_for_ordinary_pre_open_sends_and_closes() {
        let state = guard_state();
        let log = log_state();
        let (_ticks, clock) = clock();
        enable_socket_guards(&state, &log, clock);
        let backend = backend_with_connection();
        let socket = create_socket(&state, Some(&backend), &options("ws://connecting"));
        let entries = capture_log(&log, || {
            send_socket_message(
                &state,
                &socket,
                &SocketMessageData::Text("early".to_string()),
            );
            close_socket(&state, &socket, None, None);
        });
        assert!(entries.is_empty());
    }

    #[test]
    fn warns_once_per_command_issued_after_terminal_disposal() {
        let state = guard_state();
        let log = log_state();
        let (_ticks, clock) = clock();
        enable_socket_guards(&state, &log, clock);
        let backend = backend_with_connection();
        let socket = create_socket(&state, Some(&backend), &options("ws://disposed"));
        dispose_socket(&socket);
        let entries = capture_log(&log, || {
            close_socket(&state, &socket, None, None);
            close_socket(&state, &socket, None, None);
            send_socket_message(
                &state,
                &socket,
                &SocketMessageData::Text("frame".to_string()),
            );
            enable_socket_signals(&state, &socket);
        });
        assert_eq!(entries.len(), 3);
        assert_eq!(
            operations(&entries),
            vec!["closeSocket", "sendSocketMessage", "enableSocketSignals"]
        );
        for entry in &entries {
            assert_eq!(entry.level, LogLevel::Warn);
            assert_eq!(entry.channel.as_deref(), Some("socket"));
            assert_eq!(field(entry, "reason"), "disposed");
            assert_eq!(field(entry, "url"), "ws://disposed");
            assert!(field(entry, "message").contains("createSocket"));
        }
    }

    #[test]
    fn warns_once_when_socket_creation_produces_no_connection() {
        let state = guard_state();
        let log = log_state();
        let (_ticks, clock) = clock();
        enable_socket_guards(&state, &log, clock);
        let backend = backend_without_connection();
        let entries = capture_log(&log, || {
            create_socket(&state, Some(&backend), &options("tcp://unsupported"));
            create_socket(&state, Some(&backend), &options("tcp://unsupported-again"));
        });
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel.as_deref(), Some("socket"));
        assert_eq!(field(&entries[0], "operation"), "createSocket");
        assert_eq!(field(&entries[0], "reason"), "no-connection");
        assert_eq!(field(&entries[0], "url"), "tcp://unsupported");
        assert!(field(&entries[0], "message").contains("net.socket"));
    }
}
