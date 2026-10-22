use flight_entity::{Ref, allocate_entity, throw_range_error, throw_type_error};
use flight_signals::emit_signal;
use std::sync::RwLock;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::{Arc, RwLock};

    fn chart_ref() -> Ref<Statechart> {
        let chart = Statechart {
            inputs: vec![
                StatechartInput {
                    initial_value: 0.0,
                    kind: StatechartInputKind::Boolean,
                    name: Some("on".to_string()),
                },
                StatechartInput {
                    initial_value: 2.0,
                    kind: StatechartInputKind::Number,
                    name: Some("speed".to_string()),
                },
                StatechartInput {
                    initial_value: 0.0,
                    kind: StatechartInputKind::Trigger,
                    name: Some("go".to_string()),
                },
            ],
            name: None,
            regions: vec![StatechartRegion {
                initial_state_index: 0,
                name: None,
                states: vec![
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: vec![StatechartTransition {
                            conditions: Vec::new(),
                            duration_ms: 0.0,
                            exit_time_ratio: -1.0,
                            target_state_index: 1,
                        }],
                    },
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                ],
            }],
        };
        return Ref::new(RwLock::new(chart));
    }

    fn guard_state() -> StatechartGuardStateRef {
        return Ref::new(RwLock::new(StatechartGuardState {
            chart_ids: Vec::new(),
            next_chart_id: 1,
        }));
    }

    fn log_state() -> flight_log::LogStateRef {
        return Arc::new(RwLock::new(flight_log::create_log_state()));
    }

    #[test]
    fn statechart_get_input_index_matches_the_free_function() {
        let chart = chart_ref();
        let chart = chart.read().unwrap();
        assert_eq!(
            chart.get_input_index("speed"),
            get_statechart_input_index(&chart, "speed")
        );
        assert_eq!(
            chart.get_input_index("missing"),
            get_statechart_input_index(&chart, "missing")
        );
    }

    #[test]
    fn statechart_instance_new_matches_create_statechart_instance() {
        let chart = chart_ref();
        let via_new = StatechartInstance::new(&chart);
        let via_free = create_statechart_instance(&chart);
        assert!(std::sync::Arc::ptr_eq(
            &via_new.read().unwrap().chart,
            &via_free.read().unwrap().chart
        ));
        assert_eq!(
            &*via_new.read().unwrap().input_values,
            &*via_free.read().unwrap().input_values
        );
        assert_eq!(
            &*via_new.read().unwrap().region_states,
            &*via_free.read().unwrap().region_states
        );
    }

    #[test]
    fn statechart_instance_advance_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        assert_eq!(a.advance(0.0), advance_statechart_instance(&b, 0.0));
        assert_eq!(
            &*a.read().unwrap().region_states,
            &*b.read().unwrap().region_states
        );
        assert_eq!(
            &*a.read().unwrap().region_blend,
            &*b.read().unwrap().region_blend
        );
    }

    #[test]
    fn statechart_instance_enable_guards_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        let a_guards = guard_state();
        let b_guards = guard_state();
        let log = log_state();
        a.enable_guards(&a_guards, &log, Arc::new(|| 0.0));
        crate::enable_statechart_guards::enable_statechart_guards(
            &b,
            &b_guards,
            &log,
            Arc::new(|| 0.0),
        );
        assert_eq!(
            a.guards_enabled(),
            crate::enable_statechart_guards::are_statechart_guards_enabled(&b)
        );
    }

    #[test]
    fn statechart_instance_disable_guards_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        let guards = guard_state();
        let log = log_state();
        a.enable_guards(&guards, &log, Arc::new(|| 0.0));
        b.enable_guards(&guards, &log, Arc::new(|| 0.0));
        a.disable_guards();
        crate::enable_statechart_guards::disable_statechart_guards(&b);
        assert_eq!(
            a.guards_enabled(),
            crate::enable_statechart_guards::are_statechart_guards_enabled(&b)
        );
    }

    #[test]
    fn statechart_instance_guards_enabled_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let guards = guard_state();
        let log = log_state();
        a.enable_guards(&guards, &log, Arc::new(|| 0.0));
        assert_eq!(
            a.guards_enabled(),
            crate::enable_statechart_guards::are_statechart_guards_enabled(&a)
        );
    }

    #[test]
    fn statechart_instance_enable_signals_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let via_method = a.enable_signals();
        let via_free = crate::statechart_signals::enable_statechart_signals(&a);
        assert!(Arc::ptr_eq(
            &via_method.on_state_change.data,
            &via_free.on_state_change.data
        ));
    }

    #[test]
    fn statechart_instance_get_signals_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        a.enable_signals();
        let via_method = a.get_signals().unwrap();
        let via_free = crate::statechart_signals::get_statechart_signals(&a).unwrap();
        assert!(Arc::ptr_eq(
            &via_method.on_state_change.data,
            &via_free.on_state_change.data
        ));
    }

    #[test]
    fn statechart_instance_explain_transition_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        assert_eq!(
            a.explain_transition(0),
            explain_statechart_transition(&b, 0)
        );
    }

    #[test]
    fn statechart_instance_fire_trigger_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        a.fire_trigger(2);
        fire_statechart_trigger(&b, 2);
        assert_eq!(
            &*a.read().unwrap().input_values,
            &*b.read().unwrap().input_values
        );
    }

    #[test]
    fn statechart_instance_region_blend_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        assert_eq!(a.region_blend(0), get_statechart_region_blend(&b, 0));
    }

    #[test]
    fn statechart_instance_region_state_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        assert_eq!(a.region_state(0), get_statechart_region_state(&b, 0));
    }

    #[test]
    fn statechart_instance_set_boolean_input_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        a.set_boolean_input(0, true);
        set_statechart_boolean_input(&b, 0, true);
        assert_eq!(
            &*a.read().unwrap().input_values,
            &*b.read().unwrap().input_values
        );
    }

    #[test]
    fn statechart_instance_set_number_input_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        a.set_number_input(1, 4.5);
        set_statechart_number_input(&b, 1, 4.5);
        assert_eq!(
            &*a.read().unwrap().input_values,
            &*b.read().unwrap().input_values
        );
    }

    #[test]
    fn statechart_instance_set_region_duration_matches_the_free_function() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let b = create_statechart_instance(&chart);
        a.set_region_duration(0, 100.0);
        set_statechart_region_duration(&b, 0, 100.0);
        assert_eq!(
            &*a.read().unwrap().region_duration,
            &*b.read().unwrap().region_duration
        );
    }

    #[test]
    fn statechart_instance_set_number_input_preserves_the_kind_guard() {
        let chart = chart_ref();
        let a = create_statechart_instance(&chart);
        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| a.set_number_input(2, 1.0)));
        assert!(result.is_err());
    }
}

