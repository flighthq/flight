mod enable_statechart_guards_test;
mod statechart_signals_test;
mod statechart_test;

pub(crate) fn log_state() -> flight_log::LogStateRef {
    return std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
}
