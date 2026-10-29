//! flight-compiler: target-native

use std::collections::HashMap;

use flight_log::{LogData, LogLevel, LogValue, log_once};

use crate::types::LogState;

// flight-lint: allow(f64) injected operation timestamps are passed through to the log contract
pub fn log_clip_warning(log_state: &LogState, now_ms: f64, key: &str, message: &str) {
    let data = LogData::Record(HashMap::from([(
        "message".to_string(),
        LogValue::Str(message.to_string()),
    )]));
    let _ = log_once(
        log_state,
        now_ms,
        key,
        LogLevel::Warn,
        data.into(),
        Some("clip".to_string()),
    );
}
