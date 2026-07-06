//! Outer-glow GL filter pass.
//!
//! Compositing order: glow (centered, no offset) → source (unless `filter.knockout`).
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`
//! (tint mask, blurred glow, blur ping-pong temp). This function allocates nothing.

use flighthq_filters::OuterGlowFilter;
use flighthq_render_gl::clear_gl_render_target;

use crate::blur_filter::apply_box_blur_filter_to_gl;
use crate::tint_shader::{apply_gl_blit_pass, apply_gl_tint_pass};
use crate::{GlRenderState, GlRenderTarget};

/// Applies an outer glow filter to `source`, writing the result to `dest`.
pub fn apply_outer_glow_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    scratch: &[&GlRenderTarget; 3],
    filter: &OuterGlowFilter,
) {
    let color = filter.color.unwrap_or(0xff0000);
    let alpha = filter.alpha.unwrap_or(1.0);
    let strength = filter.strength.unwrap_or(1.0);
    let quality = filter.quality.unwrap_or(1).max(1);
    let knockout = filter.knockout.unwrap_or(false);

    let tint_strength = strength.min(1.0);
    let glow_passes = (strength.floor() as u32).max(1);

    let mask = scratch[0];
    let blurred = scratch[1];
    let blur_temp = scratch[2];

    apply_gl_tint_pass(state, source, mask, color, alpha, tint_strength);
    apply_box_blur_filter_to_gl(
        state,
        mask,
        blurred,
        blur_temp,
        filter.blur_x.unwrap_or(6.0),
        filter.blur_y.unwrap_or(6.0),
        quality,
    );

    clear_gl_render_target(state, dest);
    for _ in 0..glow_passes {
        apply_gl_blit_pass(state, blurred, dest);
    }

    if !knockout {
        apply_gl_blit_pass(state, source, dest);
    }
}

#[cfg(test)]
mod tests {}
