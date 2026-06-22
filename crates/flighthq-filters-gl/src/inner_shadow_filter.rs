//! Inner-shadow GL filter pass.
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

use crate::blur_filter::apply_box_blur_filter_to_gl;
use crate::filter_pass::clear_gl_render_target;
use crate::inner_glow_filter::apply_gl_inner_clip_pass;
use crate::tint_shader::{apply_gl_blit_offset_pass, apply_gl_blit_pass, apply_gl_invert_tint_pass};
use crate::{GlRenderState, GlRenderTarget};

/// Applies an inner shadow filter to `source`, writing the result to `dest`.
pub fn apply_inner_shadow_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    scratch: &[&GlRenderTarget; 3],
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

    let s0 = scratch[0];
    let s1 = scratch[1];
    let s2 = scratch[2];

    // Pass 1: invert source alpha, tint with shadow color → s0.
    apply_gl_invert_tint_pass(state, source, s0, color, alpha, strength);

    // Pass 2: blur → s1 (s2 is ping-pong temp).
    apply_box_blur_filter_to_gl(
        state,
        s0,
        s1,
        s2,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        quality,
    );

    // Pass 3: shift the blurred shadow by the offset → s0 (cleared first).
    clear_gl_render_target(state, s0);
    apply_gl_blit_offset_pass(state, s1, s0, dx, dy);

    // Pass 4: clip the offset shadow (s0) to source alpha → s1 (cleared first).
    clear_gl_render_target(state, s1);
    apply_gl_inner_clip_pass(state, s0, source, s1);

    // Final composite: source first, then clipped shadow on top.
    clear_gl_render_target(state, dest);
    apply_gl_blit_pass(state, source, dest);
    apply_gl_blit_pass(state, s1, dest);
}

#[cfg(test)]
mod tests {}
