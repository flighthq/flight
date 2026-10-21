use flight_entity::{allocate_entity, throw_range_error, throw_type_error};
use flight_log::LogStateRef;
use flight_signals::emit_signal;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::Arc;

    fn chart() -> Statechart {
        return Statechart {
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
                        kind: crate::types::STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: vec![StatechartTransition {
                            conditions: Vec::new(),
                            duration_ms: 0.0,
                            exit_time_ratio: -1.0,
                            target_state_index: 1,
                        }],
                    },
                    StatechartState {
                        kind: crate::types::STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                ],
            }],
        };
    }

    #[test]
    fn statechart_get_input_index_matches_the_free_function() {
        let chart = chart();
        assert_eq!(chart.get_input_index("speed"), get_statechart_input_index(&chart, "speed"));
        assert_eq!(chart.get_input_index("missing"), get_statechart_input_index(&chart, "missing"));
    }

    #[test]
    fn statechart_instance_new_matches_create_statechart_instance() {
        let chart = chart();
        let via_new = StatechartInstance::new(&chart);
        let via_free = create_statechart_instance(&chart);
        assert_eq!(via_new.chart, via_free.chart);
        assert_eq!(&*via_new.input_values, &*via_free.input_values);
        assert_eq!(&*via_new.region_states, &*via_free.region_states);
        assert_eq!(&*via_new.region_transitions, &*via_free.region_transitions);
    }

    #[test]
    fn statechart_instance_advance_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let mut b = create_statechart_instance(&chart());
        assert_eq!(a.advance(0.0), advance_statechart_instance(&mut b, 0.0));
        assert_eq!(&*a.region_states, &*b.region_states);
        assert_eq!(&*a.region_blend, &*b.region_blend);
    }

    #[test]
    fn statechart_instance_enable_guards_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let mut b = create_statechart_instance(&chart());
        let state = std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
        a.enable_guards(&state, std::sync::Arc::new(|| 0.0));
        crate::enable_statechart_guards::enable_statechart_guards(&mut b, &state, std::sync::Arc::new(|| 0.0));
        assert_eq!(a.guards_enabled(), crate::enable_statechart_guards::are_statechart_guards_enabled(&b));
    }

    #[test]
    fn statechart_instance_disable_guards_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let mut b = create_statechart_instance(&chart());
        let state = std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
        a.enable_guards(&state, std::sync::Arc::new(|| 0.0));
        crate::enable_statechart_guards::enable_statechart_guards(&mut b, &state, std::sync::Arc::new(|| 0.0));
        a.disable_guards();
        crate::enable_statechart_guards::disable_statechart_guards(&mut b);
        assert_eq!(a.guards_enabled(), crate::enable_statechart_guards::are_statechart_guards_enabled(&b));
    }

    #[test]
    fn statechart_instance_guards_enabled_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let state = std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
        a.enable_guards(&state, std::sync::Arc::new(|| 0.0));
        assert_eq!(a.guards_enabled(), crate::enable_statechart_guards::are_statechart_guards_enabled(&a));
    }

    #[test]
    fn statechart_instance_enable_signals_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let via_method = a.enable_signals();
        let via_free = crate::statechart_signals::enable_statechart_signals(&mut a);
        assert!(Arc::ptr_eq(&via_method.on_state_change.data, &via_free.on_state_change.data));
        assert!(via_method.on_state_change.data.read().unwrap().is_none());
    }

    #[test]
    fn statechart_instance_get_signals_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        a.enable_signals();
        let via_method = a.get_signals().unwrap();
        let via_free = crate::statechart_signals::get_statechart_signals(&a).unwrap();
        assert!(Arc::ptr_eq(&via_method.on_state_change.data, &via_free.on_state_change.data));
    }

    #[test]
    fn statechart_instance_explain_transition_matches_the_free_function() {
        let a = create_statechart_instance(&chart());
        let b = create_statechart_instance(&chart());
        assert_eq!(a.explain_transition(0), explain_statechart_transition(&b, 0));
    }

    #[test]
    fn statechart_instance_fire_trigger_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let mut b = create_statechart_instance(&chart());
        a.fire_trigger(2);
        fire_statechart_trigger(&mut b, 2);
        assert_eq!(&*a.input_values, &*b.input_values);
    }

    #[test]
    fn statechart_instance_region_blend_matches_the_free_function() {
        let a = create_statechart_instance(&chart());
        let b = create_statechart_instance(&chart());
        assert_eq!(a.region_blend(0), get_statechart_region_blend(&b, 0));
    }

    #[test]
    fn statechart_instance_region_state_matches_the_free_function() {
        let a = create_statechart_instance(&chart());
        let b = create_statechart_instance(&chart());
        assert_eq!(a.region_state(0), get_statechart_region_state(&b, 0));
    }

    #[test]
    fn statechart_instance_set_boolean_input_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let mut b = create_statechart_instance(&chart());
        a.set_boolean_input(0, true);
        set_statechart_boolean_input(&mut b, 0, true);
        assert_eq!(&*a.input_values, &*b.input_values);
    }

    #[test]
    fn statechart_instance_set_number_input_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let mut b = create_statechart_instance(&chart());
        a.set_number_input(1, 4.5);
        set_statechart_number_input(&mut b, 1, 4.5);
        assert_eq!(&*a.input_values, &*b.input_values);
    }

    #[test]
    fn statechart_instance_set_region_duration_matches_the_free_function() {
        let mut a = create_statechart_instance(&chart());
        let mut b = create_statechart_instance(&chart());
        a.set_region_duration(0, 100.0);
        set_statechart_region_duration(&mut b, 0, 100.0);
        assert_eq!(&*a.region_duration, &*b.region_duration);
    }

    #[test]
    fn statechart_instance_set_number_input_preserves_the_kind_guard() {
        let mut a = create_statechart_instance(&chart());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| a.set_number_input(2, 1.0)));
        assert!(result.is_err());
    }
}



