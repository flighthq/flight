//! The warning every feature's host guard emits for an absent capability (D26; TS
//! `enableHostGuards.ts`'s per-capability warning, redistributed from the former aggregate host).

use std::collections::HashMap;

use flight_host::HostCapabilityExplanation;

use crate::log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};

/// Warns once that a host capability is absent, through the caller-owned log state (D5). The record
/// carries the explanation's group, slot, capability and message, and each backend as `entry
/// (package)`, on the `host` channel. The `log_once` key is the slot (`host:missing:<group>.<slot>`),
/// so two hosts missing the same capability warn once. A present capability is silent.
// flight-lint: allow(conform-extra, f64) D26: the shared warning of the former aggregate enableHostGuards, called by each feature's guard; D5: the injected log clock is f64 milliseconds
pub fn warn_missing_host_capability(
    state: &LogStateRef,
    now_ms: f64,
    explanation: &HostCapabilityExplanation,
) {
    if explanation.is_present {
        return;
    }
    let backends = explanation
        .backends
        .iter()
        .map(|backend| {
            LogValue::Str(format!(
                "{} ({})",
                backend.entry_point, backend.package_name
            ))
        })
        .collect();
    let mut data = HashMap::new();
    data.insert("backends".to_string(), LogValue::Array(backends));
    data.insert(
        "group".to_string(),
        LogValue::Str(explanation.group.clone()),
    );
    data.insert(
        "message".to_string(),
        LogValue::Str(explanation.message.clone()),
    );
    data.insert(
        "capability".to_string(),
        LogValue::Str(explanation.capability.clone()),
    );
    data.insert("slot".to_string(), LogValue::Str(explanation.slot.clone()));
    log_once(
        state,
        now_ms,
        &format!("host:missing:{}.{}", explanation.group, explanation.slot),
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("host".to_string()),
    );
}
