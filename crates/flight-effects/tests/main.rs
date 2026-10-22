use std::sync::{Arc, RwLock};

use flight_effects::contract::*;
use flight_entity::Ref;
use flight_render::{BaseRenderState, EffectPadding, RenderState, create_render_state};

pub(crate) fn effect_ref<T: Effect + 'static>(effect: Ref<T>) -> EffectRef {
    return effect;
}

pub(crate) fn owned_effect<T: Effect + 'static>(effect: T) -> EffectRef {
    return Arc::new(RwLock::new(effect));
}

pub(crate) fn assert_effect_kind<T: Effect + 'static>(effect: &Ref<T>, expected: &str) {
    assert_eq!(effect.read().unwrap().effect_fields().kind, expected);
}

pub(crate) fn assert_close(actual: f32, expected: f32, ts_bound: f32) {
    let roundoff = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    let bound = ts_bound.max(roundoff);
    assert!(
        (actual - expected).abs() <= bound,
        "actual={actual}, expected={expected}, bound={bound}"
    );
}

pub(crate) fn assert_sum_close(actual: f32, expected: f32, terms: usize, ts_bound: f32) {
    let accumulation = terms as f32 * f32::EPSILON * expected.abs().max(1.0);
    let bound = ts_bound.max(accumulation);
    assert!(
        (actual - expected).abs() <= bound,
        "actual={actual}, expected={expected}, bound={bound}"
    );
}

pub(crate) fn fresh_render_state() -> BaseRenderState {
    return create_render_state();
}

pub(crate) fn has_padding_resolver(state: &BaseRenderState, kind: &str) -> bool {
    return state
        .render_registries()
        .effect_padding_resolvers
        .as_ref()
        .is_some_and(|resolvers| resolvers.entries.contains_key(kind));
}

pub(crate) fn zero_padding() -> EffectPadding {
    return EffectPadding {
        bottom: 0.0,
        left: 0.0,
        right: 0.0,
        top: 0.0,
    };
}

