use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};

pub type GlScene3DColorSpaceGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

pub fn are_gl_scene3d_color_space_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.color_space_guard.is_some());
}

// flight-lint: allow(conform-params) D5 caller-owned log state and injected clock replace the TS module-level singleton
pub fn enable_gl_scene3d_color_space_guards(
    state: &GlRenderState,
    log_state: &LogStateRef,
    clock: GlScene3DColorSpaceGuardClock,
) {
    let log = log_state.clone();
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.color_space_guard = Some(Arc::new(move || {
            warn_gl_scene3d_drawn_to_canvas(&log, clock());
        }));
    });
}

// flight-lint: allow(f64) D1 log timestamps are millisecond JS-number values
fn warn_gl_scene3d_drawn_to_canvas(log_state: &LogStateRef, now_ms: f64) {
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "renderGlScene3D: scene drawn directly to the canvas — linear radiance is not sRGB-encoded (output will be dark). Render into a target and present with presentGlScene3D, or draw through the effect pipeline.".to_string(),
        ),
    );
    let _ = log_once(
        log_state,
        now_ms,
        "scene-gl:scene-drawn-to-canvas-unencoded",
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("scene-gl".to_string()),
    );
}
