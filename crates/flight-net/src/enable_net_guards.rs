use crate::enums::{get_net_guard_operation_string, get_net_guard_reason_string};
use crate::net::set_net_guard;
use crate::{NetClock, NetGuardOperation, NetGuardReason, NetState};
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use std::collections::HashMap;
use std::sync::Arc;

#[cfg(test)]
mod message_tests {
    use super::*;

    #[test]
    fn retains_all_three_source_guidance_strings_and_normalizes_only_displayed_method() {
        assert_eq!(
            format_net_guard_message("gEt", NetGuardReason::BodyOnGetOrHead),
            "sendNetRequest: GET requests do not carry a body — remove request.body or use a body-bearing method"
        );
        assert_eq!(
            format_net_guard_message("HEAD", NetGuardReason::NegativeTimeout),
            "sendNetRequest: timeoutMs is negative, so the capability cannot schedule a timeout — pass zero or a positive duration"
        );
        assert_eq!(
            format_net_guard_message("vendor", NetGuardReason::ProgressNotEmitted),
            "sendNetRequest: the capability completed successfully without emitting the supplied progress signal — use a capability that supports download progress"
        );
    }

    #[test]
    fn logs_exact_metadata_once_per_reason_and_reads_the_live_operation_clock() {
        use flight_log::{
            add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
        };
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::{Arc, RwLock};
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        let now = Arc::new(AtomicU32::new(10));
        let clock_now = now.clone();
        let clock: NetClock = Arc::new(move || f64::from(clock_now.load(Ordering::SeqCst)));
        warn_on_net_misuse(
            &log,
            &clock,
            NetGuardOperation::SendNetRequest,
            NetGuardReason::BodyOnGetOrHead,
            "gEt",
            Some(-1.0),
            "u",
        );
        now.store(50, Ordering::SeqCst);
        warn_on_net_misuse(
            &log,
            &clock,
            NetGuardOperation::SendNetRequest,
            NetGuardReason::NegativeTimeout,
            "HEAD",
            Some(-2.0),
            "v",
        );
        warn_on_net_misuse(
            &log,
            &clock,
            NetGuardOperation::SendNetRequest,
            NetGuardReason::BodyOnGetOrHead,
            "HEAD",
            Some(-2.0),
            "v",
        );
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].timestamp_ms, 10.0);
        assert_eq!(entries[1].timestamp_ms, 50.0);
        assert_eq!(entries[0].channel.as_deref(), Some("net"));
        assert_eq!(entries[0].level, LogLevel::Warn);
        let LogData::Record(fields) = &entries[0].data else {
            panic!("guard metadata must remain a record");
        };
        assert!(matches!(fields.get("method"), Some(LogValue::Str(value)) if value == "gEt"));
        assert!(
            matches!(fields.get("operation"), Some(LogValue::Str(value)) if value == "sendNetRequest")
        );
        assert!(
            matches!(fields.get("reason"), Some(LogValue::Str(value)) if value == "body-on-get-or-head")
        );
        assert!(matches!(fields.get("timeoutMs"), Some(LogValue::Float(value)) if *value == -1.0));
        assert!(matches!(fields.get("url"), Some(LogValue::Str(value)) if value == "u"));
        assert!(
            matches!(fields.get("message"), Some(LogValue::Str(value)) if value == "sendNetRequest: GET requests do not carry a body — remove request.body or use a body-bearing method")
        );
    }

    #[test]
    fn omits_only_the_approved_undefined_timeout_key_for_progress_notice_metadata() {
        use flight_log::{
            add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
        };
        use std::sync::{Arc, RwLock};
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        let clock: NetClock = Arc::new(|| 7.0);
        warn_on_net_misuse(
            &log,
            &clock,
            NetGuardOperation::SendNetRequest,
            NetGuardReason::ProgressNotEmitted,
            "GET",
            None,
            "u",
        );
        let entries = get_memory_log_sink_entries(&sink);
        let LogData::Record(fields) = &entries[0].data else {
            panic!("expected metadata");
        };
        assert_eq!(fields.len(), 5);
        assert!(!fields.contains_key("timeoutMs"));
        assert!(
            matches!(fields.get("reason"), Some(LogValue::Str(value)) if value == "progress-not-emitted")
        );
        assert!(matches!(fields.get("url"), Some(LogValue::Str(value)) if value == "u"));
    }

    fn net_state() -> NetState {
        return NetState {
            data: std::sync::Arc::new(std::sync::RwLock::new(crate::types::NetStateData {
                guard: None,
                enabled: false,
            })),
        };
    }

    #[test]
    fn enabled_method_matches_the_free_query_before_and_after_enabling() {
        let state = net_state();
        let log = std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
        assert_eq!(state.are_guards_enabled(), are_net_guards_enabled(&state));
        enable_net_guards(&state, &log, Arc::new(|| 0.0));
        assert_eq!(state.are_guards_enabled(), are_net_guards_enabled(&state));
        assert!(state.are_guards_enabled());
    }

    #[test]
    fn disable_method_matches_the_free_flag_and_removes_the_actual_guard() {
        use flight_log::{
            add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
        };
        let method = net_state();
        let function = net_state();
        let log = std::sync::Arc::new(std::sync::RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_net_guards(&method, &log, Arc::new(|| 0.0));
        enable_net_guards(&function, &log, Arc::new(|| 0.0));
        method.disable_guards();
        disable_net_guards(&function);
        assert_eq!(
            are_net_guards_enabled(&method),
            are_net_guards_enabled(&function)
        );
        assert!(!are_net_guards_enabled(&method));
        assert!(method.data.read().unwrap().guard.is_none());
        assert!(function.data.read().unwrap().guard.is_none());
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }

    #[test]
    fn enable_method_matches_the_free_installed_callback_and_live_clock_metadata() {
        use flight_log::{
            add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
        };
        use std::sync::{Arc, RwLock};
        let method = net_state();
        let function = net_state();
        let method_log = Arc::new(RwLock::new(create_log_state()));
        let function_log = Arc::new(RwLock::new(create_log_state()));
        let method_sink = create_memory_log_sink(8);
        let function_sink = create_memory_log_sink(8);
        add_log_sink(&method_log, method_sink.sink.clone());
        add_log_sink(&function_log, function_sink.sink.clone());
        let clock: NetClock = Arc::new(|| 99.0);
        method.enable_guards(&method_log, clock.clone());
        enable_net_guards(&function, &function_log, clock);
        let request = Arc::new(RwLock::new(crate::NetRequest {
            method: "gEt".to_string(),
            url: "u".to_string(),
            headers: None,
            body: None,
            response_type: None,
            timeout_ms: None,
            credentials: None,
            redirect: None,
        }));
        for state in [&method, &function] {
            let guard = state.data.read().unwrap().guard.clone().unwrap();
            guard(Arc::new(RwLock::new(crate::NetGuardNotice {
                operation: NetGuardOperation::SendNetRequest,
                reason: NetGuardReason::ProgressNotEmitted,
                request: request.clone(),
            })));
        }
        assert_eq!(
            are_net_guards_enabled(&method),
            are_net_guards_enabled(&function)
        );
        let method_entries = get_memory_log_sink_entries(&method_sink);
        let function_entries = get_memory_log_sink_entries(&function_sink);
        assert_eq!(method_entries.len(), 1);
        assert_eq!(function_entries.len(), 1);
        assert_eq!(
            method_entries[0].timestamp_ms,
            function_entries[0].timestamp_ms
        );
        assert_eq!(method_entries[0].channel, function_entries[0].channel);
        let (LogData::Record(method_fields), LogData::Record(function_fields)) =
            (&method_entries[0].data, &function_entries[0].data)
        else {
            panic!("expected metadata");
        };
        for key in ["message", "method", "operation", "reason", "url"] {
            let (Some(LogValue::Str(method_value)), Some(LogValue::Str(function_value))) =
                (method_fields.get(key), function_fields.get(key))
            else {
                panic!("expected string metadata");
            };
            assert_eq!(method_value, function_value);
        }
    }
}