// Advance every concurrent region, returning how many reached a new state. Triggers are cleared
// before signals are emitted, and every lock is released before signal callbacks so listeners may
// mutate the instance (fire triggers, set durations) during emission, as in the TS source.
pub fn advance_statechart_instance(instance: &Ref<StatechartInstance>, delta_time: f64) -> i32 {
    let delta_time_ms = if delta_time.is_finite() && delta_time > 0.0 {
        delta_time
    } else {
        0.0
    };
    let chart = instance.read().unwrap().chart.clone();
    let region_count = chart.read().unwrap().regions.len();
    let mut changed: Vec<(i32, i32)> = Vec::new();
    let mut changed_count = 0;

    for region_index in 0..region_count {
        let previous_state_index = instance.read().unwrap().region_states[region_index];
        if advance_statechart_region(instance, &chart, region_index as i32, delta_time_ms) {
            changed_count += 1;
            if instance.read().unwrap().signals.is_some() {
                changed.push((region_index as i32, previous_state_index));
            }
        }
    }

    {
        let trigger_indices: Vec<usize> = {
            let chart = chart.read().unwrap();
            chart
                .inputs
                .iter()
                .enumerate()
                .filter(|(_, input)| input.kind == StatechartInputKind::Trigger)
                .map(|(index, _)| index)
                .collect()
        };
        let mut current = instance.write().unwrap();
        for index in trigger_indices {
            current.input_values[index] = 0.0;
        }
    }

    let signals = instance.read().unwrap().signals.clone();
    if let Some(signals) = signals {
        for (region_index, previous_state_index) in changed {
            let new_state_index = instance.read().unwrap().region_states[region_index as usize];
            emit_signal(
                &signals.on_state_change,
                &StatechartStateChangeEvent {
                    region_index,
                    previous_state_index,
                    state_index: new_state_index,
                },
            );
        }
    }
    return changed_count;
}

