//! The opt-in forward-light truncation guard (TS `enableWgpuScene3DForwardLightSelectionGuards.ts`):
//! when punctual lights exceed the forward budget without a prepared selection, the render warns once
//! with actionable guidance.

use std::collections::HashMap;

use flight_lighting::Scene3DLightsLike;
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render::RenderState;
use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

/// Whether the forward-light selection guard is installed on `state` (TS
/// `areWgpuScene3DForwardLightSelectionGuardsEnabled`).
pub fn are_wgpu_scene3d_forward_light_selection_guards_enabled(
    state: &mut WgpuRenderState,
) -> bool {
    return get_wgpu_scene3d_runtime(state)
        .forward_light_selection_guard
        .is_some();
}

/// Installs the forward-light selection guard on `state` (TS
/// `enableWgpuScene3DForwardLightSelectionGuards`). The warning goes to `log_state`, kept as the
/// state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_wgpu_scene3d_forward_light_selection_guards(
    state: &mut WgpuRenderState,
    log_state: Option<LogStateRef>,
) {
    state.render_runtime_mut().registry_guard_log = log_state;
    get_wgpu_scene3d_runtime(state).forward_light_selection_guard =
        Some(warn_wgpu_scene3d_forward_light_selection_required);
}

fn warn_wgpu_scene3d_forward_light_selection_required(
    state: &WgpuRenderState,
    lights: &Scene3DLightsLike,
) {
    let Some(log_state) = state.render_runtime().registry_guard_log.clone() else {
        return;
    };
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "renderWgpuScene3D: punctual lights exceed MAX_FORWARD_LIGHTS and will be input-order truncated — call prepareWgpuScene3DForwardLights after prepareScene3DRender and pass its result to renderWgpuScene3D."
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
        "scene-wgpu:forward-light-selection-required",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("scene-wgpu".to_string()),
    );
}
