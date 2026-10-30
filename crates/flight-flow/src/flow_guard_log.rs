//! flight-compiler: rust-only
//!
//! Rust's `From` conversions from the flow guard's private log record and level into
//! `flight-log` values. TypeScript passes the record and level through structurally, so these
//! targets have no TypeScript counterpart.

use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogValue};

use crate::flow_guards::FlowGuardLogLevel;

pub(crate) fn create_flow_guard_log_data(kind: String) -> LogDataOrProvider {
    return LogData::Record(HashMap::from([("kind".to_string(), LogValue::Str(kind))])).into();
}

pub(crate) fn get_flow_guard_log_level(value: FlowGuardLogLevel) -> LogLevel {
    return match value {
        FlowGuardLogLevel::Warn => LogLevel::Warn,
    };
}
