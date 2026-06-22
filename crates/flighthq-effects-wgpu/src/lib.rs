//! `flighthq-effects-wgpu` — wgpu (Vulkan/Metal/DX12 + WebGPU) shader recipes
//! for the substrate-agnostic render-effect pipeline.
//!
//! Each effect recipe is one `apply_*_effect_to_wgpu` function over WGPU render
//! targets plus a `DEFAULT_WGPU_*_EFFECT_RUNNER` constant registered against the
//! matching [`RenderEffect`](flighthq_effects::RenderEffect) variant. The
//! agnostic effect list from `flighthq-effects` drives this backend through the
//! per-state [`render_effect_registry`] — the same `&[RenderEffect]` drives the
//! GL backend.
//!
//! - [`render_effect_pipeline`] is the opt-in MSAA-aware post-process pipeline:
//!   the scene renders into an offscreen (optionally HDR) target, then the
//!   effect list runs through the registry ping-ponging pooled targets.
//! - [`render_effect_registry`] maps an effect type string to its WGPU runner.
//! - [`effect_program_cache`] compiles each fullscreen filter pipeline once per
//!   state and reuses it every frame.
//!
//! Registration is opt-in — import a runner only to register it — so unused
//! recipes tree-shake away. The design mirrors `flighthq-effects-gl`.

pub mod antialiasing_effects;
pub mod atmospheric_effects;
pub mod color_grade_effects;
pub mod effect_program_cache;
pub mod lens_effects;
pub mod motion_effects;
pub mod render_effect_pipeline;
pub mod render_effect_registry;
pub mod stylization_effects;
#[cfg(test)]
pub(crate) mod test_support;
pub mod tone_effects;

// antialiasing_effects
pub use antialiasing_effects::{
    DEFAULT_WGPU_FXAA_EFFECT_RUNNER, DEFAULT_WGPU_SMAA_EFFECT_RUNNER,
    DEFAULT_WGPU_TAA_EFFECT_RUNNER, apply_fxaa_effect_to_wgpu, apply_smaa_effect_to_wgpu,
    apply_taa_effect_to_wgpu,
};

// atmospheric_effects
pub use atmospheric_effects::{
    DEFAULT_WGPU_GOD_RAYS_EFFECT_RUNNER, DEFAULT_WGPU_SCREEN_SPACE_FOG_EFFECT_RUNNER,
    DEFAULT_WGPU_SSAO_EFFECT_RUNNER, DEFAULT_WGPU_SSR_EFFECT_RUNNER, apply_god_rays_effect_to_wgpu,
    apply_screen_space_fog_effect_to_wgpu, apply_ssao_effect_to_wgpu, apply_ssr_effect_to_wgpu,
};

// color_grade_effects
pub use color_grade_effects::{
    DEFAULT_WGPU_BRIGHTNESS_CONTRAST_EFFECT_RUNNER, DEFAULT_WGPU_CHANNEL_MIXER_EFFECT_RUNNER,
    DEFAULT_WGPU_COLOR_GRADE_EFFECT_RUNNER, DEFAULT_WGPU_GRAYSCALE_EFFECT_RUNNER,
    DEFAULT_WGPU_HUE_SATURATION_EFFECT_RUNNER, DEFAULT_WGPU_INVERT_EFFECT_RUNNER,
    DEFAULT_WGPU_LIFT_GAMMA_GAIN_EFFECT_RUNNER, DEFAULT_WGPU_LOOKUP_TABLE_GRADE_EFFECT_RUNNER,
    DEFAULT_WGPU_POSTERIZE_EFFECT_RUNNER, DEFAULT_WGPU_SEPIA_EFFECT_RUNNER,
    DEFAULT_WGPU_WHITE_BALANCE_EFFECT_RUNNER, apply_brightness_contrast_effect_to_wgpu,
    apply_channel_mixer_effect_to_wgpu, apply_color_grade_effect_to_wgpu,
    apply_grayscale_effect_to_wgpu, apply_hue_saturation_effect_to_wgpu,
    apply_invert_effect_to_wgpu, apply_lift_gamma_gain_effect_to_wgpu,
    apply_lookup_table_grade_effect_to_wgpu, apply_posterize_effect_to_wgpu,
    apply_sepia_effect_to_wgpu, apply_white_balance_effect_to_wgpu,
};

