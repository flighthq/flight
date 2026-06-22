//! `flighthq-filters-wgpu` — wgpu (Vulkan/Metal/DX12 + WebGPU) multi-pass
//! shader implementations for bitmap filter effects.
//!
//! The design mirrors `flighthq-filters-gl`:
//! - Each filter is one public function receiving a `WgpuRenderState`, a
//!   caller-owned `WgpuFilterState` (the per-context filter infrastructure:
//!   uniform ring buffer, bind-group layouts, sampler, and pipeline caches),
//!   and one or more `WgpuRenderTarget` objects.
//! - Scratch targets are caller-provided; this crate allocates no GPU resources
//!   per call except `create_wgpu_gradient_ramp_texture` (which returns an owned
//!   `wgpu::Texture` the caller must `destroy()`) and the transient gradient ramp
//!   textures used by the gradient filters.
//! - The `filter_pass` module exposes the low-level pipeline types
//!   (`WgpuFilterPipeline`, `WgpuDualSourcePipeline`) and the uniform-ring-buffer
//!   infrastructure used by all passes.
//! - `tint_shader` and related modules implement the reusable primitives
//!   (tint, invert-tint, blit, blit-offset, inner-clip) that higher-level
//!   filters compose.
//!
//! The TS reference (`packages/filters-webgpu`) keeps the per-context filter
//! infrastructure in a `WeakMap<WebGPURenderState, ...>`. Rust has no WeakMap and
//! adding shared module-top-level mutable state is disallowed, so the
//! infrastructure is instead an explicit caller-owned `WgpuFilterState` — the
//! same explicit-ownership shape as `WgpuRenderTargetPool` in `flighthq-render-wgpu`.

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
pub mod sharpen_filter;
pub mod tint_shader;

pub use bevel_filter::apply_bevel_filter_to_wgpu;
pub use blur_filter::{apply_box_blur_filter_to_wgpu, apply_gaussian_blur_filter_to_wgpu};
pub use color_matrix_filter::apply_color_matrix_filter_to_wgpu;
pub use convolution_filter::apply_convolution_filter_to_wgpu;
pub use displacement_map_filter::apply_displacement_map_filter_to_wgpu;
pub use drop_shadow_filter::apply_drop_shadow_filter_to_wgpu;
pub use filter_pass::{
    FILTER_VERTEX_WGSL, WgpuBlendMode, WgpuDualSourcePipeline, WgpuFilterPipeline, WgpuFilterState,
    WgpuUniformSlot, clear_wgpu_filter_target, create_wgpu_dual_source_pipeline,
    create_wgpu_filter_pipeline, create_wgpu_filter_state, create_wgpu_triple_source_pipeline,
    destroy_wgpu_filter_state, draw_wgpu_dual_source_pass, draw_wgpu_filter_pass,
    draw_wgpu_triple_source_pass,
};
pub use gradient_bevel_filter::apply_gradient_bevel_filter_to_wgpu;
pub use gradient_glow_filter::apply_gradient_glow_filter_to_wgpu;
pub use gradient_ramp::{build_gradient_ramp_data, create_wgpu_gradient_ramp_texture};
pub use inner_glow_filter::apply_inner_glow_filter_to_wgpu;
pub use inner_shadow_filter::apply_inner_shadow_filter_to_wgpu;
pub use median_filter::apply_median_filter_to_wgpu;
pub use outer_glow_filter::apply_outer_glow_filter_to_wgpu;
pub use pixelate_filter::apply_pixelate_filter_to_wgpu;
pub use sharpen_filter::apply_sharpen_filter_to_wgpu;
pub use tint_shader::{
    apply_wgpu_blit_offset_pass, apply_wgpu_blit_pass, apply_wgpu_inner_clip_pass,
    apply_wgpu_invert_tint_pass, apply_wgpu_tint_pass, get_wgpu_blit_offset_shader,
    get_wgpu_blit_shader, get_wgpu_inner_clip_shader, get_wgpu_invert_tint_shader,
    get_wgpu_tint_shader,
};

// Re-export the render-wgpu state/target types these filters operate on, so callers
// can name them through this crate without depending on `flighthq-render-wgpu` directly.
pub use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};
