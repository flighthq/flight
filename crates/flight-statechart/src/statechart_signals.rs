//! flight-compiler: target-native

use flight_entity::{Ref, allocate_entity};
use flight_signals::create_signal;

use crate::types::*;

pub fn initialize_statechart_signals(out: &mut StatechartSignals) {
    out.on_state_change = create_signal();
}

pub fn enable_statechart_signals(instance: &Ref<StatechartInstanceRaw>) -> StatechartSignals {
    let mut current = instance.write().unwrap();
    if let Some(ref signals) = current.signals {
        return signals.clone();
    }
    let mut out: StatechartSignals = allocate_entity();
    initialize_statechart_signals(&mut out);
    current.signals = Some(out.clone());
    return out;
}

pub fn get_statechart_signals(instance: &Ref<StatechartInstanceRaw>) -> Option<StatechartSignals> {
    return instance.read().unwrap().signals.clone();
}
