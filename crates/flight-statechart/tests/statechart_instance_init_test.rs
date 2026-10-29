//! flight-compiler: target-native

use flight_statechart::contract::{
    StatechartAtomicStateKind, StatechartInstanceRaw, StatechartRaw, StatechartRegion,
    StatechartState, initialize_statechart_instance,
};

fn empty_chart() -> StatechartRaw {
    return StatechartRaw {
        inputs: Vec::new(),
        name: None,
        regions: vec![StatechartRegion {
            initial_state_index: 0,
            name: None,
            states: vec![StatechartState {
                kind: StatechartAtomicStateKind.to_string(),
                name: None,
                transitions: Vec::new(),
            }],
        }],
    };
}

#[test]
fn initializes_caller_allocated_state_and_nullable_slots() {
    let chart = std::sync::Arc::new(std::sync::RwLock::new(empty_chart()));
    let mut out: StatechartInstanceRaw = flight_entity::allocate_entity();
    initialize_statechart_instance(&mut out, &chart);
    assert_eq!(*out.chart.read().unwrap(), *chart.read().unwrap());
    assert!(out.duration_guard.is_none());
    assert!(out.signals.is_none());
}
