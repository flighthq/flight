//! Opt-in diagnostics for texture resolution (TS `enableWgpuTextureResolverGuards.ts`): the render
//! registry guards plus a once-per-log warning when mipmaps degrade to a single level.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render::{are_render_registries_guards_enabled, enable_render_registries_guards};

use crate::types::*;

/// Whether the texture-resolver guards are on (TS `areWgpuTextureResolverGuardsEnabled`).
pub fn are_wgpu_texture_resolver_guards_enabled(state: &WgpuRenderState) -> bool {
    return are_render_registries_guards_enabled(state);
}

/// Turns on the registry guards and the mipmap-degradation warning (TS
/// `enableWgpuTextureResolverGuards`).
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the TS logging singleton
pub fn enable_wgpu_texture_resolver_guards(
    state: &mut WgpuRenderState,
    log_state: Option<LogStateRef>,
) {
    enable_render_registries_guards(state, log_state.clone());
    state.runtime.mipmap_degraded_guard = Some(Arc::new(move |_state: &WgpuRenderState| {
        if let Some(log_state) = &log_state {
            warn_on_mipmap_degradation(log_state);
        }
    }));
}

fn warn_on_mipmap_degradation(log_state: &LogStateRef) {
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(MIPMAP_DEGRADED_MESSAGE.to_string()),
    );
    log_once(
        log_state,
        0.0,
        "render-wgpu:mipmap-degraded",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("render-wgpu".to_string()),
    );
}

const MIPMAP_DEGRADED_MESSAGE: &str = "bindWgpuBitmapTexture: mipmaps requested but no WGPU mipmap generator registered — texture allocated with a single mip level (bilinear fallback). Call registerWgpuMipmapGeneration(state) to enable trilinear/anisotropic sampling.";
