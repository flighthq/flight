use std::cell::RefCell;
use std::collections::HashMap;

use crate::types::*;

// Report whether caller-misuse diagnostics are installed for this actor.
#[allow(unpredictable_function_pointer_comparisons)]
pub fn are_statechart_guards_enabled(instance: &StatechartInstance) -> bool {
    return instance.duration_guard == Some(warn_missing_statechart_region_duration as StatechartDurationGuard);
}

// Remove the opt-in diagnostics hook without changing transition behavior.
pub fn disable_statechart_guards(instance: &mut StatechartInstance) {
    instance.duration_guard = None;
}

// Install state-scoped warnings for exit-time transitions whose composition layer never
// supplied a positive state duration. Core still coerces that gate to no requirement;
// this module owns the message and log dependency.
pub fn enable_statechart_guards(instance: &mut StatechartInstance) {
    instance.duration_guard = Some(warn_missing_statechart_region_duration);
}

fn warn_missing_statechart_region_duration(
    instance: &StatechartInstance,
    explanation: &StatechartTransitionExplanation,
) {
    let chart_id = get_statechart_guard_chart_id(instance);

    let exit_time_ratio = instance
        .chart
        .regions
        .get(explanation.region_index as usize)
        .and_then(|r| r.states.get(explanation.source_state_index as usize))
        .and_then(|s| s.transitions.get(explanation.transition_index as usize))
        .map(|t| t.exit_time_ratio)
        .unwrap_or(-1.0);

    let region_duration = instance
        .region_duration
        .get(explanation.region_index as usize)
        .copied()
        .unwrap_or(-1.0);

    let key = format!(
        "statechart:missing-region-duration:{}:{}:{}:{}",
        chart_id,
        explanation.region_index,
        explanation.source_state_index,
        explanation.transition_index
    );

    let mut data = Vec::new();
    data.push(("exitTimeRatio".to_string(), LogDataValue::F64(exit_time_ratio)));
    data.push((
        "message".to_string(),
        LogDataValue::String(
            "advanceStatechartInstance: exitTimeRatio requires a positive region duration; \
             the transition was treated as having no exit-time requirement \
             — call setStatechartRegionDuration when the region enters a state."
                .to_string(),
        ),
    ));
    data.push((
        "regionDuration".to_string(),
        LogDataValue::F64(region_duration),
    ));
    data.push((
        "regionIndex".to_string(),
        LogDataValue::I32(explanation.region_index),
    ));
    data.push((
        "sourceStateIndex".to_string(),
        LogDataValue::I32(explanation.source_state_index),
    ));
    data.push((
        "status".to_string(),
        LogDataValue::Status(explanation.status),
    ));
    data.push((
        "targetStateIndex".to_string(),
        LogDataValue::I32(explanation.target_state_index),
    ));
    data.push((
        "transitionIndex".to_string(),
        LogDataValue::I32(explanation.transition_index),
    ));

    log_once(&key, LogLevel::Warn, LogData::Record(data), Some("statechart"));
}

thread_local! {
    static STATECHART_GUARD_CHART_IDS: RefCell<HashMap<*const Statechart, i32>> =
        RefCell::new(HashMap::new());
    static NEXT_STATECHART_GUARD_CHART_ID: RefCell<i32> = RefCell::new(1);
}

fn get_statechart_guard_chart_id(instance: &StatechartInstance) -> i32 {
    let ptr = &instance.chart as *const Statechart;
    return STATECHART_GUARD_CHART_IDS.with(|ids| {
        let mut ids = ids.borrow_mut();
        if let Some(&id) = ids.get(&ptr) {
            return id;
        }
        let id = NEXT_STATECHART_GUARD_CHART_ID.with(|next| {
            let mut next = next.borrow_mut();
            let id = *next;
            *next += 1;
            return id;
        });
        ids.insert(ptr, id);
        return id;
    });
}