pub fn create_statechart_instance(chart: &Ref<Statechart>) -> Ref<StatechartInstance> {
    let mut out: StatechartInstance = allocate_entity();
    initialize_statechart_instance(&mut out, chart);
    return Ref::new(RwLock::new(out));
}

pub fn explain_statechart_transition(
    instance: &Ref<StatechartInstance>,
    region_index: i32,
) -> StatechartTransitionExplanation {
    if region_index < 0 {
        return invalid_region_explanation(region_index);
    }
    let ri = region_index as usize;
    let chart = instance.read().unwrap().chart.clone();
    let chart = chart.read().unwrap();
    if ri >= chart.regions.len() {
        return invalid_region_explanation(region_index);
    }
    let region = &chart.regions[ri];
    let source_state_index = instance.read().unwrap().region_states[ri];
    if source_state_index < 0 || source_state_index as usize >= region.states.len() {
        return invalid_region_explanation(region_index);
    }
    let state = &region.states[source_state_index as usize];
    let active_transition_index = instance.read().unwrap().region_transitions[ri];
    if active_transition_index >= 0 {
        let Some(active) = state.transitions.get(active_transition_index as usize) else {
            return invalid_region_explanation(region_index);
        };
        return StatechartTransitionExplanation {
            blend: instance.read().unwrap().region_blend[ri],
            condition_index: -1,
            region_index,
            source_state_index,
            status: StatechartTransitionStatus::Transitioning,
            target_state_index: active.target_state_index,
            transition_index: active_transition_index,
        };
    }
    if state.transitions.is_empty() {
        return StatechartTransitionExplanation {
            blend: 0.0,
            condition_index: -1,
            region_index,
            source_state_index,
            status: StatechartTransitionStatus::NoTransitions,
            target_state_index: -1,
            transition_index: -1,
        };
    }
    let mut first_blocked: Option<StatechartTransitionExplanation> = None;
    for transition_index in 0..state.transitions.len() {
        let transition = &state.transitions[transition_index];
        let condition_index = get_first_unmet_condition(instance, &chart, transition);
        if condition_index >= 0 {
            if first_blocked.is_none() {
                first_blocked = Some(StatechartTransitionExplanation {
                    blend: 0.0,
                    condition_index,
                    region_index,
                    source_state_index,
                    status: StatechartTransitionStatus::ConditionsUnmet,
                    target_state_index: transition.target_state_index,
                    transition_index: transition_index as i32,
                });
            }
            continue;
        }
        let exit_status = get_statechart_exit_status(instance, ri, transition);
        if exit_status == StatechartTransitionStatus::MissingRegionDuration {
            return StatechartTransitionExplanation {
                blend: 0.0,
                condition_index: -1,
                region_index,
                source_state_index,
                status: StatechartTransitionStatus::MissingRegionDuration,
                target_state_index: transition.target_state_index,
                transition_index: transition_index as i32,
            };
        }
        if exit_status == StatechartTransitionStatus::ExitTimePending {
            if first_blocked.is_none() {
                first_blocked = Some(StatechartTransitionExplanation {
                    blend: 0.0,
                    condition_index: -1,
                    region_index,
                    source_state_index,
                    status: StatechartTransitionStatus::ExitTimePending,
                    target_state_index: transition.target_state_index,
                    transition_index: transition_index as i32,
                });
            }
            continue;
        }
        return StatechartTransitionExplanation {
            blend: 0.0,
            condition_index: -1,
            region_index,
            source_state_index,
            status: StatechartTransitionStatus::Ready,
            target_state_index: transition.target_state_index,
            transition_index: transition_index as i32,
        };
    }
    return first_blocked.unwrap();
}

pub fn fire_statechart_trigger(instance: &Ref<StatechartInstance>, input_index: i32) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Trigger);
    let mut current = instance.write().unwrap();
    current.input_values[input_index as usize] = 1.0;
}

