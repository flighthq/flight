use std::sync::{Arc, Mutex};

use flight_log::{LogEntry, LogStateRef, create_log_state, set_log_sink};
use flight_skeleton2d::contract::*;

use crate::support::*;

struct Fixture {
    log_state: LogStateRef,
    guards: Skeleton2DGuardState,
    entries: Arc<Mutex<Vec<LogEntry>>>,
}

fn fixture() -> Fixture {
    let log_state = Arc::new(std::sync::RwLock::new(create_log_state()));
    let entries = Arc::new(Mutex::new(Vec::new()));
    let captured = entries.clone();
    set_log_sink(
        &log_state,
        Some(Arc::new(move |entry: &LogEntry| {
            captured.lock().unwrap().push(entry.clone());
        })),
    );
    return Fixture {
        log_state,
        guards: empty_guards(),
        entries,
    };
}

mod disable_skeleton_2d_guards {
    use super::*;

    #[test]
    fn silences_both_cases_again() {
        let mut fixture = fixture();
        let log = fixture.log_state.clone();
        enable_skeleton_2d_guards(&mut fixture.guards, &log, 0.0);
        disable_skeleton_2d_guards(&mut fixture.guards);
        report_skeleton_2d_coerced_interpolation(&fixture.guards, "Attachment", "Linear", "Step");
        report_skeleton_2d_deform_length_mismatch(&fixture.guards, "MeshAttachment2D", 2, 4);
        assert!(fixture.entries.lock().unwrap().is_empty());
    }
}

mod enable_skeleton_2d_guards {
    use super::*;

    #[test]
    fn says_nothing_at_all_until_a_caller_opts_in() {
        let mut fixture = fixture();
        report_skeleton_2d_coerced_interpolation(&fixture.guards, "Attachment", "Linear", "Step");
        assert!(fixture.entries.lock().unwrap().is_empty());
        let log = fixture.log_state.clone();
        enable_skeleton_2d_guards(&mut fixture.guards, &log, 0.0);
        report_skeleton_2d_coerced_interpolation(&fixture.guards, "Attachment", "Linear", "Step");
        assert_eq!(fixture.entries.lock().unwrap().len(), 1);
    }

    #[test]
    fn names_what_was_stated_and_what_actually_happens() {
        let mut fixture = fixture();
        let log = fixture.log_state.clone();
        enable_skeleton_2d_guards(&mut fixture.guards, &log, 0.0);
        report_skeleton_2d_coerced_interpolation(&fixture.guards, "Attachment", "Linear", "Step");
        let entries = fixture.entries.lock().unwrap();
        let text = format!("{:?}", entries[0]);
        assert!(text.contains("Linear") && text.contains("Step"));
    }

    #[test]
    fn reports_both_lengths_on_a_deform_mismatch() {
        let mut fixture = fixture();
        let log = fixture.log_state.clone();
        enable_skeleton_2d_guards(&mut fixture.guards, &log, 0.0);
        report_skeleton_2d_deform_length_mismatch(&fixture.guards, "MeshAttachment2D", 2, 4);
        let text = format!("{:?}", fixture.entries.lock().unwrap()[0]);
        assert!(text.contains('2') && text.contains('4'));
    }

    #[test]
    fn installs_one_guard_however_many_times_it_is_enabled() {
        let mut fixture = fixture();
        let log = fixture.log_state.clone();
        enable_skeleton_2d_guards(&mut fixture.guards, &log, 0.0);
        enable_skeleton_2d_guards(&mut fixture.guards, &log, 0.0);
        assert!(fixture.guards.coerced_interpolation.is_some());
        assert!(fixture.guards.deform_length.is_some());
    }
}
