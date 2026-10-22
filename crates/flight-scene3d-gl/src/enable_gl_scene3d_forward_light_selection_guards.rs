use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::types::Scene3DLightsLike;

pub type GlScene3DForwardLightSelectionGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

pub fn are_gl_scene3d_forward_light_selection_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.forward_light_selection_guard.is_some());
}

// flight-lint: allow(conform-params) D5 caller-owned log state and injected clock replace the TS module-level singleton
pub fn enable_gl_scene3d_forward_light_selection_guards(
    state: &GlRenderState,
    log_state: &LogStateRef,
    clock: GlScene3DForwardLightSelectionGuardClock,
) {
    let log = log_state.clone();
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.forward_light_selection_guard = Some(Arc::new(move |lights| {
            warn_gl_scene3d_forward_light_selection_required(&log, clock(), lights);
        }));
    });
}

// flight-lint: allow(f64) D1 log timestamps are millisecond JS-number values
fn warn_gl_scene3d_forward_light_selection_required(
    log_state: &LogStateRef,
    now_ms: f64,
    lights: &Scene3DLightsLike,
) {
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "renderGlScene3D: punctual lights exceed MAX_FORWARD_LIGHTS and will be input-order truncated — call prepareGlScene3DForwardLights after prepareScene3DRender and pass its result to renderGlScene3D.".to_string(),
        ),
    );
    data.insert(
        "pointLightCount".to_string(),
        LogValue::Float(lights.point.as_ref().map_or(0, |v| v.len()) as f64),
    );
    data.insert(
        "spotLightCount".to_string(),
        LogValue::Float(lights.spot.as_ref().map_or(0, |v| v.len()) as f64),
    );
    let _ = log_once(
        log_state,
        now_ms,
        "scene-gl:forward-light-selection-required",
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("scene-gl".to_string()),
    );
}