pub fn get_statechart_input_index(chart: &Statechart, name: &str) -> i32 {
    for input_index in 0..chart.inputs.len() {
        if chart.inputs[input_index].name.as_deref() == Some(name) {
            return input_index as i32;
        }
    }
    return -1;
}

pub fn get_statechart_region_blend(instance: &Ref<StatechartInstance>, region_index: i32) -> f32 {
    let current = instance.read().unwrap();
    if region_index >= 0 && (region_index as usize) < current.region_blend.len() {
        return current.region_blend[region_index as usize];
    }
    return -1.0;
}

pub fn get_statechart_region_state(instance: &Ref<StatechartInstance>, region_index: i32) -> i32 {
    let current = instance.read().unwrap();
    if region_index >= 0 && (region_index as usize) < current.region_states.len() {
        return current.region_states[region_index as usize];
    }
    return -1;
}

pub fn initialize_statechart_instance(out: &mut StatechartInstance, chart: &Ref<Statechart>) {
    {
        let chart = chart.read().unwrap();
        validate_statechart(&chart);
    }
    let chart_input_count = chart.read().unwrap().inputs.len();
    let chart_region_count = chart.read().unwrap().regions.len();
    let mut input_values: Vec<f64> = vec![0.0; chart_input_count];
    for input_index in 0..chart_input_count {
        let chart_guard = chart.read().unwrap();
        let input = &chart_guard.inputs[input_index];
        input_values[input_index] = if input.kind == StatechartInputKind::Boolean {
            if input.initial_value == 0.0 { 0.0 } else { 1.0 }
        } else {
            input.initial_value
        };
    }
    let region_count = chart_region_count;
    let mut region_states: Vec<i32> = vec![0; region_count];
    for region_index in 0..region_count {
        region_states[region_index] =
            chart.read().unwrap().regions[region_index].initial_state_index;
    }

    out.chart = chart.clone();
    out.duration_guard = None;
    out.builtin_guard = None;
    out.input_values = input_values.into_boxed_slice();
    out.region_blend = vec![0.0f32; region_count].into_boxed_slice();
    out.region_duration = vec![0.0f64; region_count].into_boxed_slice();
    out.region_elapsed = vec![0.0f64; region_count].into_boxed_slice();
    out.region_states = region_states.into_boxed_slice();
    out.region_transitions = vec![-1i32; region_count].into_boxed_slice();
    out.signals = None;
}

pub fn set_statechart_boolean_input(
    instance: &Ref<StatechartInstance>,
    input_index: i32,
    value: bool,
) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Boolean);
    let mut current = instance.write().unwrap();
    current.input_values[input_index as usize] = if value { 1.0 } else { 0.0 };
}

pub fn set_statechart_number_input(
    instance: &Ref<StatechartInstance>,
    input_index: i32,
    value: f64,
) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Number);
    let mut current = instance.write().unwrap();
    current.input_values[input_index as usize] = value;
}

pub fn set_statechart_region_duration(
    instance: &Ref<StatechartInstance>,
    region_index: i32,
    duration: f64,
) {
    let len = instance.read().unwrap().region_duration.len();
    if region_index < 0 || region_index as usize >= len {
        throw_range_error(&format!(
            "Statechart region index {} is out of range",
            region_index
        ));
    }
    if !duration.is_finite() || duration < 0.0 {
        throw_range_error("Statechart region duration must be finite and non-negative");
    }
    instance.write().unwrap().region_duration[region_index as usize] = duration;
}

// ============================================================================
// Private helpers
// ============================================================================

