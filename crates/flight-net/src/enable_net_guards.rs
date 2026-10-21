use crate::enums::{get_net_guard_operation_string, get_net_guard_reason_string};
use crate::{NetClock, NetGuardOperation, NetGuardReason};
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use std::collections::HashMap;

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