// Advance every concurrent region by `delta_time` milliseconds and return how many reached a new
// state. Each region changes at most once per call. Trigger inputs are edge latches shared by all
// regions for the whole pass, then cleared, so one fired trigger can independently drive several
// regions. The log state and operation time are explicit D5 inputs used by the duration guard.
pub fn advance_statechart_instance(instance: &mut StatechartInstance, delta_time: f64) -> i32 {
    let delta_time_ms = if delta_time.is_finite() && delta_time > 0.0 {
        delta_time
    } else {
        0.0
    };
    let mut changed_regions: Option<Vec<i32>> = None;
    let mut changed_region_count: i32 = 0;

    for region_index in 0..instance.chart.regions.len() {
        let previous_state_index = instance.region_states[region_index];
        if advance_statechart_region(instance, region_index as i32, delta_time_ms) {
            changed_region_count += 1;
            if instance.signals.is_some() {
                let regions = changed_regions.get_or_insert_with(Vec::new);
                regions.push(region_index as i32);
                regions.push(previous_state_index);
            }
        }
    }

    // Clear before emitting: a listener may fire a trigger for the next pass, and that edge must not
    // be erased by this pass's cleanup.
    clear_statechart_triggers(instance);
    if let (Some(changed), Some(signals)) = (&changed_regions, &instance.signals) {
        let mut i = 0;
        while i < changed.len() {
            let region_index = changed[i];
            let previous_state_index = changed[i + 1];
            let new_state_index = instance.region_states[region_index as usize];
            emit_signal(
                &signals.on_state_change,
                &StatechartStateChangeEvent {
                    region_index,
                    previous_state_index,
                    state_index: new_state_index,
                },
            );
            i += 2;
        }
    }

    return changed_region_count;
}

pub fn create_statechart_instance(chart: &Statechart) -> StatechartInstance {
    let mut out: StatechartInstance = allocate_entity();
    initialize_statechart_instance(&mut out, chart);
    return out;
}

