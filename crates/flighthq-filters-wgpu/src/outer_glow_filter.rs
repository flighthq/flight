//! Outer-glow wgpu filter pass.
//!
//! Compositing order: glow (centered, no offset) → source (unless `knockout`).
//!
//! `scratch` must contain three render targets (`[mask, blurred, blur_temp]`).
//! This function allocates nothing itself.

use flighthq_filters::OuterGlowFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{WgpuFilterState, clear_wgpu_filter_target};
use crate::tint_shader::{apply_wgpu_blit_pass, apply_wgpu_tint_pass};

/// Applies an outer glow filter to `source`, writing the result to `dest`.
pub fn apply_outer_glow_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 3],
    filter: &OuterGlowFilter,
) {
    let color = filter.color.unwrap_or(0xff0000);
    let alpha = filter.alpha.unwrap_or(1.0);
    let strength = filter.strength.unwrap_or(1.0);
    let quality = filter.quality.unwrap_or(1).max(1);
    let knockout = filter.knockout.unwrap_or(false);

    let tint_strength = strength.min(1.0);
    let glow_passes = (strength.floor() as i32).max(1);

    let [mask, blurred, blur_temp] = *scratch;

    apply_wgpu_tint_pass(state, filter_state, source, mask, color, alpha, tint_strength);
    apply_box_blur_filter_to_wgpu(
        state,
        filter_state,
        mask,
        blurred,
        blur_temp,
        filter.blur_x.unwrap_or(6.0),
        filter.blur_y.unwrap_or(6.0),
        quality,
    );

    clear_wgpu_filter_target(state, dest);
    for _ in 0..glow_passes {
        apply_wgpu_blit_pass(state, filter_state, blurred, dest);
    }

    if !knockout {
        apply_wgpu_blit_pass(state, filter_state, source, dest);
    }
}

#[cfg(test)]
mod tests {}
