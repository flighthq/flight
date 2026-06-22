//! Bevel wgpu filter pass.
//!
//! Compositing order:
//!   1. Shadow layer (blurred alpha at +offset, shadow color)
//!   2. Highlight layer (blurred alpha at -offset, highlight color)
//!   3. Source on top (unless `knockout`)
//!
//! `bevel_type` controls layer placement: `Full` and `Outer` place shadow at
//! +offset / highlight at -offset; `Inner` swaps them.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates nothing itself.

use flighthq_filters::BevelFilter;
use flighthq_filters::BevelType;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{WgpuFilterState, clear_wgpu_filter_target};
use crate::tint_shader::{apply_wgpu_blit_offset_pass, apply_wgpu_blit_pass, apply_wgpu_tint_pass};

/// Applies a bevel filter to `source`, writing the result to `dest`.
pub fn apply_bevel_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 3],
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

    let [tinted, blurred, blur_temp] = *scratch;

    apply_wgpu_tint_pass(state, filter_state, source, tinted, 0xffffff, 1.0, strength);
    apply_box_blur_filter_to_wgpu(
        state,
        filter_state,
        tinted,
        blurred,
        blur_temp,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        quality,
    );

    clear_wgpu_filter_target(state, dest);

    // `Inner` places shadow at -offset and highlight at +offset; the other types do the reverse.
    let (shadow_dx, shadow_dy, highlight_dx, highlight_dy) = if bevel_type == BevelType::Inner {
        (-dx, -dy, dx, dy)
    } else {
        (dx, dy, -dx, -dy)
    };

    apply_wgpu_tint_pass(
        state,
        filter_state,
        blurred,
        tinted,
        shadow_color,
        shadow_alpha,
        1.0,
    );
    apply_wgpu_blit_offset_pass(state, filter_state, tinted, dest, shadow_dx, shadow_dy);
    apply_wgpu_tint_pass(
        state,
        filter_state,
        blurred,
        tinted,
        highlight_color,
        highlight_alpha,
        1.0,
    );
    apply_wgpu_blit_offset_pass(
        state,
        filter_state,
        tinted,
        dest,
        highlight_dx,
        highlight_dy,
    );

    if !knockout {
        apply_wgpu_blit_pass(state, filter_state, source, dest);
    }
}

#[cfg(test)]
mod tests {}