// flight-lint: allow(conform-params) D5 caller-owned context replaces the hidden enabled flag
pub fn are_net_guards_enabled(state: &NetState) -> bool {
    return state.data.read().unwrap().enabled;
}

// flight-lint: allow(conform-params) D5 caller-owned context replaces hidden guard and enabled flag
pub fn disable_net_guards(state: &NetState) {
    set_net_guard(state, None);
    state.data.write().unwrap().enabled = false;
}

// flight-lint: allow(conform-params) D5 explicit context, retained LogState and injected live clock replace module state and ambient time
pub fn enable_net_guards(state: &NetState, log_state: &LogStateRef, clock: NetClock) {
    let log_state = log_state.clone();
    set_net_guard(
        state,
        Some(Arc::new(move |notice| {
            let (operation, reason, request) = {
                let notice = notice.read().unwrap();
                (notice.operation, notice.reason, notice.request.clone())
            };
            let (method, timeout_ms, url) = {
                let request = request.read().unwrap();
                (
                    request.method.clone(),
                    request.timeout_ms,
                    request.url.clone(),
                )
            };
            warn_on_net_misuse(
                &log_state, &clock, operation, reason, &method, timeout_ms, &url,
            );
        })),
    );
    state.data.write().unwrap().enabled = true;
}

