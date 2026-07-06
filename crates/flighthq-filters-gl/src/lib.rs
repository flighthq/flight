//! `flighthq-filters-gl` — OpenGL/ES (glow) multi-pass shader implementations
//! for bitmap filter effects.
//!
//! Each filter is one public function that takes a `GlRenderState` and two or
//! more `GlRenderTarget` objects. Scratch targets must be caller-provided;
//! functions in this crate allocate no GPU resources themselves (except
//! `create_gl_gradient_ramp_texture`, which returns an owned texture the
//! caller must delete with `gl.delete_texture`).

pub mod bevel_filter;
pub mod blur_filter;
pub mod color_matrix_filter;
pub mod convolution_filter;
pub mod displacement_map_filter;
pub mod drop_shadow_filter;
pub mod filter_pass;
pub mod gradient_bevel_filter;
pub mod gradient_glow_filter;
pub mod gradient_ramp;
pub mod inner_glow_filter;
pub mod inner_shadow_filter;
pub mod median_filter;
pub mod outer_glow_filter;
pub mod pixelate_filter;
pub mod scratch_count;
pub mod sharpen_filter;
pub mod tint_shader;

pub use bevel_filter::apply_bevel_filter_to_gl;
pub use blur_filter::{
    apply_blur_filter_to_gl, apply_box_blur_filter_to_gl, apply_gaussian_blur_filter_to_gl,
};
pub use color_matrix_filter::apply_color_matrix_filter_to_gl;
pub use convolution_filter::apply_convolution_filter_to_gl;
pub use displacement_map_filter::apply_displacement_map_filter_to_gl;
pub use drop_shadow_filter::apply_drop_shadow_filter_to_gl;
pub use filter_pass::{
    GlFullscreenProgram, clear_gl_filter_program_cache, clear_gl_render_target,
    compile_gl_fullscreen_program, draw_gl_fullscreen_pass,
};
pub use gradient_bevel_filter::apply_gradient_bevel_filter_to_gl;
pub use gradient_glow_filter::apply_gradient_glow_filter_to_gl;
pub use gradient_ramp::create_gl_gradient_ramp_texture;
pub use inner_glow_filter::apply_inner_glow_filter_to_gl;
pub use inner_shadow_filter::apply_inner_shadow_filter_to_gl;
pub use median_filter::apply_median_filter_to_gl;
pub use outer_glow_filter::apply_outer_glow_filter_to_gl;
pub use pixelate_filter::apply_pixelate_filter_to_gl;
pub use scratch_count::{
    get_bevel_filter_gl_scratch_count, get_color_matrix_filter_gl_scratch_count,
    get_convolution_filter_gl_scratch_count, get_displacement_map_filter_gl_scratch_count,
    get_drop_shadow_filter_gl_scratch_count, get_gradient_bevel_filter_gl_scratch_count,
    get_gradient_glow_filter_gl_scratch_count, get_inner_glow_filter_gl_scratch_count,
    get_inner_shadow_filter_gl_scratch_count, get_median_filter_gl_scratch_count,
    get_outer_glow_filter_gl_scratch_count, get_pixelate_filter_gl_scratch_count,
    get_sharpen_filter_gl_scratch_count,
};
pub use sharpen_filter::apply_sharpen_filter_to_gl;
pub use tint_shader::{
    apply_gl_blit_offset_pass, apply_gl_blit_pass, apply_gl_invert_tint_pass, apply_gl_tint_pass,
    get_gl_blit_offset_shader, get_gl_blit_shader, get_gl_invert_tint_shader, get_gl_tint_shader,
};

// Re-export the render-state and render-target types from `flighthq-render-gl`
// so callers only need to import from one crate.
pub use flighthq_render_gl::{GlRenderState, GlRenderTarget};
