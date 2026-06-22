//! `flighthq-effects` — render-effect intents and substrate-agnostic recipe math.
//!
//! Each effect is a plain-data descriptor struct.  Per-backend recipes (in
//! `flighthq-effects-gl` and `flighthq-effects-wgpu`) register runners against
//! the [`RenderEffect`] variant and dispatch an agnostic `&[RenderEffect]`
//! through their pipeline, so one intent list drives every backend.
//!
//! Colors are packed RGBA integers (`0xRRGGBBAA`).

pub mod antialiasing_effects;
pub mod atmospheric_effects;
pub mod color_grade_effects;
pub mod lens_effects;
pub mod motion_effects;
pub mod stylization_effects;
pub mod tone_effects;
pub mod types;

// Re-export the complete public surface at the crate root.

// types — effect descriptors and RenderEffect enum
pub use types::{
    BloomEffect, BokehDepthOfFieldEffect, BrightnessContrastEffect, CameraMotionBlurEffect,
    ChannelMixerEffect, ChromaticAberrationEffect, ColorGradeEffect, CrtEffect,
    DirectionalBlurEffect, DisplacementEffect, DitherEffect, ExposureEffect, FilmGrainEffect,
    FxaaEffect, GlitchEffect, GodRaysEffect, GrayscaleEffect, HalftoneEffect, HueSaturationEffect,
    InvertEffect, KuwaharaEffect, LensDirtEffect, LensDistortionEffect, LensFlareEffect,
    LiftGammaGainEffect, LookupTableGradeEffect, MotionBlurEffect, OutlineEffect, PixelateEffect,
    PosterizeEffect, RadialBlurEffect, RenderEffect, ScanlinesEffect, ScreenSpaceFogEffect,
    SepiaEffect, SharpenEffect, SketchEffect, SmaaEffect, SsaoEffect, SsrEffect, TaaEffect,
    TiltShiftEffect, ToneMapEffect, ToneMapOperator, VignetteEffect, WhiteBalanceEffect,
};

// antialiasing_effects
pub use antialiasing_effects::{create_fxaa_effect, create_smaa_effect, create_taa_effect};

// atmospheric_effects
pub use atmospheric_effects::{
    create_god_rays_effect, create_screen_space_fog_effect, create_ssao_effect, create_ssr_effect,
};

// color_grade_effects
pub use color_grade_effects::{
    create_brightness_contrast_effect, create_channel_mixer_effect, create_color_grade_effect,
    create_grayscale_effect, create_hue_saturation_effect, create_invert_effect,
    create_lift_gamma_gain_effect, create_lookup_table_grade_effect, create_posterize_effect,
    create_sepia_effect, create_white_balance_effect,
};

// lens_effects
pub use lens_effects::{
    create_bokeh_depth_of_field_effect, create_chromatic_aberration_effect,
    create_displacement_effect, create_lens_dirt_effect, create_lens_distortion_effect,
    create_lens_flare_effect, create_tilt_shift_effect, create_vignette_effect,
};

// motion_effects
pub use motion_effects::{
    create_camera_motion_blur_effect, create_directional_blur_effect, create_motion_blur_effect,
    create_radial_blur_effect,
};

// stylization_effects
pub use stylization_effects::{
    create_crt_effect, create_dither_effect, create_film_grain_effect, create_glitch_effect,
    create_halftone_effect, create_kuwahara_effect, create_outline_effect, create_pixelate_effect,
    create_scanlines_effect, create_sharpen_effect, create_sketch_effect,
};

// tone_effects
pub use tone_effects::{
    compute_bloom_blur_radius, create_bloom_effect, create_exposure_effect, create_tone_map_effect,
};
