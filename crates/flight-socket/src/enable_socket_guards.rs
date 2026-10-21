//! The opt-in socket misuse guard (TS `enableSocketGuards.ts`). Installing it adds warnings for
//! unsupported creation and commands issued after terminal disposal; the core module stays silent
//! unless a guard is installed.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::types::*;

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
