//! The opt-in color-adjustment guard (TS `enableWgpuColorAdjustmentGuards.ts`): when a node carries a
//! color adjustment but the fold was never registered, the batch reaches this guard through its
//! optional registry slot and warns once; the tint is skipped and drawn untinted, never a throw.

use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_wgpu::{
    WgpuColorScaleBiasInput, WgpuRenderState, get_wgpu_color_adjustment_material_feature_guard,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

/// Whether color-adjustment guards are installed on `state` (TS
/// `areWgpuColorAdjustmentGuardsEnabled`).
pub fn are_wgpu_color_adjustment_guards_enabled(state: &WgpuRenderState) -> bool {
    return get_wgpu_color_adjustment_material_feature_guard(state).is_some();
}

/// Installs the shakeable color-adjustment guard on `state` (TS `enableWgpuColorAdjustmentGuards`).
/// Not calling this — the production default — costs the batch nothing. Idempotent. The warning
/// goes to `log_state`, kept as the state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_wgpu_color_adjustment_guards(
    state: &mut WgpuRenderState,
    log_state: Option<LogStateRef>,
) {
    get_wgpu_render_state_runtime_mut(state).color_adjustment_feature_guard_log = log_state;
    let registries = &mut get_wgpu_render_state_runtime_mut(state).registries;
    let installed = registries
        .color_adjustment_feature_guard
        .is_some_and(|guard| {
            std::ptr::fn_addr_eq(guard, warn_wgpu_color_adjustment_not_enabled as fn(_, _))
        });
    if !installed {
        registries.color_adjustment_feature_guard = Some(warn_wgpu_color_adjustment_not_enabled);
    }
}

fn warn_wgpu_color_adjustment_not_enabled(
    state: &mut WgpuRenderState,
    _color_scale_bias: &WgpuColorScaleBiasInput,
) {
    let Some(log_state) = get_wgpu_render_state_runtime(state)
        .color_adjustment_feature_guard_log
        .clone()
    else {
        return;
    };
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "recordWgpuQuadBatchColorScaleBias: color adjustment present but WGPU color adjustment not enabled — call registerWgpuColorAdjustmentMaterialFeature(state)"
                .to_string(),
        ),
    );
    log_once(
        &log_state,
        0.0,
        "scene2d-wgpu:color-adjustment-not-enabled",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("scene2d-wgpu".to_string()),
    );
}
