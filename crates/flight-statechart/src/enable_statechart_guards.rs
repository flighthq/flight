use std::sync::Arc;

use flight_log::LogStateRef;

use crate::types::*;

// Report whether the built-in caller-misuse diagnostics are installed for this actor. A custom
// `duration_guard` assignment is not the built-in guard.
pub fn are_statechart_guards_enabled(instance: &StatechartInstance) -> bool {
    return match (&instance.duration_guard, &instance.builtin_guard) {
        (Some(installed), Some(builtin)) => Arc::ptr_eq(installed, builtin),
        _ => false,
    };
}

// Remove the opt-in diagnostics hook without changing transition behavior.
pub fn disable_statechart_guards(instance: &mut StatechartInstance) {
    instance.duration_guard = None;
    instance.builtin_guard = None;
}

/// Install state-scoped warnings for exit-time transitions whose composition layer never supplied a
/// positive state duration. `chart_id` is explicit because Rust charts are values (no TS object
/// identity); it preserves the exact dedup key shape. Logging uses the caller-owned log state and
/// operation time supplied to `advance_statechart_instance`.
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
// flight-lint: allow(conform-params) D5: approved enable-time log state and live clock capability
pub fn enable_statechart_guards(
    instance: &mut StatechartInstance,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let builtin: StatechartDurationGuard = Arc::new(move |instance, explanation| {
        let now_ms = clock();
        log_missing_statechart_region_duration(instance, explanation, &log_state, now_ms);
    });
    instance.duration_guard = Some(builtin.clone());
    instance.builtin_guard = Some(builtin);
}

/// The exact source warning payload. Logging is emitted by the engine when the built-in guard is
/// installed, because the log state and operation time are explicit D5 inputs there.
// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
pub(crate) fn log_missing_statechart_region_duration(
    instance: &StatechartInstance,
    explanation: &StatechartTransitionExplanation,
    log_state: &flight_log::LogStateRef,
    now_ms: f64,
) {
    let chart_id = &instance.chart as *const Statechart as usize;
    let exit_time_ratio = instance
        .chart
        .regions
        .get(explanation.region_index as usize)
        .and_then(|region| region.states.get(explanation.source_state_index as usize))
        .and_then(|state| state.transitions.get(explanation.transition_index as usize))
        .map(|transition| transition.exit_time_ratio)
        .unwrap_or(-1.0);

    let region_duration = instance
        .region_duration
        .get(explanation.region_index as usize)
        .copied()
        .unwrap_or(-1.0);

    let key = format!(
        "statechart:missing-region-duration:{}:{}:{}:{}",
        chart_id, explanation.region_index, explanation.source_state_index, explanation.transition_index
    );

    let mut data = std::collections::HashMap::new();
    data.insert("exitTimeRatio".to_string(), flight_log::LogValue::Float(exit_time_ratio));
    data.insert(
        "message".to_string(),
        flight_log::LogValue::Str(
            "advanceStatechartInstance: exitTimeRatio requires a positive region duration; \
             the transition was treated as having no exit-time requirement \
             — call setStatechartRegionDuration when the region enters a state."
                .to_string(),
        ),
    );
    data.insert("regionDuration".to_string(), flight_log::LogValue::Float(region_duration));
    data.insert("regionIndex".to_string(), flight_log::LogValue::Int(explanation.region_index as i64));
    data.insert(
        "sourceStateIndex".to_string(),
        flight_log::LogValue::Int(explanation.source_state_index as i64),
    );
    data.insert(
        "status".to_string(),
        flight_log::LogValue::Str(get_statechart_transition_status_string(explanation.status).to_string()),
    );
    data.insert(
        "targetStateIndex".to_string(),
        flight_log::LogValue::Int(explanation.target_state_index as i64),
    );
    data.insert(
        "transitionIndex".to_string(),
        flight_log::LogValue::Int(explanation.transition_index as i64),
    );

    let _ = flight_log::log_once(
        log_state,
        now_ms,
        &key,
        flight_log::LogLevel::Warn,
        flight_log::LogData::Record(data).into(),
        Some("statechart".to_string()),
    );
}

