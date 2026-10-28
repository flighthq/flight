use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;

// Returns whether the scene color-space guard is installed on `state`.
pub fn are_gl_scene3d_color_space_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state).color_space_guard.is_some();
}

// Installs the shakeable scene color-space guard on `state`: when render_gl_scene3d renders straight to
// the canvas (no bound render target), its linear HDR radiance reaches the 8-bit canvas with no present
// pass to apply the sRGB encode, so the frame looks dark. render_gl_scene3d reaches this guard only
// through its nullable scene-runtime slot and warns once (to `log_state`, kept as the state's guard
// log). Not calling this costs the draw path nothing. Idempotent.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_gl_scene3d_color_space_guards(state: &GlRenderState, log_state: Option<LogStateRef>) {
    get_gl_scene3d_runtime(state).color_space_guard_log = log_state;
    get_gl_scene3d_runtime(state).color_space_guard = Some(warn_gl_scene3d_drawn_to_canvas);
}

fn warn_gl_scene3d_drawn_to_canvas(state: &GlRenderState) {
    let Some(log_state) = get_gl_scene3d_runtime(state).color_space_guard_log.clone() else {
        return;
    };
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "renderGlScene3D: scene drawn directly to the canvas — linear radiance is not sRGB-encoded (output will be dark). Render into a target and present with presentGlScene3D, or draw through the effect pipeline."
                .to_string(),
        ),
    );
    log_once(
        &log_state,
        0.0,
        "scene-gl:scene-drawn-to-canvas-unencoded",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("scene-gl".to_string()),
    );
}
