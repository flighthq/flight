use flight_entity::allocate_entity;
use flight_signals::create_signal;

use crate::types::*;

// Allocate the optional observer group on first use. The nullable slot lives on the mutable
// instance, never on the immutable chart.
pub fn enable_statechart_signals(instance: &mut StatechartInstance) -> StatechartSignals {
    if let Some(ref signals) = instance.signals {
        return signals.clone();
    }
    let mut out: StatechartSignals = allocate_entity();
    initialize_statechart_signals(&mut out);
    instance.signals = Some(out.clone());
    return out;
}

// Read the optional observer group without allocating it.
pub fn get_statechart_signals(instance: &StatechartInstance) -> Option<StatechartSignals> {
    return instance.signals.clone();
}

pub fn initialize_statechart_signals(out: &mut StatechartSignals) {
    out.on_state_change = create_signal();
}
