//! Bevel GL filter pass.
//!
//! Compositing order:
//!   1. Shadow layer (blurred alpha at +offset, shadow color)
//!   2. Highlight layer (blurred alpha at -offset, highlight color)
//!   3. Source on top (unless `filter.knockout`)
//!
//! `bevel_type` controls which layers are drawn:
//!   - `Full` (default): both shadow and highlight
//!   - `Outer`: shadow and highlight outside the source boundary
//!   - `Inner`: shadow and highlight inside the source boundary
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates nothing itself.

use flighthq_filters::BevelFilter;
use flighthq_filters::BevelType;

use crate::blur_filter::apply_box_blur_filter_to_gl;
use crate::filter_pass::clear_gl_render_target;
use crate::tint_shader::{apply_gl_blit_offset_pass, apply_gl_blit_pass, apply_gl_tint_pass};
use crate::{GlRenderState, GlRenderTarget};

/// Applies a bevel filter to `source`, writing the result to `dest`.
pub fn apply_bevel_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    scratch: &[&GlRenderTarget; 3],
    filter: &BevelFilter,
) {
    let angle = filter.angle.unwrap_or(45.0).to_radians();
    let distance = filter.distance.unwrap_or(4.0);
    let dx = angle.cos() * distance;
    let dy = angle.sin() * distance;
    let shadow_color = filter.shadow_color.unwrap_or(0x000000);
    let shadow_alpha = filter.shadow_alpha.unwrap_or(1.0);
    let highlight_color = filter.highlight_color.unwrap_or(0xffffff);
    let highlight_alpha = filter.highlight_alpha.unwrap_or(1.0);
    let strength = filter.strength.unwrap_or(1.0);
    let quality = filter.quality.unwrap_or(1).max(1);
    let knockout = filter.knockout.unwrap_or(false);
    let bevel_type = filter.bevel_type.unwrap_or(BevelType::Full);

    let tinted = scratch[0];
    let blurred = scratch[1];
    let blur_temp = scratch[2];

    // Build the shared blur basis (neutral white tint preserves alpha shape).
    apply_gl_tint_pass(state, source, tinted, 0xffffff, 1.0, strength);
    apply_box_blur_filter_to_gl(
        state,
        tinted,
        blurred,
        blur_temp,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        quality,
    );

    clear_gl_render_target(state, dest);

    // `Inner` places shadow at -offset and highlight at +offset; `Full`/`Outer`
    // are the opposite. Sign of the highlight/shadow offsets flips accordingly.
    let inner = bevel_type == BevelType::Inner;
    let (shadow_dx, shadow_dy) = if inner { (-dx, -dy) } else { (dx, dy) };
    let (highlight_dx, highlight_dy) = if inner { (dx, dy) } else { (-dx, -dy) };

    apply_gl_tint_pass(state, blurred, tinted, shadow_color, shadow_alpha, 1.0);
    apply_gl_blit_offset_pass(state, tinted, dest, shadow_dx, shadow_dy);
    apply_gl_tint_pass(
        state,
        blurred,
        tinted,
        highlight_color,
        highlight_alpha,
        1.0,
    );
    apply_gl_blit_offset_pass(state, tinted, dest, highlight_dx, highlight_dy);

    if !knockout {
        apply_gl_blit_pass(state, source, dest);
    }
}

#[cfg(test)]
mod tests {}
