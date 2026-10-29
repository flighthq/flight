//! flight-compiler: target-native

use flight_entity::Ref;

use crate::types::{StatechartInstanceRaw, StatechartRaw};

#[allow(clippy::too_many_arguments)]
pub fn initialize_statechart_instance_fields(
    out: &mut StatechartInstanceRaw,
    chart: &Ref<StatechartRaw>,
    input_values: Box<[f64]>,
    region_blend: Box<[f32]>,
    region_duration: Box<[f64]>,
    region_elapsed: Box<[f64]>,
    region_states: Box<[i32]>,
    region_transitions: Box<[i32]>,
) {
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