// Explain what the next advance sees in one region without mutating the instance.
pub fn explain_statechart_transition(
    instance: &StatechartInstance,
    region_index: i32,
) -> StatechartTransitionExplanation {
    if region_index < 0 || region_index as usize >= instance.chart.regions.len() {
        return invalid_region_explanation(region_index);
    }
    let ri = region_index as usize;
    let region = &instance.chart.regions[ri];

    let source_state_index = instance.region_states[ri];
    if source_state_index < 0 || source_state_index as usize >= region.states.len() {
        return invalid_region_explanation(region_index);
    }
    let state = &region.states[source_state_index as usize];

    let active_transition_index = instance.region_transitions[ri];
    if active_transition_index >= 0 {
        let active = state.transitions.get(active_transition_index as usize);
        let Some(active) = active else {
            return invalid_region_explanation(region_index);
        };
        return StatechartTransitionExplanation {
            blend: instance.region_blend[ri],
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
        let condition_index = get_first_unmet_condition(instance, transition);
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

pub fn fire_statechart_trigger(instance: &mut StatechartInstance, input_index: i32) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Trigger);
    instance.input_values[input_index as usize] = 1.0;
}

// Return the first input with `name`, or -1 when it is absent.
pub fn get_statechart_input_index(chart: &Statechart, name: &str) -> i32 {
    for input_index in 0..chart.inputs.len() {
        if chart.inputs[input_index].name.as_deref() == Some(name) {
            return input_index as i32;
        }
    }
    return -1;
}

// Return one concurrent region's target-state blend weight in [0, 1], or -1 for an invalid region.
pub fn get_statechart_region_blend(instance: &StatechartInstance, region_index: i32) -> f32 {
    if region_index >= 0 && (region_index as usize) < instance.region_blend.len() {
        return instance.region_blend[region_index as usize];
    }
    return -1.0;
}

// Return one concurrent region's current source-state index, or -1 for an invalid region.
pub fn get_statechart_region_state(instance: &StatechartInstance, region_index: i32) -> i32 {
    if region_index >= 0 && (region_index as usize) < instance.region_states.len() {
        return instance.region_states[region_index as usize];
    }
    return -1;
}

// Allocate the mutable per-actor half of `chart`; authored indices/kinds fail at this seam.
pub fn initialize_statechart_instance(out: &mut StatechartInstance, chart: &Statechart) {
    validate_statechart(chart);

    let mut input_values: Vec<f64> = vec![0.0; chart.inputs.len()];
    for input_index in 0..chart.inputs.len() {
        let input = &chart.inputs[input_index];
        input_values[input_index] = if input.kind == StatechartInputKind::Boolean {
            if input.initial_value == 0.0 {
                0.0
            } else {
                1.0
            }
        } else {
            input.initial_value
        };
    }

    let region_count = chart.regions.len();
    let mut region_states: Vec<i32> = vec![0; region_count];
    for region_index in 0..region_count {
        region_states[region_index] = chart.regions[region_index].initial_state_index;
    }

    out.chart = chart.clone();
    out.duration_guard = None;
    out.input_values = input_values.into_boxed_slice();
    out.region_blend = vec![0.0f32; region_count].into_boxed_slice();
    out.region_duration = vec![0.0f64; region_count].into_boxed_slice();
    out.region_elapsed = vec![0.0f64; region_count].into_boxed_slice();
    out.region_states = region_states.into_boxed_slice();
    out.region_transitions = vec![-1i32; region_count].into_boxed_slice();
    out.signals = None;
}

// Write a Boolean input as the numeric 0/1 vocabulary.
pub fn set_statechart_boolean_input(instance: &mut StatechartInstance, input_index: i32, value: bool) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Boolean);
    instance.input_values[input_index as usize] = if value { 1.0 } else { 0.0 };
}

// Write a Number input.
pub fn set_statechart_number_input(instance: &mut StatechartInstance, input_index: i32, value: f64) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Number);
    instance.input_values[input_index as usize] = value;
}

// Supply the current state's duration for exit-time evaluation. Zero marks it unavailable.
pub fn set_statechart_region_duration(instance: &mut StatechartInstance, region_index: i32, duration: f64) {
    if region_index < 0 || region_index as usize >= instance.region_duration.len() {
        throw_range_error(&format!(
            "Statechart region index {} is out of range",
            region_index
        ));
    }
    if !duration.is_finite() || duration < 0.0 {
        throw_range_error("Statechart region duration must be finite and non-negative");
    }
    instance.region_duration[region_index as usize] = duration;
}