fn advance_statechart_region(
    instance: &Ref<StatechartInstance>,
    chart: &Ref<Statechart>,
    region_index: i32,
    delta_time_ms: f64,
) -> bool {
    let ri = region_index as usize;
    let (source_state_index, mut transition_index) = {
        let current = instance.read().unwrap();
        (current.region_states[ri], current.region_transitions[ri])
    };
    let source_transition_count = {
        let chart = chart.read().unwrap();
        let region = &chart.regions[ri];
        match region.states.get(source_state_index as usize) {
            Some(state) if !state.kind.is_empty() => state.transitions.len(),
            _ => throw_range_error(&format!(
                "Statechart region {} has an invalid active state",
                region_index
            )),
        }
    };
    instance.write().unwrap().region_elapsed[ri] += delta_time_ms;
    if transition_index >= 0 {
        if transition_index as usize >= source_transition_count {
            throw_range_error(&format!(
                "Statechart region {} has an invalid active transition",
                region_index
            ));
        }
    } else {
        transition_index = get_ready_transition_index(instance, chart, region_index);
        if transition_index < 0 {
            return false;
        }
        let mut current = instance.write().unwrap();
        current.region_transitions[ri] = transition_index;
        current.region_blend[ri] = 0.0;
    }

    let (duration_ms, target) = {
        let chart = chart.read().unwrap();
        let transition = &chart.regions[ri].states[source_state_index as usize].transitions
            [transition_index as usize];
        (transition.duration_ms, transition.target_state_index)
    };
    let duration_ms = if duration_ms.is_finite() && duration_ms > 0.0 {
        duration_ms
    } else {
        0.0
    };
    let blend = {
        let mut current = instance.write().unwrap();
        let blend = if duration_ms == 0.0 {
            1.0
        } else {
            (current.region_blend[ri] + (delta_time_ms / duration_ms) as f32).min(1.0)
        };
        current.region_blend[ri] = blend;
        blend
    };
    if blend < 1.0 {
        return false;
    }
    let mut current = instance.write().unwrap();
    current.region_states[ri] = target;
    current.region_transitions[ri] = -1;
    current.region_blend[ri] = 0.0;
    current.region_duration[ri] = 0.0;
    current.region_elapsed[ri] = 0.0;
    return true;
}

fn assert_statechart_input_kind(
    instance: &Ref<StatechartInstance>,
    input_index: i32,
    expected_kind: StatechartInputKind,
) {
    let kind = {
        let chart = instance.read().unwrap().chart.clone();
        let chart = chart.read().unwrap();
        let input = if input_index >= 0 {
            chart.inputs.get(input_index as usize)
        } else {
            None
        };
        match input {
            Some(input) => input.kind,
            None => throw_range_error(&format!(
                "Statechart input index {} is out of range",
                input_index
            )),
        }
    };
    if kind != expected_kind {
        throw_type_error(&format!(
            "Statechart input {} is {}, not {}",
            input_index,
            get_statechart_input_kind_string(kind),
            get_statechart_input_kind_string(expected_kind)
        ));
    }
}

fn compare_statechart_condition(value: f64, condition: &StatechartCondition) -> bool {
    return match condition.comparison {
        StatechartComparison::Equal => value == condition.value,
        StatechartComparison::GreaterThan => value > condition.value,
        StatechartComparison::GreaterThanOrEqual => value >= condition.value,
        StatechartComparison::LessThan => value < condition.value,
        StatechartComparison::LessThanOrEqual => value <= condition.value,
        StatechartComparison::NotEqual => value != condition.value,
    };
}

fn get_first_unmet_condition(
    instance: &Ref<StatechartInstance>,
    chart: &Statechart,
    transition: &StatechartTransition,
) -> i32 {
    for condition_index in 0..transition.conditions.len() {
        let condition = &transition.conditions[condition_index];
        let input = if condition.input_index >= 0 {
            chart.inputs.get(condition.input_index as usize)
        } else {
            None
        };
        let Some(input) = input else {
            return condition_index as i32;
        };
        let input_value = instance
            .read()
            .unwrap()
            .input_values
            .get(condition.input_index as usize)
            .copied()
            .unwrap_or(0.0);
        let met = if input.kind == StatechartInputKind::Trigger {
            input_value != 0.0
        } else {
            compare_statechart_condition(input_value, condition)
        };
        if !met {
            return condition_index as i32;
        }
    }
    return -1;
}

