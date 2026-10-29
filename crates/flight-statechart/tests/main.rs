pub(crate) fn log_state() -> flight_log::LogStateRef {
    return std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
}

pub(crate) fn create_instance(
    chart: &flight_statechart::Statechart,
) -> flight_entity::Ref<flight_statechart::StatechartInstance> {
    let chart_ref = std::sync::Arc::new(std::sync::RwLock::new(chart.clone()));
    return flight_statechart::create_statechart_instance(&chart_ref);
}

pub(crate) fn guard_state() -> flight_statechart::contract::StatechartGuardStateRef {
    return std::sync::Arc::new(std::sync::RwLock::new(
        flight_statechart::contract::StatechartGuardState {
            chart_ids: Vec::new(),
            next_chart_id: 1,
        },
    ));
}

#[path = "enable_statechart_guards_test.rs"]
mod flight_statechart_enable_statechart_guards_test;
#[path = "statechart_instance_init_test.rs"]
mod flight_statechart_statechart_instance_init_test;
#[path = "statechart_signals_test.rs"]
mod flight_statechart_statechart_signals_test;
#[path = "statechart_test.rs"]
mod flight_statechart_statechart_test;