// effect_program_cache
pub use effect_program_cache::{
    WgpuEffectBlend, WgpuFilterPipeline, build_wgpu_effect_module_wgsl,
    clear_wgpu_effect_pipeline_cache, draw_wgpu_dual_source_effect_pass,
    draw_wgpu_effect_filter_pass, ensure_wgpu_effect_pipeline,
    get_wgpu_dual_source_effect_pipeline, get_wgpu_effect_pipeline,
};

// lens_effects
pub use lens_effects::{
    DEFAULT_WGPU_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER,
    DEFAULT_WGPU_CHROMATIC_ABERRATION_EFFECT_RUNNER, DEFAULT_WGPU_DISPLACEMENT_EFFECT_RUNNER,
    DEFAULT_WGPU_LENS_DIRT_EFFECT_RUNNER, DEFAULT_WGPU_LENS_DISTORTION_EFFECT_RUNNER,
    DEFAULT_WGPU_LENS_FLARE_EFFECT_RUNNER, DEFAULT_WGPU_TILT_SHIFT_EFFECT_RUNNER,
    DEFAULT_WGPU_VIGNETTE_EFFECT_RUNNER, apply_bokeh_depth_of_field_effect_to_wgpu,
    apply_chromatic_aberration_effect_to_wgpu, apply_displacement_effect_to_wgpu,
    apply_lens_dirt_effect_to_wgpu, apply_lens_distortion_effect_to_wgpu,
    apply_lens_flare_effect_to_wgpu, apply_tilt_shift_effect_to_wgpu,
    apply_vignette_effect_to_wgpu,
};

// motion_effects
pub use motion_effects::{
    DEFAULT_WGPU_CAMERA_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_WGPU_DIRECTIONAL_BLUR_EFFECT_RUNNER,
    DEFAULT_WGPU_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_WGPU_RADIAL_BLUR_EFFECT_RUNNER,
    apply_camera_motion_blur_effect_to_wgpu, apply_directional_blur_effect_to_wgpu,
    apply_motion_blur_effect_to_wgpu, apply_radial_blur_effect_to_wgpu,
};

// render_effect_pipeline
pub use render_effect_pipeline::{
    WgpuPipelineDepth, WgpuRenderEffectPipeline, WgpuRenderEffectPipelineOptions,
    begin_wgpu_render_effect_pipeline, create_wgpu_render_effect_pipeline,
    destroy_wgpu_render_effect_pipeline, end_wgpu_render_effect_pipeline,
    set_wgpu_render_effect_velocity_texture,
};

// render_effect_registry
pub use render_effect_registry::{
    WgpuRenderEffectContext, WgpuRenderEffectRunner, clear_wgpu_render_effect_registry,
    get_wgpu_render_effect_runner, register_wgpu_render_effect, wgpu_render_effect_type,
};

// stylization_effects
pub use stylization_effects::{
    DEFAULT_WGPU_CRT_EFFECT_RUNNER, DEFAULT_WGPU_DITHER_EFFECT_RUNNER,
    DEFAULT_WGPU_FILM_GRAIN_EFFECT_RUNNER, DEFAULT_WGPU_GLITCH_EFFECT_RUNNER,
    DEFAULT_WGPU_HALFTONE_EFFECT_RUNNER, DEFAULT_WGPU_KUWAHARA_EFFECT_RUNNER,
    DEFAULT_WGPU_OUTLINE_EFFECT_RUNNER, DEFAULT_WGPU_PIXELATE_EFFECT_RUNNER,
    DEFAULT_WGPU_SCANLINES_EFFECT_RUNNER, DEFAULT_WGPU_SHARPEN_EFFECT_RUNNER,
    DEFAULT_WGPU_SKETCH_EFFECT_RUNNER, apply_crt_effect_to_wgpu, apply_dither_effect_to_wgpu,
    apply_film_grain_effect_to_wgpu, apply_glitch_effect_to_wgpu, apply_halftone_effect_to_wgpu,
    apply_kuwahara_effect_to_wgpu, apply_outline_effect_to_wgpu, apply_pixelate_effect_to_wgpu,
    apply_scanlines_effect_to_wgpu, apply_sharpen_effect_to_wgpu, apply_sketch_effect_to_wgpu,
};

// tone_effects
pub use tone_effects::{
    DEFAULT_WGPU_BLOOM_EFFECT_RUNNER, DEFAULT_WGPU_EXPOSURE_EFFECT_RUNNER,
    DEFAULT_WGPU_TONE_MAP_EFFECT_RUNNER, apply_bloom_effect_to_wgpu, apply_exposure_effect_to_wgpu,
    apply_tone_map_effect_to_wgpu,
};
