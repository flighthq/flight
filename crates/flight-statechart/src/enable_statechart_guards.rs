//! flight-compiler: target-native

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::types::*;

// Report whether the built-in diagnostics are installed for this actor; a custom guard is not the
// built-in one (source identity distinction preserved).
pub fn are_statechart_guards_enabled(instance: &Ref<StatechartInstanceRaw>) -> bool {
    let current = instance.read().unwrap();
    return match (&current.duration_guard, &current.builtin_guard) {
        (Some(installed), Some(builtin)) => Arc::ptr_eq(installed, builtin),
        _ => false,
    };
}

fn chart_id_for(guard_state: &StatechartGuardStateRef, chart: &Ref<StatechartRaw>) -> i32 {
    let mut state = guard_state.write().unwrap();
    state
        .chart_ids
        .retain(|entry| entry.chart.strong_count() > 0);
    let chart_ptr = Arc::as_ptr(chart);
    for entry in &state.chart_ids {
        if entry.chart.as_ptr() == chart_ptr {
            return entry.id;
        }
    }
    let id = state.next_chart_id;
    state.next_chart_id += 1;
    state.chart_ids.push(StatechartChartIdEntry {
        chart: Arc::downgrade(chart),
        id,
    });
    return id;
}

pub fn disable_statechart_guards(instance: &Ref<StatechartInstanceRaw>) {
    let mut current = instance.write().unwrap();
    current.duration_guard = None;
    current.builtin_guard = None;
}

/// Install the built-in diagnostics with the approved enable-time context: caller-owned log state,
/// live clock, and guard-owned diagnostic chart-id state (weak chart keys, no semantic global).

// flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
// flight-lint: allow(conform-params) D5: approved enable-time log state, live clock and guard state
pub fn enable_statechart_guards(
    instance: &Ref<StatechartInstanceRaw>,
    guard_state: &StatechartGuardStateRef,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let guard_state = guard_state.clone();
    let log_state = log_state.clone();
    let builtin: StatechartDurationGuard = Arc::new(move |instance, explanation| {
        let now_ms = clock();
        log_missing_statechart_region_duration(
            instance,
            explanation,
            &guard_state,
            &log_state,
            now_ms,
        );
    });
    let mut current = instance.write().unwrap();
    current.duration_guard = Some(builtin.clone());
    current.builtin_guard = Some(builtin);
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn log_missing_statechart_region_duration(
    instance: &Ref<StatechartInstanceRaw>,
    explanation: &StatechartTransitionExplanation,
    guard_state: &StatechartGuardStateRef,
    log_state: &LogStateRef,
    now_ms: f64,
) {
    let chart = instance.read().unwrap().chart.clone();
    let exit_time_ratio = {
        let chart = chart.read().unwrap();
        chart
            .regions
            .get(explanation.region_index as usize)
            .and_then(|region| region.states.get(explanation.source_state_index as usize))
            .and_then(|state| state.transitions.get(explanation.transition_index as usize))
            .map(|transition| transition.exit_time_ratio)
            .unwrap_or(-1.0)
    };
    let region_duration = instance
        .read()
        .unwrap()
        .region_duration
        .get(explanation.region_index as usize)
        .copied()
        .unwrap_or(-1.0);
    let chart_id = chart_id_for(guard_state, &chart);
    let key = format!(
        "statechart:missing-region-duration:{}:{}:{}:{}",
        chart_id,
        explanation.region_index,
        explanation.source_state_index,
        explanation.transition_index
    );

    let mut data = HashMap::new();
    data.insert(
        "exitTimeRatio".to_string(),
        LogValue::Number(exit_time_ratio),
    );
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "advanceStatechartInstance: exitTimeRatio requires a positive region duration; \
             the transition was treated as having no exit-time requirement \
             — call setStatechartRegionDuration when the region enters a state."
                .to_string(),
        ),
    );
    data.insert(
        "regionDuration".to_string(),
        LogValue::Number(region_duration),
    );
    data.insert(
        "regionIndex".to_string(),
        LogValue::Number((explanation.region_index as i64) as f64),
    );
    data.insert(
        "sourceStateIndex".to_string(),
        LogValue::Number((explanation.source_state_index as i64) as f64),
    );
    data.insert(
        "status".to_string(),
        LogValue::Str(get_statechart_transition_status_string(explanation.status).to_string()),
    );
    data.insert(
        "targetStateIndex".to_string(),
        LogValue::Number((explanation.target_state_index as i64) as f64),
    );
    data.insert(
        "transitionIndex".to_string(),
        LogValue::Number((explanation.transition_index as i64) as f64),
    );

    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("statechart".to_string()),
    );
}
