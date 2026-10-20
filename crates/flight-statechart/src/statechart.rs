use std::any::Any;
use std::rc::Rc;

use flight_signals::emit_signal;

use crate::types::*;

// Advance every concurrent region by `delta_time` milliseconds and return how many
// reached a new state. Each region changes at most once per call. Trigger inputs are
// edge latches shared by all regions for the whole pass, then cleared, so one fired
// trigger can independently drive several regions.
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

    clear_statechart_triggers(instance);

    if let (Some(changed), Some(signals)) = (&changed_regions, &instance.signals) {
        let mut i = 0;
        while i < changed.len() {
            let region_index = changed[i];
            let previous_state_index = changed[i + 1];
            let new_state_index = instance.region_states[region_index as usize];
            emit_signal(
                &signals.on_state_change,
                Rc::new((region_index, previous_state_index, new_state_index)) as Rc<dyn Any>,
            );
            i += 2;
        }
    }

    return changed_region_count;
}

pub fn create_statechart_instance(chart: &Statechart) -> StatechartInstance {
    let mut out = StatechartInstance::default();
    initialize_statechart_instance(&mut out, chart);
    return out;
}

// Explain what the next advance sees in one region. Reports an active blend, the first
// ready transition, or the first authored transition's blocking condition/exit time
// without mutating the instance.
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
        if active_transition_index as usize >= state.transitions.len() {
            return invalid_region_explanation(region_index);
        }
        let active_transition = &state.transitions[active_transition_index as usize];
        return StatechartTransitionExplanation {
            blend: instance.region_blend[ri],
            condition_index: -1,
            region_index,
            source_state_index,
            status: StatechartTransitionStatus::Transitioning,
            target_state_index: active_transition.target_state_index,
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

// Latch a Trigger input for the next whole-region advance.
pub fn fire_statechart_trigger(instance: &mut StatechartInstance, input_index: i32) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Trigger);
    instance.input_values[input_index as usize] = 1.0;
}

// Return the first input with `name`, or -1 when it is absent.
pub fn get_statechart_input_index(chart: &Statechart, name: &str) -> i32 {
    for input_index in 0..chart.inputs.len() {
        if chart.inputs[input_index].name == name {
            return input_index as i32;
        }
    }
    return -1;
}

// Return one concurrent region's target-state blend weight in [0, 1], or -1 for an
// invalid region.
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

// Allocate the mutable per-actor half of `chart`. The chart itself is cloned; input and
// region state live in independent arrays so one chart definition can drive many actors.
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
    let region_blend: Vec<f32> = vec![0.0; region_count];
    let region_duration: Vec<f64> = vec![0.0; region_count];
    let region_elapsed: Vec<f64> = vec![0.0; region_count];
    let mut region_states: Vec<i32> = vec![0; region_count];
    let region_transitions: Vec<i32> = vec![-1; region_count];

    for region_index in 0..region_count {
        region_states[region_index] = chart.regions[region_index].initial_state_index;
    }

    out.chart = chart.clone();
    out.duration_guard = None;
    out.input_values = input_values;
    out.region_blend = region_blend;
    out.region_duration = region_duration;
    out.region_elapsed = region_elapsed;
    out.region_states = region_states;
    out.region_transitions = region_transitions;
    out.signals = None;
}

// Write a Boolean input as the numeric 0/1 vocabulary.
pub fn set_statechart_boolean_input(
    instance: &mut StatechartInstance,
    input_index: i32,
    value: bool,
) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Boolean);
    instance.input_values[input_index as usize] = if value { 1.0 } else { 0.0 };
}

// Write a Number input.
pub fn set_statechart_number_input(
    instance: &mut StatechartInstance,
    input_index: i32,
    value: f64,
) {
    assert_statechart_input_kind(instance, input_index, StatechartInputKind::Number);
    instance.input_values[input_index as usize] = value;
}

