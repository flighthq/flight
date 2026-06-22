//! Inner-shadow wgpu filter pass.
//!
//! The shadow appears at interior edges of the source shape, offset by
//! `filter.angle` and `filter.distance`.
//!
//! Algorithm:
//!   1. Invert-tint pass: extracts inverted alpha, tinted with shadow color.
//!   2. Blur pass.
//!   3. Offset pass: shifts the blurred shadow by angle/distance.
//!   4. Clip pass: clips the offset shadow to source alpha (keeps it inside).
//!   5. Composite: source + clipped shadow.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates nothing itself.

use flighthq_filters::InnerShadowFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{WgpuFilterState, clear_wgpu_filter_target};
use crate::tint_shader::{
    apply_wgpu_blit_offset_pass, apply_wgpu_blit_pass, apply_wgpu_inner_clip_pass,
    apply_wgpu_invert_tint_pass,
};

/// Applies an inner shadow filter to `source`, writing the result to `dest`.
pub fn apply_inner_shadow_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 3],
    filter: &InnerShadowFilter,
) {
    let angle = filter.angle.unwrap_or(45.0).to_radians();
    let distance = filter.distance.unwrap_or(4.0);
    let dx = angle.cos() * distance;
    let dy = angle.sin() * distance;
    let color = filter.color.unwrap_or(0);
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
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        quality,
    );
    apply_wgpu_blit_offset_pass(state, filter_state, s1, s0, dx, dy);
    apply_wgpu_inner_clip_pass(state, filter_state, s0, source, s1);

    clear_wgpu_filter_target(state, dest);
    apply_wgpu_blit_pass(state, filter_state, source, dest);
    apply_wgpu_blit_pass(state, filter_state, s1, dest);
}

#[cfg(test)]
mod tests {}