// ============================================================================
// Private helpers
// ============================================================================

fn advance_statechart_region(
    instance: &mut StatechartInstance,
    region_index: i32,
    delta_time_ms: f64,
) -> bool {
    let ri = region_index as usize;
    let source_state_index = instance.region_states[ri];
    let region = &instance.chart.regions[ri];
    let source_state = region.states.get(source_state_index as usize);
    let Some(source_state) = source_state.filter(|state| !state.kind.is_empty()) else {
        throw_range_error(&format!(
            "Statechart region {} has an invalid active state",
            region_index
        ))
    };
    instance.region_elapsed[ri] += delta_time_ms;

    let mut transition_index = instance.region_transitions[ri];
    if transition_index >= 0 {
        if source_state.transitions.get(transition_index as usize).is_none() {
            throw_range_error(&format!(
                "Statechart region {} has an invalid active transition",
                region_index
            ));
        }
    } else {
        transition_index = get_ready_transition_index(instance, region_index);
        if transition_index < 0 {
            return false;
        }
        instance.region_transitions[ri] = transition_index;
        instance.region_blend[ri] = 0.0;
    }

    let transition = &instance.chart.regions[ri].states[source_state_index as usize].transitions
        [transition_index as usize];
    let duration_ms = if transition.duration_ms.is_finite() && transition.duration_ms > 0.0 {
        transition.duration_ms
    } else {
        0.0
    };
    let blend = if duration_ms == 0.0 {
        1.0
    } else {
        (instance.region_blend[ri] + (delta_time_ms / duration_ms) as f32).min(1.0)
    };
    instance.region_blend[ri] = blend;
    if blend < 1.0 {
        return false;
    }

    let target = transition.target_state_index;
    instance.region_states[ri] = target;
    instance.region_transitions[ri] = -1;
    instance.region_blend[ri] = 0.0;
    instance.region_duration[ri] = 0.0;
    instance.region_elapsed[ri] = 0.0;
    return true;
}

fn assert_statechart_input_kind(
    instance: &StatechartInstance,
    input_index: i32,
    expected_kind: StatechartInputKind,
) {
    let input = if input_index >= 0 {
        instance.chart.inputs.get(input_index as usize)
    } else {
        None
    };
    let Some(input) = input else {
        throw_range_error(&format!(
            "Statechart input index {} is out of range",
            input_index
        ))
    };
    if input.kind != expected_kind {
        throw_type_error(&format!(
            "Statechart input {} is {}, not {}",
            input_index,
            get_statechart_input_kind_string(input.kind),
            get_statechart_input_kind_string(expected_kind)
        ));
    }
}

