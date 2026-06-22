//! Inner-glow wgpu filter pass.
//!
//! The glow appears at the interior edges of the source shape.
//!
//! Algorithm:
//!   1. Invert-tint pass: extracts inverted alpha, tinted with glow color.
//!   2. Blur pass: spreads the inverted tint toward the interior.
//!   3. Clip pass: multiplies the blurred glow by source alpha to confine it.
//!   4. Composite: source + clipped glow.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates nothing itself.

use flighthq_filters::InnerGlowFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{WgpuFilterState, clear_wgpu_filter_target};
use crate::tint_shader::{
    apply_wgpu_blit_pass, apply_wgpu_inner_clip_pass, apply_wgpu_invert_tint_pass,
};

/// Applies an inner glow filter to `source`, writing the result to `dest`.
pub fn apply_inner_glow_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 3],
    filter: &InnerGlowFilter,
) {
    let color = filter.color.unwrap_or(0xff0000);
    let alpha = filter.alpha.unwrap_or(1.0);
    let strength = filter.strength.unwrap_or(1.0);
    let quality = filter.quality.unwrap_or(1).max(1);

    let [s0, s1, s2] = *scratch;

    apply_wgpu_invert_tint_pass(state, filter_state, source, s0, color, alpha, strength);
    apply_box_blur_filter_to_wgpu(
        state,
        filter_state,
        s0,
        s1,
        s2,
        filter.blur_x.unwrap_or(6.0),
        filter.blur_y.unwrap_or(6.0),
        quality,
    );
    apply_wgpu_inner_clip_pass(state, filter_state, s1, source, s0);

    clear_wgpu_filter_target(state, dest);
    apply_wgpu_blit_pass(state, filter_state, source, dest);
    apply_wgpu_blit_pass(state, filter_state, s0, dest);
}

#[cfg(test)]
mod tests {}
