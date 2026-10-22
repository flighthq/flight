use std::sync::{Arc, RwLock};

use flight_log::{
    LogEntry, LogStateRef, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_scene2d_resources::contract::*;

use crate::guard_state;

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn notice() -> Scene2DResourceFailureNotice {
    return Scene2DResourceFailureNotice {
        operation: Scene2DResourceFailureOperation::ResolveScene2DResources,
        reason: Scene2DResourceFailureReason::RequiredSlotsUnresolved,
        total: 2,
        unresolved: 1,
        url: None,
    };
}

mod are_scene2d_resource_failure_guards_enabled {
    use super::*;

    #[test]
    fn tracks_the_caller_owned_opt_in_hook() {
        let guard_state = guard_state();
        let log_state = log_state();
        assert!(!are_scene2d_resource_failure_guards_enabled(&guard_state));
        enable_scene2d_resource_failure_guards(&guard_state, &log_state, Arc::new(|| 0.0));
        assert!(are_scene2d_resource_failure_guards_enabled(&guard_state));
        disable_scene2d_resource_failure_guards(&guard_state);
        assert!(!are_scene2d_resource_failure_guards_enabled(&guard_state));
    }
}

mod disable_scene2d_resource_failure_guards {
    use super::*;

    #[test]
    fn restores_silent_sentinel_handling() {
        let guard_state = guard_state();
        let log_state = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        enable_scene2d_resource_failure_guards(&guard_state, &log_state, Arc::new(|| 0.0));
        disable_scene2d_resource_failure_guards(&guard_state);
        report_scene2d_resource_failure(&guard_state, &notice());
        let mut entries: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert!(entries.is_empty());
    }
}

mod enable_scene2d_resource_failure_guards {
    use super::*;

    #[test]
    fn warns_once_with_aggregate_counts_while_preserving_the_sentinel() {
        let guard_state = guard_state();
        let log_state = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        enable_scene2d_resource_failure_guards(&guard_state, &log_state, Arc::new(|| 12.0));
        report_scene2d_resource_failure(&guard_state, &notice());
        report_scene2d_resource_failure(&guard_state, &notice());
        let mut entries: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("scene2d-resources"));
        assert_eq!(entries[0].timestamp_ms, 12.0);
    }
}
