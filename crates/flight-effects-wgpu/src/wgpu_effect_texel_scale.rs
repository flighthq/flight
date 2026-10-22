//! Logical-versus-texel density of effect targets (TS `wgpuEffectTexelScale.ts`).

use flight_render_wgpu::{WgpuRenderState, WgpuTextureRenderTarget, get_wgpu_active_render_pass};

use crate::types::*;

/// The logical extent `target` represents and its texels per logical pixel (TS
/// `getWgpuEffectLogicalResolution`).
pub fn get_wgpu_effect_logical_resolution(
    state: &WgpuRenderState,
    target: &WgpuTextureRenderTarget,
) -> WgpuEffectLogicalResolution {
    let texels_per_logical_pixel = get_wgpu_render_target_texel_scale(
        target.width as f32,
        get_wgpu_effect_logical_width(state, target),
    );
    return WgpuEffectLogicalResolution {
        height: target.height as f32 / texels_per_logical_pixel,
        texels_per_logical_pixel,
        width: target.width as f32 / texels_per_logical_pixel,
    };
}

/// The width one logical pixel is measured against (TS `getWgpuEffectLogicalWidth`): the open
/// pass's viewport while a chain runs inside a frame, and the target's own width when it does not
/// (the render-texture path writes into a target with no enclosing pass, where logical and texel
/// pixels coincide).
pub fn get_wgpu_effect_logical_width(
    state: &WgpuRenderState,
    target: &WgpuTextureRenderTarget,
) -> f32 {
    return get_wgpu_active_render_pass(state)
        .map(|pass| pass.viewport.width)
        .unwrap_or(target.width as f32);
}

/// Texels per logical canvas pixel in an effect target (TS `getWgpuRenderTargetTexelScale`).
///
/// WebGPU effect targets use two texels per axis at `sampleCount: 4`. Pool scratch targets keep
/// those enlarged dimensions while their own sample count is 1, so target-to-canvas dimensions are
/// the reliable signal. Use this for descriptor distances and patterns expressed in logical pixels;
/// physical raster kernels such as FXAA and SMAA keep the actual target dimensions.
pub fn get_wgpu_render_target_texel_scale(target_width: f32, canvas_width: f32) -> f32 {
    if !target_width.is_finite() || !canvas_width.is_finite() || canvas_width <= 0.0 {
        return 1.0;
    }
    return 1.0_f32.max(js_round(target_width / canvas_width));
}

// JS Math.round: halves round toward +infinity.
pub(crate) fn js_round(value: f32) -> f32 {
    return (value + 0.5).floor();
}
