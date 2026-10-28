use crate::support::*;
use flight_log::{LogData, LogEntry, LogLevel, LogValue, create_log_state, set_log_sink};
use flight_scene3d::contract::*;
use std::sync::{Arc, Mutex, RwLock};
fn capture_log() -> (flight_log::LogStateRef, Arc<Mutex<Vec<LogEntry>>>) {
    let log = Arc::new(RwLock::new(create_log_state()));
    let entries = Arc::new(Mutex::new(Vec::new()));
    let sink = entries.clone();
    set_log_sink(
        &log,
        Some(Arc::new(move |e| sink.lock().unwrap().push(e.clone()))),
    );
    return (log, entries);
}
fn orient_singular(state: &Scene3DGuardStateRef) {
    let b = create_billboard(test_geometry(), empty_materials());
    assert!(!orient_billboard_to_camera(
        &as_node_ref(&b),
        &singular_camera(),
        state
    ));
}
mod are_scene3d_guards_enabled {
    use super::*;
    #[test]
    fn reports_installation_and_removal() {
        let state = guard_state();
        let (log, _) = capture_log();
        assert!(!are_scene3d_guards_enabled(&state));
        enable_scene3d_guards(&state, &log, Arc::new(|| 0.0));
        assert!(are_scene3d_guards_enabled(&state));
        disable_scene3d_guards(&state);
        assert!(!are_scene3d_guards_enabled(&state));
    }
}
mod disable_scene3d_guards {
    use super::*;
    #[test]
    fn leaves_core_silent_again_after_removal() {
        let state = guard_state();
        let (log, entries) = capture_log();
        enable_scene3d_guards(&state, &log, Arc::new(|| 0.0));
        disable_scene3d_guards(&state);
        orient_singular(&state);
        assert!(entries.lock().unwrap().is_empty());
    }
}
mod enable_scene3d_guards {
    use super::*;
    #[test]
    fn warns_once_with_actual_view_and_operation_time_and_names_the_arbitrary_matrix_setter() {
        let state = guard_state();
        let (log, entries) = capture_log();
        enable_scene3d_guards(&state, &log, Arc::new(|| 42.0));
        orient_singular(&state);
        orient_singular(&state);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].timestamp_ms, 42.0);
        let LogData::Record(data) = &entries[0].data else {
            panic!("record expected");
        };
        let Some(LogValue::Str(message)) = data.get("message") else {
            panic!("message expected");
        };
        assert!(message.contains("setCamera3DViewMatrix4FromMatrix4"));
        let Some(LogValue::Array(view)) = data.get("view") else {
            panic!("view expected");
        };
        assert_eq!(view.len(), 16);
    }
}