pub(crate) fn format_net_guard_message(method: &str, reason: NetGuardReason) -> String {
    return match reason {
        NetGuardReason::BodyOnGetOrHead => format!("sendNetRequest: {} requests do not carry a body — remove request.body or use a body-bearing method", method.to_uppercase()),
        NetGuardReason::NegativeTimeout => "sendNetRequest: timeoutMs is negative, so the capability cannot schedule a timeout — pass zero or a positive duration".to_string(),
        NetGuardReason::ProgressNotEmitted => "sendNetRequest: the capability completed successfully without emitting the supplied progress signal — use a capability that supports download progress".to_string(),
    };
}

// flight-lint: allow(f64) D1: injected operation timestamps and the existing logger's millisecond duration scalar
pub(crate) fn warn_on_net_misuse(
    log_state: &LogStateRef,
    clock: &NetClock,
    operation: NetGuardOperation,
    reason: NetGuardReason,
    method: &str,
    timeout_ms: Option<f32>,
    url: &str,
) {
    let operation = get_net_guard_operation_string(operation);
    let reason_string = get_net_guard_reason_string(reason);
    let mut data = HashMap::from([
        (
            "message".to_string(),
            LogValue::Str(format_net_guard_message(method, reason)),
        ),
        ("method".to_string(), LogValue::Str(method.to_string())),
        (
            "operation".to_string(),
            LogValue::Str(operation.to_string()),
        ),
        (
            "reason".to_string(),
            LogValue::Str(reason_string.to_string()),
        ),
        ("url".to_string(), LogValue::Str(url.to_string())),
    ]);
    // Principal7b80a6c1: omit source undefined timeoutMs; never substitute null or a string.
    if let Some(timeout_ms) = timeout_ms {
        data.insert(
            "timeoutMs".to_string(),
            LogValue::Float(f64::from(timeout_ms)),
        );
    }
    let _ = log_once(
        log_state,
        clock(),
        &format!("net:{operation}:{reason_string}"),
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("net".to_string()),
    );
}

impl NetState {
    pub fn are_guards_enabled(&self) -> bool {
        return are_net_guards_enabled(self);
    }
    pub fn disable_guards(&self) {
        return disable_net_guards(self);
    }
    pub fn enable_guards(&self, log_state: &LogStateRef, clock: NetClock) {
        return enable_net_guards(self, log_state, clock);
    }
}
