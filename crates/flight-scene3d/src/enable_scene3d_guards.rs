use crate::{BillboardCameraBasisGuard, set_billboard_camera_basis_guard};
use flight_camera::Camera3D;
use flight_entity::Ref;
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Default)]
pub struct Scene3DGuardState {
    pub enabled: bool,
    pub billboard_camera_basis_guard: Option<BillboardCameraBasisGuard>,
}
pub type Scene3DGuardStateRef = Ref<Scene3DGuardState>;
// flight-lint: allow(f64) D1 injected operation timestamps are millisecond JS-number values
pub type Scene3DGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

// flight-lint: allow(conform-params) D5 caller-owned flag replaces the TS module-level enabled state
pub fn are_scene3d_guards_enabled(guard_state: &Scene3DGuardStateRef) -> bool {
    return guard_state.read().unwrap().enabled;
}
// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the TS global hooks
pub fn disable_scene3d_guards(guard_state: &Scene3DGuardStateRef) {
    set_billboard_camera_basis_guard(guard_state, None);
    guard_state.write().unwrap().enabled = false;
}
// flight-lint: allow(conform-params) D5 caller-owned state, log and injected clock replace the TS module glue
pub fn enable_scene3d_guards(
    guard_state: &Scene3DGuardStateRef,
    log_state: &LogStateRef,
    clock: Scene3DGuardClock,
) {
    let log = log_state.clone();
    set_billboard_camera_basis_guard(
        guard_state,
        Some(Arc::new(move |camera| {
            warn_on_degenerate_billboard_camera_basis(&log, clock(), camera)
        })),
    );
    guard_state.write().unwrap().enabled = true;
}
// flight-lint: allow(f64) D1 log timestamps and value formatting are the canonical log number representation
fn warn_on_degenerate_billboard_camera_basis(
    log_state: &LogStateRef,
    now_ms: f64,
    camera: &Camera3D,
) {
    let mut data = HashMap::new();
    data.insert("message".to_string(),LogValue::Str("orientBillboardToCamera: the camera view matrix has no inverse, so the camera basis could not be derived and the billboards were left as they were. A view set from setCamera3DViewMatrix4FromMatrix4 is the usual cause — that setter copies an arbitrary matrix without validating it, while setCamera3DViewMatrix4FromLookAt cannot produce a singular view.".to_string()));
    data.insert(
        "view".to_string(),
        LogValue::Array(
            camera
                .view
                .read()
                .unwrap()
                .m
                .iter()
                .map(|n| LogValue::Float(*n as f64))
                .collect(),
        ),
    );
    let _ = log_once(
        log_state,
        now_ms,
        "scene3d:degenerate-billboard-camera-basis",
        LogLevel::Warn,
        LogData::Record(data).into(),
        None,
    );
}
