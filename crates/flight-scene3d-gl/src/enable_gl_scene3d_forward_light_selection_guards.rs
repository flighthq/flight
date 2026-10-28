use std::collections::HashMap;

use flight_lighting::Scene3DLightsLike;
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;

// Returns whether the forward-light selection guard is installed on `state`.
pub fn are_gl_scene3d_forward_light_selection_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state)
        .forward_light_selection_guard
        .is_some();
}

// Installs the shakeable forward-light selection guard on `state`. render_gl_scene3d reaches this guard
// only when point or spot input exceeds MAX_FORWARD_LIGHTS and no prepared per-object selection list
// was supplied. The message and the log dependency remain outside the core draw module. The warning
// goes to `log_state`, kept as the state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_gl_scene3d_forward_light_selection_guards(
    state: &GlRenderState,
    log_state: Option<LogStateRef>,
) {
    state.gl_runtime.borrow_mut().guard_log = log_state;
    get_gl_scene3d_runtime(state).forward_light_selection_guard =
        Some(warn_gl_scene3d_forward_light_selection_required);
}

fn warn_gl_scene3d_forward_light_selection_required(
    state: &GlRenderState,
    lights: &Scene3DLightsLike,
) {
    let Some(log_state) = state.gl_runtime.borrow().guard_log.clone() else {
        return;
    };
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "renderGlScene3D: punctual lights exceed MAX_FORWARD_LIGHTS and will be input-order truncated — call prepareGlScene3DForwardLights after prepareScene3DRender and pass its result to renderGlScene3D."
                .to_string(),
        ),
    );
    data.insert(
        "pointLightCount".to_string(),
        LogValue::Number((lights.point.len() as i64) as f64),
    );
    data.insert(
        "spotLightCount".to_string(),
        LogValue::Number((lights.spot.len() as i64) as f64),
    );
    log_once(
        &log_state,
        0.0,
        "scene-gl:forward-light-selection-required",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("scene-gl".to_string()),
    );
}