fn get_ready_transition_index(
    instance: &Ref<StatechartInstance>,
    chart: &Ref<Statechart>,
    region_index: i32,
) -> i32 {
    let ri = region_index as usize;
    let (source_state_index, transition_count) = {
        let chart = chart.read().unwrap();
        let state_index = instance.read().unwrap().region_states[ri];
        let count = chart.regions[ri].states[state_index as usize]
            .transitions
            .len();
        (state_index, count)
    };
    for transition_index in 0..transition_count {
        let (unmet, exit_status, target, exit_ratio) = {
            let chart = chart.read().unwrap();
            let transition = &chart.regions[ri].states[source_state_index as usize].transitions
                [transition_index];
            (
                get_first_unmet_condition(instance, &chart, transition),
                get_statechart_exit_status(instance, ri, transition),
                transition.target_state_index,
                transition.exit_time_ratio,
            )
        };
        if unmet >= 0 || exit_status == StatechartTransitionStatus::ExitTimePending {
            continue;
        }
        if exit_status == StatechartTransitionStatus::MissingRegionDuration {
            let explanation = StatechartTransitionExplanation {
                blend: 0.0,
                condition_index: -1,
                region_index,
                source_state_index,
                status: StatechartTransitionStatus::MissingRegionDuration,
                target_state_index: target,
                transition_index: transition_index as i32,
            };
            let guard = instance.read().unwrap().duration_guard.clone();
            if let Some(guard) = guard {
                guard(instance, &explanation);
            }
            let _ = exit_ratio;
        }
        return transition_index as i32;
    }
    return -1;
}

fn get_statechart_exit_status(
    instance: &Ref<StatechartInstance>,
    region_index: usize,
    transition: &StatechartTransition,
) -> StatechartTransitionStatus {
    if transition.exit_time_ratio < 0.0 {
        return StatechartTransitionStatus::Ready;
    }
    let current = instance.read().unwrap();
    let duration = current.region_duration[region_index];
    if duration <= 0.0 {
        return StatechartTransitionStatus::MissingRegionDuration;
    }
    return if current.region_elapsed[region_index] / duration >= transition.exit_time_ratio {
        StatechartTransitionStatus::Ready
    } else {
        StatechartTransitionStatus::ExitTimePending
    };
}

fn invalid_region_explanation(region_index: i32) -> StatechartTransitionExplanation {
    return StatechartTransitionExplanation {
        blend: -1.0,
        condition_index: -1,
        region_index,
        source_state_index: -1,
        status: StatechartTransitionStatus::InvalidRegion,
        target_state_index: -1,
        transition_index: -1,
    };
}

fn validate_statechart(chart: &Statechart) {
    for input_index in 0..chart.inputs.len() {
        let kind = chart.inputs[input_index].kind;
        if kind != StatechartInputKind::Boolean
            && kind != StatechartInputKind::Number
            && kind != StatechartInputKind::Trigger
        {
            throw_type_error(&format!(
                "Statechart input {} has unknown kind {}",
                input_index,
                get_statechart_input_kind_string(kind)
            ));
        }
    }
    for region_index in 0..chart.regions.len() {
        let region = &chart.regions[region_index];
        if region.initial_state_index < 0
            || region.initial_state_index as usize >= region.states.len()
        {
            throw_range_error(&format!(
                "Statechart region {} has an invalid initialStateIndex",
                region_index
            ));
        }
        for state_index in 0..region.states.len() {
            let state = &region.states[state_index];
            if state.kind.is_empty() {
                throw_type_error(&format!(
                    "Statechart region {} state {} has an invalid kind",
                    region_index, state_index
                ));
            }
            for transition_index in 0..state.transitions.len() {
                let transition = &state.transitions[transition_index];
                if !transition.duration_ms.is_finite() || transition.duration_ms < 0.0 {
                    throw_range_error(&format!(
                        "Statechart region {} state {} transition {} has an invalid duration",
                        region_index, state_index, transition_index
                    ));
                }
                if !transition.exit_time_ratio.is_finite() || transition.exit_time_ratio < -1.0 {
                    throw_range_error(&format!(
                        "Statechart region {} state {} transition {} has an invalid exit time",
                        region_index, state_index, transition_index
                    ));
                }
                if transition.target_state_index < 0
                    || transition.target_state_index as usize >= region.states.len()
                {
                    throw_range_error(&format!(
                        "Statechart region {} state {} transition {} has an invalid target",
                        region_index, state_index, transition_index
                    ));
                }
                for condition_index in 0..transition.conditions.len() {
                    let condition = &transition.conditions[condition_index];
                    if condition.input_index < 0
                        || condition.input_index as usize >= chart.inputs.len()
                    {
                        throw_range_error(&format!(
                            "Statechart region {} state {} transition {} has an invalid input",
                            region_index, state_index, transition_index
                        ));
                    }
                    let _ = condition_index;
                }
            }
        }
    }
}