#[path = "auto_exposure_effect_test.rs"]
mod flight_effects_auto_exposure_effect_test;
#[path = "barrel_distortion_effect_test.rs"]
mod flight_effects_barrel_distortion_effect_test;
#[path = "bevel_effect_test.rs"]
mod flight_effects_bevel_effect_test;
#[path = "bitmap_displacement_effect_test.rs"]
mod flight_effects_bitmap_displacement_effect_test;
#[path = "blend_effect_test.rs"]
mod flight_effects_blend_effect_test;
#[path = "blend_mode_math_test.rs"]
mod flight_effects_blend_mode_math_test;
#[path = "bloom_effect_test.rs"]
mod flight_effects_bloom_effect_test;
#[path = "blur_downsample_test.rs"]
mod flight_effects_blur_downsample_test;
#[path = "blur_effect_test.rs"]
mod flight_effects_blur_effect_test;
#[path = "bokeh_depth_of_field_effect_test.rs"]
mod flight_effects_bokeh_depth_of_field_effect_test;
#[path = "box_blur_math_test.rs"]
mod flight_effects_box_blur_math_test;
#[path = "camera_motion_blur_effect_test.rs"]
mod flight_effects_camera_motion_blur_effect_test;
#[path = "chromatic_aberration_effect_test.rs"]
mod flight_effects_chromatic_aberration_effect_test;
#[path = "color_temperature_math_test.rs"]
mod flight_effects_color_temperature_math_test;
#[path = "composite_effect_test.rs"]
mod flight_effects_composite_effect_test;
#[path = "composite_operator_math_test.rs"]
mod flight_effects_composite_operator_math_test;
#[path = "contact_shadows_effect_test.rs"]
mod flight_effects_contact_shadows_effect_test;
#[path = "convolution_effect_test.rs"]
mod flight_effects_convolution_effect_test;
#[path = "crt_effect_test.rs"]
mod flight_effects_crt_effect_test;
#[path = "custom_shader_effect_test.rs"]
mod flight_effects_custom_shader_effect_test;
#[path = "depth_math_test.rs"]
mod flight_effects_depth_math_test;
#[path = "directional_blur_effect_test.rs"]
mod flight_effects_directional_blur_effect_test;
#[path = "displacement_effect_test.rs"]
mod flight_effects_displacement_effect_test;
#[path = "dither_effect_test.rs"]
mod flight_effects_dither_effect_test;
#[path = "drop_shadow_effect_test.rs"]
mod flight_effects_drop_shadow_effect_test;
#[path = "edge_detect_math_test.rs"]
mod flight_effects_edge_detect_math_test;
#[path = "effect_capture_geometry_test.rs"]
mod flight_effects_effect_capture_geometry_test;
#[path = "effect_defaults_test.rs"]
mod flight_effects_effect_defaults_test;
#[path = "effect_inputs_test.rs"]
mod flight_effects_effect_inputs_test;
#[path = "effect_interpolation_test.rs"]
mod flight_effects_effect_interpolation_test;
#[path = "effect_padding_test.rs"]
mod flight_effects_effect_padding_test;
#[path = "effect_test.rs"]
mod flight_effects_effect_test;
#[path = "effect_validation_test.rs"]
mod flight_effects_effect_validation_test;
#[path = "film_emulation_effect_test.rs"]
mod flight_effects_film_emulation_effect_test;
#[path = "film_grain_effect_test.rs"]
mod flight_effects_film_grain_effect_test;
#[path = "fxaa_effect_test.rs"]
mod flight_effects_fxaa_effect_test;
#[path = "gaussian_kernel_test.rs"]
mod flight_effects_gaussian_kernel_test;
#[path = "gaussian_math_test.rs"]
mod flight_effects_gaussian_math_test;
#[path = "glitch_effect_test.rs"]
mod flight_effects_glitch_effect_test;
#[path = "god_rays_effect_test.rs"]
mod flight_effects_god_rays_effect_test;
#[path = "god_rays_math_test.rs"]
mod flight_effects_god_rays_math_test;
#[path = "gradient_bevel_effect_test.rs"]
mod flight_effects_gradient_bevel_effect_test;
#[path = "gradient_glow_effect_test.rs"]
mod flight_effects_gradient_glow_effect_test;
#[path = "halftone_effect_test.rs"]
mod flight_effects_halftone_effect_test;
#[path = "inner_glow_effect_test.rs"]
mod flight_effects_inner_glow_effect_test;
#[path = "inner_shadow_effect_test.rs"]
mod flight_effects_inner_shadow_effect_test;
#[path = "kuwahara_effect_test.rs"]
mod flight_effects_kuwahara_effect_test;
#[path = "kuwahara_math_test.rs"]
mod flight_effects_kuwahara_math_test;
#[path = "lens_dirt_effect_test.rs"]
mod flight_effects_lens_dirt_effect_test;
#[path = "lens_distortion_effect_test.rs"]
mod flight_effects_lens_distortion_effect_test;
#[path = "lens_flare_effect_test.rs"]
mod flight_effects_lens_flare_effect_test;
#[path = "linear_sampled_gaussian_test.rs"]
mod flight_effects_linear_sampled_gaussian_test;
#[path = "median_effect_test.rs"]
mod flight_effects_median_effect_test;
#[path = "motion_blur_effect_test.rs"]
mod flight_effects_motion_blur_effect_test;
#[path = "outer_glow_effect_test.rs"]
mod flight_effects_outer_glow_effect_test;
#[path = "outline_effect_test.rs"]
mod flight_effects_outline_effect_test;
#[path = "pannini_projection_effect_test.rs"]
mod flight_effects_pannini_projection_effect_test;
#[path = "pixelate_effect_test.rs"]
mod flight_effects_pixelate_effect_test;
#[path = "posterize_effect_test.rs"]
mod flight_effects_posterize_effect_test;
#[path = "radial_blur_effect_test.rs"]
mod flight_effects_radial_blur_effect_test;
#[path = "scanlines_effect_test.rs"]
mod flight_effects_scanlines_effect_test;
#[path = "screen_space_fog_effect_test.rs"]
mod flight_effects_screen_space_fog_effect_test;
#[path = "sharpen_effect_test.rs"]
mod flight_effects_sharpen_effect_test;
#[path = "sketch_effect_test.rs"]
mod flight_effects_sketch_effect_test;
#[path = "smaa_effect_test.rs"]
mod flight_effects_smaa_effect_test;
#[path = "ssao_effect_test.rs"]
mod flight_effects_ssao_effect_test;
#[path = "ssr_effect_test.rs"]
mod flight_effects_ssr_effect_test;
#[path = "stylize_math_test.rs"]
mod flight_effects_stylize_math_test;
#[path = "taa_effect_test.rs"]
mod flight_effects_taa_effect_test;
#[path = "tilt_shift_effect_test.rs"]
mod flight_effects_tilt_shift_effect_test;
#[path = "tone_map_effect_test.rs"]
mod flight_effects_tone_map_effect_test;
#[path = "tone_map_math_test.rs"]
mod flight_effects_tone_map_math_test;
#[path = "vignette_effect_test.rs"]
mod flight_effects_vignette_effect_test;
#[path = "volumetric_light_effect_test.rs"]
mod flight_effects_volumetric_light_effect_test;
#[path = "white_balance_effect_test.rs"]
mod flight_effects_white_balance_effect_test;
