//! The opt-in socket misuse guard (TS `enableSocketGuards.ts`). Installing it adds warnings for
//! unsupported creation and commands issued after terminal disposal; the core module stays silent
//! unless a guard is installed.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::RwLock;

    use flight_log::{
        LogEntry, add_log_sink, create_log_state, create_memory_log_sink,
        get_memory_log_sink_entries, remove_log_sink,
    };

    use super::*;
    use crate::socket::create_socket;

    fn capture_log(log: &LogStateRef, run: impl FnOnce()) -> Vec<LogEntry> {
        let sink = create_memory_log_sink(8);
        add_log_sink(log, sink.sink.clone());
        run();
        remove_log_sink(log, &sink.sink);
        return get_memory_log_sink_entries(&sink);
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

    fn options(url: &str) -> crate::types::SocketOptions {
        return crate::types::SocketOptions {
            url: url.to_string(),
            protocols: None,
            binary_type: None,
        };
    }

    #[test]
    fn are_guards_enabled_method_matches_are_socket_guards_enabled() {
        let state = guard_state();
        assert_eq!(
            state.are_guards_enabled(),
            are_socket_guards_enabled(&state)
        );
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> = Arc::new(|| 1.0);
        enable_socket_guards(&state, &log_state(), clock);
        assert_eq!(
            state.are_guards_enabled(),
            are_socket_guards_enabled(&state)
        );
    }

    #[test]
    fn disable_guards_method_matches_disable_socket_guards() {
        let method_state = guard_state();
        let free_state = guard_state();
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> = Arc::new(|| 1.0);
        enable_socket_guards(&method_state, &log_state(), clock.clone());
        enable_socket_guards(&free_state, &log_state(), clock);
        method_state.disable_guards();
        disable_socket_guards(&free_state);
        assert_eq!(
            method_state.are_guards_enabled(),
            are_socket_guards_enabled(&free_state)
        );
        assert!(method_state.read().unwrap().guard.is_none());
        assert!(free_state.read().unwrap().guard.is_none());
    }

    #[test]
    fn enable_guards_method_matches_enable_socket_guards() {
        let method_state = guard_state();
        let free_state = guard_state();
        let method_log = log_state();
        let free_log = log_state();
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> = Arc::new(|| 5.0);
        method_state.enable_guards(&method_log, clock.clone());
        enable_socket_guards(&free_state, &free_log, clock);
        let method_entries = capture_log(&method_log, || {
            create_socket(&method_state, None, &options("ws://x"));
        });
        let free_entries = capture_log(&free_log, || {
            create_socket(&free_state, None, &options("ws://x"));
        });
        assert_eq!(method_entries.len(), free_entries.len());
        assert_eq!(
            field(&method_entries[0], "message"),
            field(&free_entries[0], "message")
        );
        assert_eq!(
            field(&method_entries[0], "url"),
            field(&free_entries[0], "url")
        );
        assert_eq!(method_entries[0].timestamp_ms, free_entries[0].timestamp_ms);
    }
}

/// Reports whether the caller-owned guard state has the guard enabled (TS
/// `areSocketGuardsEnabled`).
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState replaces the source module-level enabled flag
pub fn are_socket_guards_enabled(guard_state: &SocketGuardStateRef) -> bool {
    let current = guard_state.read().unwrap();
    return current.enabled;
}

/// Uninstalls the guard and clears the enabled flag (TS `disableSocketGuards`).
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState replaces the source module-level guard hook
pub fn disable_socket_guards(guard_state: &SocketGuardStateRef) {
    let mut current = guard_state.write().unwrap();
    current.guard = None;
    current.enabled = false;
}

/// Installs opt-in warnings for unsupported socket creation and commands issued after terminal
/// disposal (TS `enableSocketGuards`). The adapter captures the caller-owned log state and the live
/// clock at enable time and samples that clock at each notice, so timestamps are operation time,
/// not enable time.
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState, log state and clock replace the source module glue
pub fn enable_socket_guards(
    guard_state: &SocketGuardStateRef,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: SocketGuard = Arc::new(move |notice: &SocketGuardNotice| {
        warn_on_socket_misuse(&log_state, clock(), notice);
    });
    let mut current = guard_state.write().unwrap();
    current.guard = Some(guard);
    current.enabled = true;
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_socket_misuse(log_state: &LogStateRef, now_ms: f64, notice: &SocketGuardNotice) {
    let operation = get_socket_guard_operation_string(notice.operation);
    let reason = get_socket_guard_reason_string(notice.reason);
    let url = {
        let current = notice.socket.read().unwrap();
        current.url.clone()
    };
    let message = if notice.reason == SocketGuardReason::NoConnection {
        "createSocket: the host carries no socket capability for this transport, or the capability returned no connection — pass a host whose net.socket supports it".to_string()
    } else {
        format!(
            "{}: socket is already disposed — call createSocket(...) to create a new socket",
            operation
        )
    };
    let mut data = HashMap::new();
    data.insert("message".to_string(), LogValue::Str(message));
    data.insert(
        "operation".to_string(),
        LogValue::Str(operation.to_string()),
    );
    data.insert("reason".to_string(), LogValue::Str(reason.to_string()));
    data.insert("url".to_string(), LogValue::Str(url));
    let key = format!("socket:{}:{}", operation, reason);
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("socket".to_string()),
    );
}

// ============================================================================
// D18 sugar: methods on the shared guard-state handle delegate to the free functions
// ============================================================================

/// Sugar for the caller-owned socket guard state. The state is shared through `Ref` identity, so
/// the guard lifecycle methods mirror the public functions on that handle; the log state and live
/// clock stay explicit on `enable_guards`.
pub trait SocketGuardStateMethods {
    fn are_guards_enabled(&self) -> bool;
    fn disable_guards(&self);
    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
    fn enable_guards(&self, log_state: &LogStateRef, clock: Arc<dyn Fn() -> f64 + Send + Sync>);
}

impl SocketGuardStateMethods for SocketGuardStateRef {
    fn are_guards_enabled(&self) -> bool {
        return are_socket_guards_enabled(self);
    }

    fn disable_guards(&self) {
        return disable_socket_guards(self);
    }

    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
    fn enable_guards(&self, log_state: &LogStateRef, clock: Arc<dyn Fn() -> f64 + Send + Sync>) {
        return enable_socket_guards(self, log_state, clock);
    }
}
