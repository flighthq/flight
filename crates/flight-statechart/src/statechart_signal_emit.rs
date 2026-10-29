//! flight-compiler: target-native

use flight_signals::emit_signal;

use crate::types::StatechartSignals;

pub fn emit_statechart_state_change(
    signals: &StatechartSignals,
    region_index: i32,
    previous_state_index: i32,
    state_index: i32,
) {
    emit_signal(
        &signals.on_state_change,
        &(region_index, previous_state_index, state_index),
    );
}
