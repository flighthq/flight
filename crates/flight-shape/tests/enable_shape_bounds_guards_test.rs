use flight_shape::contract::*;

use crate::support::*;

mod are_shape_bounds_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_a_guard_is_installed() {
        let state = create_shape_bounds_state();
        assert!(!are_shape_bounds_guards_enabled(&state));
        enable_shape_bounds_guards(&state, &log_state(), 0.0);
        assert!(are_shape_bounds_guards_enabled(&state));
    }
}

mod disable_shape_bounds_guards {
    use super::*;

    #[test]
    fn removes_the_installed_guard() {
        let state = create_shape_bounds_state();
        enable_shape_bounds_guards(&state, &log_state(), 0.0);
        disable_shape_bounds_guards(&state);
        assert!(!are_shape_bounds_guards_enabled(&state));
    }
}

mod enable_shape_bounds_guards {
    use super::*;

    #[test]
    fn installs_a_guard_with_the_injected_log_state() {
        let state = create_shape_bounds_state();
        enable_shape_bounds_guards(&state, &log_state(), 0.0);
        assert!(are_shape_bounds_guards_enabled(&state));
    }
}

mod guards_source_parity {
    use super::*;
    use flight_log::{LogData, LogEntry, LogValue, add_log_sink};
    use std::sync::{Arc, Mutex};

    #[test]
    fn disable_restores_the_silent_production_default() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        let log = log_state();
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let recorder = entries.clone();
        add_log_sink(
            &log,
            Arc::new(move |entry: &LogEntry| recorder.lock().unwrap().push(entry.clone())),
        );
        enable_shape_bounds_guards(&state, &log, 0.0);
        disable_shape_bounds_guards(&state);
        let shape = shape_with_state(state, vec![string("__test.guard-miss__"), number(0.0)]);
        let mut out = empty_rect();
        compute_shape_bounds_rectangle(&mut out, &*shape.read().unwrap(), None);
        assert!(entries.lock().unwrap().is_empty());
    }

    #[test]
    fn names_a_missing_key_once_and_points_to_the_plain_explanation_query() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        let log = log_state();
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let recorder = entries.clone();
        add_log_sink(
            &log,
            Arc::new(move |entry: &LogEntry| recorder.lock().unwrap().push(entry.clone())),
        );
        enable_shape_bounds_guards(&state, &log, 0.0);
        let shape = shape_with_state(state, vec![string("__test.guard-miss__"), number(0.0)]);
        let mut first = empty_rect();
        let mut second = empty_rect();
        compute_shape_bounds_rectangle(&mut first, &*shape.read().unwrap(), None);
        compute_shape_bounds_rectangle(&mut second, &*shape.read().unwrap(), None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("shape"));
        let LogData::Record(record) = &entries[0].data else {
            panic!("expected a record entry");
        };
        assert!(
            matches!(record.get("missingCommandKey"), Some(LogValue::Str(value)) if value == "__test.guard-miss__")
        );
        assert!(matches!(record.get("mode"), Some(LogValue::Str(value)) if value == "ink"));
        let LogValue::Str(message) = record.get("message").expect("message") else {
            panic!("expected message text");
        };
        assert!(message.contains("explainShapeBounds"));
    }
}
