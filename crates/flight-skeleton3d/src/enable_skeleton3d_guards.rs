use crate::skeleton3d::set_skeleton3d_bind_pose_guard;
use crate::{Skeleton3DGuardClock, Skeleton3DGuardStateRef};
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use std::collections::HashMap;
use std::sync::Arc;
// flight-lint: allow(conform-params) D5 caller-owned guard flag replaces the source module global
pub fn are_skeleton3d_guards_enabled(guard_state: &Skeleton3DGuardStateRef) -> bool {
    return guard_state.read().unwrap().enabled;
}
// flight-lint: allow(conform-params) D5 caller-owned guard slot and enabled flag replace semantic globals
pub fn disable_skeleton3d_guards(guard_state: &Skeleton3DGuardStateRef) {
    set_skeleton3d_bind_pose_guard(guard_state, None);
    guard_state.write().unwrap().enabled = false;
}
// flight-lint: allow(conform-params) D5 caller-owned guard/log state and injected operation clock replace TS module globals
pub fn enable_skeleton3d_guards(
    guard_state: &Skeleton3DGuardStateRef,
    log_state: &LogStateRef,
    clock: Skeleton3DGuardClock,
) {
    let log = log_state.clone();
    set_skeleton3d_bind_pose_guard(
        guard_state,
        Some(Arc::new(move |skeleton, index| {
            let joint = { skeleton.joints.read().unwrap().get(index).cloned() };
            let name = joint
                .as_ref()
                .and_then(|joint| joint.read().unwrap().node3d_fields().name.clone())
                .unwrap_or_else(|| "<unnamed>".to_string());
            let mut data = HashMap::new();
            data.insert("joint".to_string(), LogValue::Str(name));
            data.insert("jointIndex".to_string(), LogValue::Int(index as i64));
            data.insert("message".to_string(),LogValue::Str("setSkeleton3DBindPose: a joint has no invertible world matrix, so its inverse-bind entry was set to identity and that joint will not deform — a zero scale on the joint or an ancestor is the usual cause, and an imported rig can carry one.".to_string()));
            let _ = log_once(
                &log,
                clock(),
                &format!("skeleton3d:degenerate-bind-pose:{index}"),
                LogLevel::Warn,
                LogData::Record(data).into(),
                None,
            );
        })),
    );
    guard_state.write().unwrap().enabled = true;
}
