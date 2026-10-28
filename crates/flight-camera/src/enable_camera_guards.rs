//! Opt-in camera guards (TS `enableCameraGuards.ts`). Installing them adds warnings for camera
//! inputs that leave a computation with no answer; the core modules stay message-free.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::camera::set_camera_3d_view_guard;
use crate::explain_camera_3d_view::explain_camera_3d_view;
use crate::types::*;
use crate::visible_bounds::set_camera_2d_visible_bounds_guard;

/// Reports whether the caller-owned camera guard state is enabled (TS
/// `areCameraGuardsEnabled`).
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState replaces the source module-level enabled flag
pub fn are_camera_guards_enabled(guard_state: &CameraGuardStateRef) -> bool {
    return guard_state.read().unwrap().enabled;
}

/// Uninstalls both hooks and clears the enabled flag (TS `disableCameraGuards`).
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState replaces the source module-level guard hooks
pub fn disable_camera_guards(guard_state: &CameraGuardStateRef) {
    set_camera_3d_view_guard(guard_state, None);
    set_camera_2d_visible_bounds_guard(guard_state, None);
    guard_state.write().unwrap().enabled = false;
}

/// Installs opt-in diagnostics for camera inputs that leave a computation with no answer (TS
/// `enableCameraGuards`). The adapters capture the caller's log state and live clock at enable time
/// and sample the clock at each warning, so timestamps are operation time.
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState, log state and clock replace the source module glue
pub fn enable_camera_guards(
    guard_state: &CameraGuardStateRef,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let view_log = log_state.clone();
    let view_clock = clock.clone();
    let view_guard: Camera3DViewGuard = Arc::new(move |camera: &Camera3D| {
        warn_on_non_orthonormal_camera_3d_view(&view_log, view_clock(), camera);
    });
    set_camera_3d_view_guard(guard_state, Some(view_guard));
    let bounds_log = log_state.clone();
    let bounds_guard: Camera2DVisibleBoundsGuard = Arc::new(move |camera: &Camera2D| {
        warn_on_degenerate_camera_2d_visible_bounds(&bounds_log, clock(), camera);
    });
    set_camera_2d_visible_bounds_guard(guard_state, Some(bounds_guard));
    guard_state.write().unwrap().enabled = true;
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_degenerate_camera_2d_visible_bounds(
    log_state: &LogStateRef,
    now_ms: f64,
    camera: &Camera2D,
) {
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "getCamera2DVisibleBounds: the view matrix has no inverse, so the visible rectangle is unbounded and nothing is culled — a zoom of 0 is the usual cause; set a non-zero zoom."
                .to_string(),
        ),
    );
    data.insert("zoom".to_string(), LogValue::Number(camera.zoom as f64));
    let key = format!("camera:degenerate-visible-bounds:{}", camera.zoom);
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        None,
    );
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_non_orthonormal_camera_3d_view(log_state: &LogStateRef, now_ms: f64, camera: &Camera3D) {
    let explanation = explain_camera_3d_view(camera);
    if explanation.is_orthonormal {
        return;
    }
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "setCamera3DViewMatrix4FromMatrix4: the view matrix is not orthonormal, which its consumers rely on — a scaled matrix is the usual cause. Reflections are fine; scale is not. Call explainCamera3DView(camera) for the measured deviations."
                .to_string(),
        ),
    );
    data.insert(
        "scaleDeviation".to_string(),
        LogValue::Number(explanation.scale_deviation as f64),
    );
    data.insert(
        "shearDeviation".to_string(),
        LogValue::Number(explanation.shear_deviation as f64),
    );
    let _ = log_once(
        log_state,
        now_ms,
        "camera:non-orthonormal-view",
        LogLevel::Warn,
        LogData::Record(data).into(),
        None,
    );
}
