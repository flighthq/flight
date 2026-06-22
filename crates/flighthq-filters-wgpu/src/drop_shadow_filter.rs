//! Drop-shadow wgpu filter pass.
//!
//! Compositing order: shadow at offset → source (unless `hide_object`).
//! `knockout` is not supported by the wgpu path (the call returns early).
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`
//! (`[mask, blurred, blur_temp]`). This function allocates nothing itself.

use flighthq_filters::DropShadowFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{WgpuFilterState, clear_wgpu_filter_target};
use crate::tint_shader::{apply_wgpu_blit_offset_pass, apply_wgpu_blit_pass, apply_wgpu_tint_pass};

/// Applies a drop shadow filter to `source`, writing the result to `dest`.
pub fn apply_drop_shadow_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 3],
    filter: &DropShadowFilter,
) {
    if filter.knockout.unwrap_or(false) {
        return;
    }

    let angle = filter.angle.unwrap_or(45.0).to_radians();
    let distance = filter.distance.unwrap_or(4.0);
    let dx = angle.cos() * distance;
    let dy = angle.sin() * distance;
    let color = filter.color.unwrap_or(0);
    let alpha = filter.alpha.unwrap_or(1.0);
    let strength = filter.strength.unwrap_or(1.0);
    let quality = filter.quality.unwrap_or(1).max(1);
    let hide_object = filter.hide_object.unwrap_or(false);

    // Strength below 1 attenuates the tint; strength above 1 re-blits the shadow that many times.
    let tint_strength = strength.min(1.0);
    let shadow_passes = (strength.floor() as i32).max(1);

    let [mask, blurred, blur_temp] = *scratch;

    apply_wgpu_tint_pass(
        state,
        filter_state,
        source,
        mask,
        color,
        alpha,
        tint_strength,
    );
    apply_box_blur_filter_to_wgpu(
        state,
        filter_state,
        mask,
        blurred,
        blur_temp,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        quality,
    );

    clear_wgpu_filter_target(state, dest);
    for _ in 0..shadow_passes {
        apply_wgpu_blit_offset_pass(state, filter_state, blurred, dest, dx, dy);
    }

    if !hide_object {
        apply_wgpu_blit_pass(state, filter_state, source, dest);
    }
}

#[cfg(test)]
mod tests {}
