// flight-lint: allow-file(f64) D5: the injected log clock is flight-log's f64 milliseconds
//! Opt-in warnings for a host missing a capability Flight packages commonly need (TS
//! `enableHostGuards.ts`). There is no seam to install and so no disable or query: a host is built
//! once and never mutated, so the moment it is handed over is the earliest a warning can fire.

use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};

use crate::host_explain::{
    explain_host_audio_device, explain_host_audio_mixer, explain_host_image,
    explain_host_input_ingress, explain_host_text_segmenter, explain_host_text_shaper,
    explain_host_video,
};
use crate::types::{Host, HostCapabilityExplanation};

// The guarded set IS the set of per-capability explainers, called rather than re-derived, so a
// warning and its explain query cannot disagree about whether a slot is filled or where to get it.
const GUARDED: [fn(&Host) -> HostCapabilityExplanation; 7] = [
    explain_host_audio_device,
    explain_host_audio_mixer,
    explain_host_image,
    explain_host_input_ingress,
    explain_host_text_segmenter,
    explain_host_text_shaper,
    explain_host_video,
];

/// Warns once per guarded capability the host is missing (TS `enableHostGuards`), through the
/// caller-owned log state (D5). `log_once` keys per slot, so two hosts missing the same capability
/// warn once.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden log singleton and clock
pub fn enable_host_guards(state: &LogStateRef, now_ms: f64, host: &Host) {
    for explain in GUARDED {
        let explanation = explain(host);
        if explanation.is_present {
            continue;
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
}
