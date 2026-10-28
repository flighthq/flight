use crate::support::*;
use flight_log::{
    LogData, LogEntry, LogLevel, LogStateRef, LogValue, create_log_state, set_log_sink,
};
use flight_node::{NodeRef, invalidate_node_local_transform};
use flight_skeleton3d::contract::*;
use std::sync::{Arc, Mutex, RwLock};
fn capture() -> (LogStateRef, Arc<Mutex<Vec<LogEntry>>>) {
    let log = Arc::new(RwLock::new(create_log_state()));
    let entries = Arc::new(Mutex::new(Vec::new()));
    let sink = entries.clone();
    set_log_sink(
        &log,
        Some(Arc::new(move |entry| {
            sink.lock().unwrap().push(entry.clone())
        })),
    );
    return (log, entries);
}
fn collapse(state: &Skeleton3DGuardStateRef) {
    let node = joint(0.0, 0.0, 0.0);
    node.write().unwrap().name = Some("hip".to_string());
    let mut rig = skeleton(vec![node.clone()], None);
    node.write().unwrap().scale.x = 0.0;
    let node: NodeRef = node;
    invalidate_node_local_transform(&node);
    set_skeleton3d_bind_pose(&mut rig, &mut revisions(), state);
}
mod are_skeleton3d_guards_enabled {
    use super::*;
    #[test]
    fn reports_installation_and_removal() {
        let state = guards();
        let (log, _) = capture();
        assert!(!are_skeleton3d_guards_enabled(&state));
        enable_skeleton3d_guards(&state, &log, Arc::new(|| 0.0));
        assert!(are_skeleton3d_guards_enabled(&state));
        disable_skeleton3d_guards(&state);
        assert!(!are_skeleton3d_guards_enabled(&state));
    }
}
mod disable_skeleton3d_guards {
    use super::*;
    #[test]
    fn removes_the_hook_and_leaves_the_core_silent() {
        let state = guards();
        let (log, entries) = capture();
        enable_skeleton3d_guards(&state, &log, Arc::new(|| 0.0));
        disable_skeleton3d_guards(&state);
        collapse(&state);
        assert!(entries.lock().unwrap().is_empty());
    }
}
mod enable_skeleton3d_guards {
    use super::*;
    #[test]
    fn warns_once_by_joint_index_with_the_name_and_operation_timestamp() {
        let state = guards();
        let (log, entries) = capture();
        enable_skeleton3d_guards(&state, &log, Arc::new(|| 42.0));
        collapse(&state);
        collapse(&state);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].timestamp_ms, 42.0);
        let LogData::Record(data) = &entries[0].data else {
            panic!("record expected");
        };
        assert!(matches!(data.get("joint"),Some(LogValue::Str(name)) if name=="hip"));
        assert!(matches!(
            data.get("jointIndex"),
            Some(LogValue::Number(0.0))
        ));
        assert!(
            matches!(data.get("message"),Some(LogValue::Str(message)) if message.contains("will not deform"))
        );
    }
    #[test]
    fn stays_silent_for_invertible_joints_and_does_not_install_into_another_guard_state() {
        let state = guards();
        let (log, entries) = capture();
        enable_skeleton3d_guards(&state, &log, Arc::new(|| 0.0));
        set_skeleton3d_bind_pose(
            &mut skeleton(vec![joint(0.0, 0.0, 0.0)], None),
            &mut revisions(),
            &state,
        );
        collapse(&guards());
        assert!(entries.lock().unwrap().is_empty());
    }
}