// ============================================================================
// D18 sugar: extension methods on the shared entity handle delegate to the contract
// ============================================================================

/// Sugar for the shared StatechartInstance handle (TS object). One method per public-lane source
/// function whose first argument is the instance.
pub trait StatechartInstanceMethods {
    fn advance(&self, delta_time: f64) -> i32;
    fn disable_guards(&self);
    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    fn enable_guards(
        &self,
        guard_state: &StatechartGuardStateRef,
        log_state: &flight_log::LogStateRef,
        clock: std::sync::Arc<dyn Fn() -> f64 + Send + Sync>,
    );
    fn enable_signals(&self) -> StatechartSignals;
    fn explain_transition(&self, region_index: i32) -> StatechartTransitionExplanation;
    fn fire_trigger(&self, input_index: i32);
    fn get_signals(&self) -> Option<StatechartSignals>;
    fn guards_enabled(&self) -> bool;
    fn region_blend(&self, region_index: i32) -> f32;
    fn region_state(&self, region_index: i32) -> i32;
    fn set_boolean_input(&self, input_index: i32, value: bool);
    // flight-lint: allow(f64) D1: authored numeric input value
    fn set_number_input(&self, input_index: i32, value: f64);
    // flight-lint: allow(f64) D1: region duration is a millisecond number
    fn set_region_duration(&self, region_index: i32, duration: f64);
}

impl Statechart {
    pub fn get_input_index(&self, name: &str) -> i32 {
        return get_statechart_input_index(self, name);
    }
}

impl StatechartInstanceMethods for Ref<StatechartInstance> {
    // flight-lint: allow(f64) D1: frame delta is a millisecond number
    fn advance(&self, delta_time: f64) -> i32 {
        return advance_statechart_instance(self, delta_time);
    }

    fn disable_guards(&self) {
        crate::enable_statechart_guards::disable_statechart_guards(self);
    }

    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    fn enable_guards(
        &self,
        guard_state: &StatechartGuardStateRef,
        log_state: &flight_log::LogStateRef,
        clock: std::sync::Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        crate::enable_statechart_guards::enable_statechart_guards(
            self,
            guard_state,
            log_state,
            clock,
        );
    }

    fn enable_signals(&self) -> StatechartSignals {
        return crate::statechart_signals::enable_statechart_signals(self);
    }

    fn explain_transition(&self, region_index: i32) -> StatechartTransitionExplanation {
        return explain_statechart_transition(self, region_index);
    }

    fn fire_trigger(&self, input_index: i32) {
        fire_statechart_trigger(self, input_index);
    }

    fn get_signals(&self) -> Option<StatechartSignals> {
        return crate::statechart_signals::get_statechart_signals(self);
    }

    fn guards_enabled(&self) -> bool {
        return crate::enable_statechart_guards::are_statechart_guards_enabled(self);
    }

    fn region_blend(&self, region_index: i32) -> f32 {
        return get_statechart_region_blend(self, region_index);
    }

    fn region_state(&self, region_index: i32) -> i32 {
        return get_statechart_region_state(self, region_index);
    }

    fn set_boolean_input(&self, input_index: i32, value: bool) {
        set_statechart_boolean_input(self, input_index, value);
    }

    // flight-lint: allow(f64) D1: authored numeric input value
    fn set_number_input(&self, input_index: i32, value: f64) {
        set_statechart_number_input(self, input_index, value);
    }

    // flight-lint: allow(f64) D1: region duration is a millisecond number
    fn set_region_duration(&self, region_index: i32, duration: f64) {
        set_statechart_region_duration(self, region_index, duration);
    }
}

impl StatechartInstance {
    pub fn new(chart: &Ref<Statechart>) -> Ref<StatechartInstance> {
        return create_statechart_instance(chart);
    }
}