fn clear_statechart_triggers(instance: &mut StatechartInstance) {
    for input_index in 0..instance.chart.inputs.len() {
        if instance.chart.inputs[input_index].kind == StatechartInputKind::Trigger {
            instance.input_values[input_index] = 0.0;
        }
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

fn get_first_unmet_condition(instance: &StatechartInstance, transition: &StatechartTransition) -> i32 {
    for condition_index in 0..transition.conditions.len() {
        let condition = &transition.conditions[condition_index];
        let input = if condition.input_index >= 0 {
            instance.chart.inputs.get(condition.input_index as usize)
        } else {
            None
        };
        let Some(input) = input else {
            return condition_index as i32;
        };
        let input_value = if condition.input_index >= 0 {
            instance
                .input_values
                .get(condition.input_index as usize)
                .copied()
                .unwrap_or(0.0)
        } else {
            0.0
        };
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

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn get_ready_transition_index(instance: &StatechartInstance, region_index: i32) -> i32 {
    let ri = region_index as usize;
    let region = &instance.chart.regions[ri];
    let state = &region.states[instance.region_states[ri] as usize];
    for transition_index in 0..state.transitions.len() {
        let transition = &state.transitions[transition_index];
        if get_first_unmet_condition(instance, transition) >= 0 {
            continue;
        }
        let exit_status = get_statechart_exit_status(instance, ri, transition);
        if exit_status == StatechartTransitionStatus::ExitTimePending {
            continue;
        }
        if exit_status == StatechartTransitionStatus::MissingRegionDuration {
            let explanation = StatechartTransitionExplanation {
                blend: 0.0,
                condition_index: -1,
                region_index,
                source_state_index: instance.region_states[ri],
                status: StatechartTransitionStatus::MissingRegionDuration,
                target_state_index: transition.target_state_index,
                transition_index: transition_index as i32,
            };
            if let Some(ref guard) = instance.duration_guard {
                guard(instance, &explanation);
            }
        }
        return transition_index as i32;
    }
    return -1;
}

fn get_statechart_exit_status(
    instance: &StatechartInstance,
    region_index: usize,
    transition: &StatechartTransition,
) -> StatechartTransitionStatus {
    if transition.exit_time_ratio < 0.0 {
        return StatechartTransitionStatus::Ready;
    }
    let duration = instance.region_duration[region_index];
    if duration <= 0.0 {
        return StatechartTransitionStatus::MissingRegionDuration;
    }
    return if instance.region_elapsed[region_index] / duration >= transition.exit_time_ratio {
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
                    let input_index = condition.input_index;
                    if input_index < 0 || input_index as usize >= chart.inputs.len() {
                        throw_range_error(&format!(
                            "Statechart region {} state {} transition {} has an invalid input",
                            region_index, state_index, transition_index
                        ));
                    }
                    if get_statechart_comparison_string(condition.comparison).is_empty() {
                        throw_type_error(&format!(
                            "Statechart region {} state {} transition {} has an invalid comparison",
                            region_index, state_index, transition_index
                        ));
                    }
                }
            }
        }
    }
}

// ============================================================================
// D18 sugar: public-lane methods delegate to the free-function contract
// ============================================================================

impl Statechart {
    pub fn get_input_index(&self, name: &str) -> i32 {
        return get_statechart_input_index(self, name);
    }
}

impl StatechartInstance {
    pub fn new(chart: &Statechart) -> StatechartInstance {
        return create_statechart_instance(chart);
    }

    // flight-lint: allow(f64) D1: frame delta and operation time are millisecond numbers
    pub fn advance(&mut self, delta_time: f64) -> i32 {
        return advance_statechart_instance(self, delta_time);
    }

    pub fn disable_guards(&mut self) {
        crate::enable_statechart_guards::disable_statechart_guards(self);
    }

    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    pub fn enable_guards(
        &mut self,
        log_state: &LogStateRef,
        clock: std::sync::Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        crate::enable_statechart_guards::enable_statechart_guards(self, log_state, clock);
    }

    pub fn enable_signals(&mut self) -> StatechartSignals {
        return crate::statechart_signals::enable_statechart_signals(self);
    }

    pub fn explain_transition(&self, region_index: i32) -> StatechartTransitionExplanation {
        return explain_statechart_transition(self, region_index);
    }

    pub fn fire_trigger(&mut self, input_index: i32) {
        fire_statechart_trigger(self, input_index);
    }

    pub fn get_signals(&self) -> Option<StatechartSignals> {
        return crate::statechart_signals::get_statechart_signals(self);
    }

    pub fn guards_enabled(&self) -> bool {
        return crate::enable_statechart_guards::are_statechart_guards_enabled(self);
    }

    pub fn region_blend(&self, region_index: i32) -> f32 {
        return get_statechart_region_blend(self, region_index);
    }

    pub fn region_state(&self, region_index: i32) -> i32 {
        return get_statechart_region_state(self, region_index);
    }

    pub fn set_boolean_input(&mut self, input_index: i32, value: bool) {
        set_statechart_boolean_input(self, input_index, value);
    }

    // flight-lint: allow(f64) D1: authored numeric input value
    pub fn set_number_input(&mut self, input_index: i32, value: f64) {
        set_statechart_number_input(self, input_index, value);
    }

    // flight-lint: allow(f64) D1: region duration is a millisecond number
    pub fn set_region_duration(&mut self, region_index: i32, duration: f64) {
        set_statechart_region_duration(self, region_index, duration);
    }
}


