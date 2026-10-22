use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::{
    GlColorAdjustmentData, GlRenderState, get_gl_color_adjustment_material_feature_guard,
};

// Returns whether color-adjustment guards are installed on `state` (enable_gl_color_adjustment_guards).
pub fn are_gl_color_adjustment_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_color_adjustment_material_feature_guard(state).is_some();
}

// Installs the shakeable color-adjustment guard on `state`: when a node carries a color adjustment
// but register_gl_color_adjustment_material_feature was never called,
// record_gl_quad_batch_color_scale_bias reaches this guard through its optional persistent registry
// slot and warns once (the tint is skipped, drawn untinted — never a throw). Not calling this — the
// production default — costs the batch nothing. Idempotent. The warning goes to `log_state`, kept as
// the state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_gl_color_adjustment_guards(state: &mut GlRenderState, log_state: Option<LogStateRef>) {
    state.gl_runtime.borrow_mut().guard_log = log_state;
    let installed = state
        .gl_registries
        .color_adjustment_feature_guard
        .is_some_and(|guard| {
            std::ptr::fn_addr_eq(
                guard,
                warn_gl_color_adjustment_not_enabled
                    as flight_render_gl::GlColorAdjustmentMaterialFeatureGuard,
            )
        });
    if !installed {
        state.gl_registries.color_adjustment_feature_guard = Some(warn_gl_color_adjustment_not_enabled);
    }
}

fn warn_gl_color_adjustment_not_enabled(
    state: &mut GlRenderState,
    _color_scale_bias: &GlColorAdjustmentData,
) {
    let Some(log_state) = state.gl_runtime.borrow().guard_log.clone() else {
        return;
    };
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "recordGlQuadBatchColorScaleBias: color adjustment present but GL color adjustment not enabled — call registerGlColorAdjustmentMaterialFeature(state)"
                .to_string(),
        ),
    );
    log_once(
        &log_state,
        0.0,
        "scene2d-gl:color-adjustment-not-enabled",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("scene2d-gl".to_string()),
    );
}
