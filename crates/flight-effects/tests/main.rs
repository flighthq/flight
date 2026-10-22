use std::sync::{Arc, RwLock};

use flight_effects::contract::*;
use flight_entity::Ref;
use flight_render::{BaseRenderState, EffectPadding, RenderState, create_render_state};

mod auto_exposure_effect_test;
mod barrel_distortion_effect_test;
mod bevel_effect_test;
mod bitmap_displacement_effect_test;
mod blend_effect_test;
mod blend_mode_math_test;
mod bloom_effect_test;
mod blur_downsample_test;
mod blur_effect_test;
mod bokeh_depth_of_field_effect_test;
mod box_blur_math_test;
mod camera_motion_blur_effect_test;
mod chromatic_aberration_effect_test;
mod color_temperature_math_test;
mod composite_effect_test;
mod composite_operator_math_test;
mod contact_shadows_effect_test;
mod convolution_effect_test;
mod crt_effect_test;
mod custom_shader_effect_test;
mod depth_math_test;
mod directional_blur_effect_test;
mod displacement_effect_test;
mod dither_effect_test;
mod drop_shadow_effect_test;
mod edge_detect_math_test;
mod effect_capture_geometry_test;
mod effect_defaults_test;
mod effect_inputs_test;
mod effect_interpolation_test;
mod effect_padding_test;
mod effect_test;
mod effect_validation_test;
mod film_emulation_effect_test;
mod film_grain_effect_test;
mod fxaa_effect_test;
mod gaussian_kernel_test;
mod gaussian_math_test;
mod glitch_effect_test;
mod god_rays_effect_test;
mod god_rays_math_test;
mod gradient_bevel_effect_test;
mod gradient_glow_effect_test;
mod halftone_effect_test;
mod inner_glow_effect_test;
mod inner_shadow_effect_test;
mod kuwahara_effect_test;
mod kuwahara_math_test;
mod lens_dirt_effect_test;
mod lens_distortion_effect_test;
mod lens_flare_effect_test;
mod linear_sampled_gaussian_test;
mod median_effect_test;
mod motion_blur_effect_test;
mod outer_glow_effect_test;
mod outline_effect_test;
mod pannini_projection_effect_test;
mod pixelate_effect_test;
mod posterize_effect_test;
mod radial_blur_effect_test;
mod scanlines_effect_test;
mod screen_space_fog_effect_test;
mod sharpen_effect_test;
mod sketch_effect_test;
mod smaa_effect_test;
mod ssao_effect_test;
mod ssr_effect_test;
mod stylize_math_test;
mod taa_effect_test;
mod tilt_shift_effect_test;
mod tone_map_effect_test;
mod tone_map_math_test;
mod vignette_effect_test;
mod volumetric_light_effect_test;
mod white_balance_effect_test;

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
