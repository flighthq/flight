//! `flighthq-effects-gl` — GL (native OpenGL/ES + WebGL) shader recipes for the
//! substrate-agnostic render-effect pipeline.
//!
//! Each effect recipe is one `apply_*_effect_to_gl` function over GL render
//! targets plus a `DEFAULT_GL_*_EFFECT_RUNNER` constant registered against the
//! matching [`RenderEffect`](flighthq_effects::RenderEffect) variant. The
//! agnostic effect list from `flighthq-effects` drives this backend through the
//! per-state [`render_effect_registry`].
//!
//! - [`render_effect_pipeline`] is the opt-in MSAA-aware post-process pipeline:
//!   the scene renders into an offscreen (optionally HDR) target, then the
//!   effect list runs through the registry ping-ponging pooled targets.
//! - [`render_effect_registry`] maps an effect type string to its GL runner.
//! - [`effect_program_cache`] compiles each fullscreen-pass program once per
//!   state and reuses it every frame.
//!
//! Registration is opt-in — import a runner only to register it — so unused
//! recipes tree-shake away. The design mirrors `flighthq-filters-gl`.

pub mod antialiasing_effects;
pub mod atmospheric_effects;
pub mod color_grade_effects;
pub mod effect_program_cache;
pub mod lens_effects;
pub mod motion_effects;
pub mod render_effect_pipeline;
pub mod render_effect_registrar;
pub mod render_effect_registry;
pub mod stylization_effects;
pub mod tone_effects;

// antialiasing_effects
pub use antialiasing_effects::{
    DEFAULT_GL_FXAA_EFFECT_RUNNER, DEFAULT_GL_SMAA_EFFECT_RUNNER, DEFAULT_GL_TAA_EFFECT_RUNNER,
    apply_fxaa_effect_to_gl, apply_smaa_effect_to_gl, apply_taa_effect_to_gl,
};

// atmospheric_effects
pub use atmospheric_effects::{
    DEFAULT_GL_GOD_RAYS_EFFECT_RUNNER, DEFAULT_GL_SCREEN_SPACE_FOG_EFFECT_RUNNER,
    DEFAULT_GL_SSAO_EFFECT_RUNNER, DEFAULT_GL_SSR_EFFECT_RUNNER, apply_god_rays_effect_to_gl,
    apply_screen_space_fog_effect_to_gl, apply_ssao_effect_to_gl, apply_ssr_effect_to_gl,
};

// color_grade_effects
pub use color_grade_effects::{
    DEFAULT_GL_BRIGHTNESS_CONTRAST_EFFECT_RUNNER, DEFAULT_GL_CHANNEL_MIXER_EFFECT_RUNNER,
    DEFAULT_GL_COLOR_GRADE_EFFECT_RUNNER, DEFAULT_GL_GRAYSCALE_EFFECT_RUNNER,
    DEFAULT_GL_HUE_SATURATION_EFFECT_RUNNER, DEFAULT_GL_INVERT_EFFECT_RUNNER,
    DEFAULT_GL_LIFT_GAMMA_GAIN_EFFECT_RUNNER, DEFAULT_GL_LOOKUP_TABLE_GRADE_EFFECT_RUNNER,
    DEFAULT_GL_POSTERIZE_EFFECT_RUNNER, DEFAULT_GL_SEPIA_EFFECT_RUNNER,
    DEFAULT_GL_WHITE_BALANCE_EFFECT_RUNNER, apply_brightness_contrast_effect_to_gl,
    apply_channel_mixer_effect_to_gl, apply_color_grade_effect_to_gl, apply_grayscale_effect_to_gl,
    apply_hue_saturation_effect_to_gl, apply_invert_effect_to_gl,
    apply_lift_gamma_gain_effect_to_gl, apply_lookup_table_grade_effect_to_gl,
    apply_posterize_effect_to_gl, apply_sepia_effect_to_gl, apply_white_balance_effect_to_gl,
};

// effect_program_cache
pub use effect_program_cache::{
    EFFECT_VERTEX_SRC, GlEffectProgram, clear_gl_effect_program_cache, clear_gl_effect_target,
    compile_gl_effect_program, draw_gl_effect_fullscreen_pass, get_gl_effect_program,
};

