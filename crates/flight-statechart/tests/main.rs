mod enable_statechart_guards_test;
mod statechart_signals_test;
mod statechart_test;

pub(crate) fn log_state() -> flight_log::LogStateRef {
    return std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
}

pub(crate) fn create_instance(chart: &flight_statechart::Statechart) -> flight_entity::Ref<flight_statechart::StatechartInstance> {
    let chart_ref = std::sync::Arc::new(std::sync::RwLock::new(chart.clone()));
    return flight_statechart::create_statechart_instance(&chart_ref);
}

pub(crate) fn guard_state() -> flight_statechart::StatechartGuardStateRef {
    return std::sync::Arc::new(std::sync::RwLock::new(flight_statechart::StatechartGuardState {
        chart_ids: Vec::new(),
        next_chart_id: 1,
    }));
}