// Supply the current state's duration for exit-time evaluation, in the same millisecond
// unit as advance_statechart_instance.
pub fn set_statechart_region_duration(
    instance: &mut StatechartInstance,
    region_index: i32,
    duration: f64,
) {
    if region_index < 0 || region_index as usize >= instance.region_duration.len() {
        panic!(
            "Statechart region index {} is out of range",
            region_index
        );
    }
    if !duration.is_finite() || duration < 0.0 {
        panic!("Statechart region duration must be finite and non-negative");
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
    let source_state = &instance.chart.regions[ri].states[source_state_index as usize];
    if source_state.kind.is_empty() {
        panic!(
            "Statechart region {} has an invalid active state",
            region_index
        );
    }
    instance.region_elapsed[ri] += delta_time_ms;

    let mut transition_index = instance.region_transitions[ri];
    if transition_index >= 0 {
        if transition_index as usize >= source_state.transitions.len() {
            panic!(
                "Statechart region {} has an invalid active transition",
                region_index
            );
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
        1.0_f32
    } else {
        let progress = instance.region_blend[ri] as f64 + delta_time_ms / duration_ms;
        if progress > 1.0 {
            1.0_f32
        } else {
            progress as f32
        }
    };
    instance.region_blend[ri] = blend;
    if blend < 1.0 {
        return false;
    }

    instance.region_states[ri] = transition.target_state_index;
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
    if input_index < 0 || input_index as usize >= instance.chart.inputs.len() {
        panic!(
            "Statechart input index {} is out of range",
            input_index
        );
    }
    let input = &instance.chart.inputs[input_index as usize];
    if input.kind != expected_kind {
        panic!(
            "Statechart input {} is {:?}, not {:?}",
            input_index, input.kind, expected_kind
        );
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

fn get_first_unmet_condition(
    instance: &StatechartInstance,
    transition: &StatechartTransition,
) -> i32 {
    for condition_index in 0..transition.conditions.len() {
        let condition = &transition.conditions[condition_index];
        let ii = condition.input_index as usize;
        if ii >= instance.chart.inputs.len() {
            return condition_index as i32;
        }
        let input = &instance.chart.inputs[ii];
        let input_value = instance.input_values[ii];
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
            let guard = instance.duration_guard;
            if let Some(g) = guard {
                let explanation = StatechartTransitionExplanation {
                    blend: 0.0,
                    condition_index: -1,
                    region_index,
                    source_state_index: instance.region_states[ri],
                    status: StatechartTransitionStatus::MissingRegionDuration,
                    target_state_index: transition.target_state_index,
                    transition_index: transition_index as i32,
                };
                g(instance, &explanation);
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
    if instance.region_elapsed[region_index] / duration >= transition.exit_time_ratio {
        return StatechartTransitionStatus::Ready;
    }
    return StatechartTransitionStatus::ExitTimePending;
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
            panic!(
                "Statechart input {} has unknown kind {:?}",
                input_index, kind
            );
        }
    }

    for region_index in 0..chart.regions.len() {
        let region = &chart.regions[region_index];
        if region.initial_state_index < 0
            || region.initial_state_index as usize >= region.states.len()
        {
            panic!(
                "Statechart region {} has an invalid initialStateIndex",
                region_index
            );
        }
        for state_index in 0..region.states.len() {
            let state = &region.states[state_index];
            if state.kind.is_empty() {
                panic!(
                    "Statechart region {} state {} has an invalid kind",
                    region_index, state_index
                );
            }
            for transition_index in 0..state.transitions.len() {
                let transition = &state.transitions[transition_index];
                if !transition.duration_ms.is_finite() || transition.duration_ms < 0.0 {
                    panic!(
                        "Statechart region {} state {} transition {} has an invalid duration",
                        region_index, state_index, transition_index
                    );
                }
                if !transition.exit_time_ratio.is_finite() || transition.exit_time_ratio < -1.0 {
                    panic!(
                        "Statechart region {} state {} transition {} has an invalid exit time",
                        region_index, state_index, transition_index
                    );
                }
                if transition.target_state_index < 0
                    || transition.target_state_index as usize >= region.states.len()
                {
                    panic!(
                        "Statechart region {} state {} transition {} has an invalid target",
                        region_index, state_index, transition_index
                    );
                }
                for condition_index in 0..transition.conditions.len() {
                    let condition = &transition.conditions[condition_index];
                    let ii = condition.input_index;
                    if ii < 0 || ii as usize >= chart.inputs.len() {
                        panic!(
                            "Statechart region {} state {} transition {} has an invalid input",
                            region_index, state_index, transition_index
                        );
                    }
                    let valid_comparison = matches!(
                        condition.comparison,
                        StatechartComparison::Equal
                            | StatechartComparison::GreaterThan
                            | StatechartComparison::GreaterThanOrEqual
                            | StatechartComparison::LessThan
                            | StatechartComparison::LessThanOrEqual
                            | StatechartComparison::NotEqual
                    );
                    if !valid_comparison {
                        panic!(
                            "Statechart region {} state {} transition {} has an invalid comparison",
                            region_index, state_index, transition_index
                        );
                    }
                }
            }
        }
    }
}
