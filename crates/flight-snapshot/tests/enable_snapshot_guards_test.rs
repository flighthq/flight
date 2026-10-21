use std::sync::{Arc, RwLock};

use flight_log::{
    LogStateRef, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_snapshot::contract::*;

use crate::support::*;

fn logs() -> (LogStateRef, flight_log::MemoryLogSink) {
    let log_state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&log_state, sink.sink.clone());
    return (log_state, sink);
}

mod disable_snapshot_guards {
    use super::*;

    #[test]
    fn stops_the_guard_from_inspecting_later_captures() {
        let (log_state, sink) = logs();
        let mut guards = guards();
        enable_snapshot_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        disable_snapshot_guards(&mut guards);
        assert!(guards.capture_guard.is_none());
        capture_snapshot(&guards, &state(1.0, 0.0, &[]));
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }
}

mod enable_snapshot_guards {
    use super::*;

    #[test]
    fn says_nothing_for_a_plain_acyclic_source() {
        let (log_state, sink) = logs();
        let mut guards = guards();
        enable_snapshot_guards(&mut guards, &log_state, Arc::new(|| 0.0));
        assert!(guards.capture_guard.is_some());
        capture_snapshot(
            &guards,
            &Roster {
                players: vec![Player { health: 1.0 }],
            },
        );
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }
}