// lens_effects
pub use lens_effects::{
    DEFAULT_GL_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER, DEFAULT_GL_CHROMATIC_ABERRATION_EFFECT_RUNNER,
    DEFAULT_GL_DISPLACEMENT_EFFECT_RUNNER, DEFAULT_GL_LENS_DIRT_EFFECT_RUNNER,
    DEFAULT_GL_LENS_DISTORTION_EFFECT_RUNNER, DEFAULT_GL_LENS_FLARE_EFFECT_RUNNER,
    DEFAULT_GL_TILT_SHIFT_EFFECT_RUNNER, DEFAULT_GL_VIGNETTE_EFFECT_RUNNER,
    apply_bokeh_depth_of_field_effect_to_gl, apply_chromatic_aberration_effect_to_gl,
    apply_displacement_effect_to_gl, apply_lens_dirt_effect_to_gl,
    apply_lens_distortion_effect_to_gl, apply_lens_flare_effect_to_gl,
    apply_tilt_shift_effect_to_gl, apply_vignette_effect_to_gl,
};

// motion_effects
pub use motion_effects::{
    DEFAULT_GL_CAMERA_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_GL_DIRECTIONAL_BLUR_EFFECT_RUNNER,
    DEFAULT_GL_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_GL_RADIAL_BLUR_EFFECT_RUNNER,
    apply_camera_motion_blur_effect_to_gl, apply_directional_blur_effect_to_gl,
    apply_motion_blur_effect_to_gl, apply_radial_blur_effect_to_gl,
};

// render_effect_pipeline
pub use render_effect_pipeline::{
    GlPipelineDepth, GlRenderEffectPipeline, GlRenderEffectPipelineOptions,
    begin_gl_render_effect_pipeline, create_gl_render_effect_pipeline,
    destroy_gl_render_effect_pipeline, end_gl_render_effect_pipeline,
    set_gl_render_effect_velocity_texture,
};

// render_effect_registrar
pub use render_effect_registrar::{
    get_gl_render_effect_kinds, register_antialiasing_gl_render_effects,
    register_bloom_gl_render_effects, register_blur_gl_render_effects,
    register_color_gl_render_effects, register_color_grade_gl_render_effects,
    register_default_gl_render_effects, register_screen_space_gl_render_effects,
    register_standard_gl_render_effects, register_stylize_gl_render_effects,
};

// render_effect_registry
pub use render_effect_registry::{
    GlRenderEffectContext, GlRenderEffectRunner, get_gl_render_effect_runner,
    gl_render_effect_type, has_gl_render_effect_runner, register_gl_render_effect,
};

// stylization_effects
pub use stylization_effects::{
    DEFAULT_GL_CRT_EFFECT_RUNNER, DEFAULT_GL_DITHER_EFFECT_RUNNER,
    DEFAULT_GL_FILM_GRAIN_EFFECT_RUNNER, DEFAULT_GL_GLITCH_EFFECT_RUNNER,
    DEFAULT_GL_HALFTONE_EFFECT_RUNNER, DEFAULT_GL_KUWAHARA_EFFECT_RUNNER,
    DEFAULT_GL_OUTLINE_EFFECT_RUNNER, DEFAULT_GL_PIXELATE_EFFECT_RUNNER,
    DEFAULT_GL_SCANLINES_EFFECT_RUNNER, DEFAULT_GL_SHARPEN_EFFECT_RUNNER,
    DEFAULT_GL_SKETCH_EFFECT_RUNNER, apply_crt_effect_to_gl, apply_dither_effect_to_gl,
    apply_film_grain_effect_to_gl, apply_glitch_effect_to_gl, apply_halftone_effect_to_gl,
    apply_kuwahara_effect_to_gl, apply_outline_effect_to_gl, apply_pixelate_effect_to_gl,
    apply_scanlines_effect_to_gl, apply_sharpen_effect_to_gl, apply_sketch_effect_to_gl,
};

// tone_effects
pub use tone_effects::{
    DEFAULT_GL_BLOOM_EFFECT_RUNNER, DEFAULT_GL_EXPOSURE_EFFECT_RUNNER,
    DEFAULT_GL_TONE_MAP_EFFECT_RUNNER, apply_bloom_effect_to_gl, apply_exposure_effect_to_gl,
    apply_tone_map_effect_to_gl,
};
