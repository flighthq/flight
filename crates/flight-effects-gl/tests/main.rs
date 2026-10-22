mod gl_test_helper;

use std::sync::{Arc, RwLock};

use flight_effects::{EffectFields, EffectRef, EffectValue};
use flight_effects_gl::contract::{GlEffectContext, GlEffectState};
use flight_entity::{FlightError, Record, set_record_value};
use flight_render_gl::GlRenderState;

/// A bare effect of an arbitrary kind, the Rust form of the TS tests' `allocateEntity` + `kind`.
#[derive(Default)]
pub(crate) struct TestEffect {
    fields: EffectFields,
}

flight_effects::impl_effect!(TestEffect);

pub(crate) fn make_effect(kind: &str) -> EffectRef {
    let mut effect: TestEffect = flight_entity::allocate_entity();
    flight_effects::initialize_effect(&mut effect, kind);
    return Arc::new(RwLock::new(effect));
}

/// A bare effect carrying one extra structural field (TS `{ kind, ...extra }`).
pub(crate) fn make_effect_with_field(kind: &str, key: &str, value: EffectValue) -> EffectRef {
    let mut effect: TestEffect = flight_entity::allocate_entity();
    flight_effects::initialize_effect(&mut effect, kind);
    effect.fields.extra_fields.insert(key.to_string(), value);
    return Arc::new(RwLock::new(effect));
}

pub(crate) fn make_effects(kinds: &[&str]) -> Vec<EffectRef> {
    return kinds.iter().map(|kind| make_effect(kind)).collect();
}

/// D1 f32 bound: `max(TS bound, 4·ε·max(1, |expected|))`.
pub(crate) fn assert_close(actual: f32, expected: f32, ts_bound: f32) {
    let roundoff = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    let bound = ts_bound.max(roundoff);
    assert!(
        (actual - expected).abs() <= bound,
        "expected {actual} to be within {bound} of {expected}"
    );
}

/// Builds the context the pipeline hands a runner (fresh source/dest targets of the given size and
/// an empty pool) and passes it to `run`, which calls the runner under test.
pub(crate) fn with_effect_context(
    state: &mut GlRenderState,
    width: f32,
    height: f32,
    run: impl FnOnce(&mut GlEffectContext<'_>) -> Result<(), String>,
) -> Result<(), String> {
    let source = gl_test_helper::make_texture_target(state, width, height);
    let dest = gl_test_helper::make_texture_target(state, width, height);
    let mut pool = flight_render_gl::create_gl_texture_render_target_pool();
    let mut context = GlEffectContext {
        state,
        source: &source,
        dest: &dest,
        pool: &mut pool,
        scene_depth_texture: None,
        scene_velocity_texture: None,
    };
    return run(&mut context);
}

pub(crate) fn make_pipeline(state: &GlRenderState) -> GlEffectState {
    return flight_effects_gl::contract::create_gl_effect_state(state, None);
}

/// Leases a render texture from `pool` (TS `acquireGlRenderTexture(state, pool, { width, height })`).
pub(crate) fn lease_render_texture(
    state: &GlRenderState,
    pool: &mut flight_render_gl::GlRenderTexturePool,
    width: f32,
    height: f32,
) -> flight_render::RenderTexture {
    return flight_render_gl::acquire_gl_render_texture(
        state,
        pool,
        &gl_test_helper::make_target_descriptor(width, height),
    )
    .unwrap();
}

/// Realizes and publishes a render texture (TS `writeGlRenderTextureTarget(state, rt, () => {})`).
pub(crate) fn publish_render_texture(
    state: &mut GlRenderState,
    render_texture: &mut flight_render::RenderTexture,
) {
    flight_render_gl::write_gl_render_texture_target(state, render_texture, |_state, _target| {
        Ok(())
    })
    .unwrap();
}

/// TS `Record<string, number>` bindings for the GLSL evaluator.
pub(crate) fn bindings(entries: &[(&str, f32)]) -> Record<f32> {
    let mut record = Record::default();
    for (key, value) in entries {
        set_record_value(&mut record, key.to_string(), *value);
    }
    return record;
}

/// Asserts that `run` throws a D10 `FlightError` whose message contains `needle`.
pub(crate) fn expect_error(run: impl FnOnce() + std::panic::UnwindSafe, needle: &str) {
    let error = std::panic::catch_unwind(run).unwrap_err();
    let error = error.downcast_ref::<FlightError>().unwrap();
    assert!(
        error.message.contains(needle),
        "expected {:?} to contain {needle:?}",
        error.message
    );
}

/// A new render state on `screen`'s context whose GL registries start as `screen`'s current
/// snapshot (TS `createGlRenderState(screen.gl, { ...getGlRenderStateRuntime(screen).registries })`).
pub(crate) fn derive_render_state(screen: &GlRenderState) -> GlRenderState {
    return flight_render_gl::create_gl_render_state(
        screen.context_state.clone(),
        Some(&flight_render_gl::GlRenderStateOptions {
            gl_registries: screen.gl_registries.clone(),
            ..Default::default()
        }),
    );
}

#[path = "enable_gl_effect_guards_test.rs"]
mod flight_effects_gl_enable_gl_effect_guards_test;
#[path = "gl_bevel_effect_test.rs"]
mod flight_effects_gl_gl_bevel_effect_test;
#[path = "gl_bitmap_displacement_effect_test.rs"]
mod flight_effects_gl_gl_bitmap_displacement_effect_test;
#[path = "gl_blend_effect_test.rs"]
mod flight_effects_gl_gl_blend_effect_test;
#[path = "gl_bloom_effect_test.rs"]
mod flight_effects_gl_gl_bloom_effect_test;
#[path = "gl_blur_effect_test.rs"]
mod flight_effects_gl_gl_blur_effect_test;
#[path = "gl_bokeh_depth_of_field_effect_test.rs"]
mod flight_effects_gl_gl_bokeh_depth_of_field_effect_test;
#[path = "gl_camera_motion_blur_effect_test.rs"]
mod flight_effects_gl_gl_camera_motion_blur_effect_test;
#[path = "gl_chromatic_aberration_effect_test.rs"]
mod flight_effects_gl_gl_chromatic_aberration_effect_test;
#[path = "gl_color_lut_pass_test.rs"]
mod flight_effects_gl_gl_color_lut_pass_test;
#[path = "gl_color_matrix_pass_test.rs"]
mod flight_effects_gl_gl_color_matrix_pass_test;
#[path = "gl_composite_effect_test.rs"]
mod flight_effects_gl_gl_composite_effect_test;
#[path = "gl_contact_shadows_effect_test.rs"]
mod flight_effects_gl_gl_contact_shadows_effect_test;
#[path = "gl_convolution_effect_test.rs"]
mod flight_effects_gl_gl_convolution_effect_test;
#[path = "gl_crt_effect_test.rs"]
mod flight_effects_gl_gl_crt_effect_test;
#[path = "gl_custom_shader_effect_test.rs"]
mod flight_effects_gl_gl_custom_shader_effect_test;
#[path = "gl_directional_blur_effect_test.rs"]
mod flight_effects_gl_gl_directional_blur_effect_test;
#[path = "gl_displacement_effect_test.rs"]
mod flight_effects_gl_gl_displacement_effect_test;
#[path = "gl_dither_effect_test.rs"]
mod flight_effects_gl_gl_dither_effect_test;
#[path = "gl_drop_shadow_effect_test.rs"]
mod flight_effects_gl_gl_drop_shadow_effect_test;
#[path = "gl_effect_blit_shader_test.rs"]
mod flight_effects_gl_gl_effect_blit_shader_test;
#[path = "gl_effect_box_blur_test.rs"]
mod flight_effects_gl_gl_effect_box_blur_test;
#[path = "gl_effect_gradient_ramp_test.rs"]
mod flight_effects_gl_gl_effect_gradient_ramp_test;
#[path = "gl_effect_program_cache_test.rs"]
mod flight_effects_gl_gl_effect_program_cache_test;
#[path = "gl_effect_registry_test.rs"]
mod flight_effects_gl_gl_effect_registry_test;
#[path = "gl_effect_state_test.rs"]
mod flight_effects_gl_gl_effect_state_test;
#[path = "gl_effect_tint_shader_test.rs"]
mod flight_effects_gl_gl_effect_tint_shader_test;
#[path = "gl_film_grain_effect_test.rs"]
mod flight_effects_gl_gl_film_grain_effect_test;
#[path = "gl_fxaa_effect_test.rs"]
mod flight_effects_gl_gl_fxaa_effect_test;
#[path = "gl_glitch_effect_test.rs"]
mod flight_effects_gl_gl_glitch_effect_test;
#[path = "gl_god_rays_effect_test.rs"]
mod flight_effects_gl_gl_god_rays_effect_test;
#[path = "gl_gradient_bevel_effect_test.rs"]
mod flight_effects_gl_gl_gradient_bevel_effect_test;
#[path = "gl_gradient_glow_effect_test.rs"]
mod flight_effects_gl_gl_gradient_glow_effect_test;
#[path = "gl_halftone_effect_test.rs"]
mod flight_effects_gl_gl_halftone_effect_test;
#[path = "gl_inner_glow_effect_test.rs"]
mod flight_effects_gl_gl_inner_glow_effect_test;
#[path = "gl_inner_shadow_effect_test.rs"]
mod flight_effects_gl_gl_inner_shadow_effect_test;
#[path = "gl_kuwahara_effect_test.rs"]
mod flight_effects_gl_gl_kuwahara_effect_test;
#[path = "gl_lens_dirt_effect_test.rs"]
mod flight_effects_gl_gl_lens_dirt_effect_test;
#[path = "gl_lens_distortion_effect_test.rs"]
mod flight_effects_gl_gl_lens_distortion_effect_test;
#[path = "gl_lens_flare_effect_test.rs"]
mod flight_effects_gl_gl_lens_flare_effect_test;
#[path = "gl_median_effect_test.rs"]
mod flight_effects_gl_gl_median_effect_test;
#[path = "gl_motion_blur_effect_test.rs"]
mod flight_effects_gl_gl_motion_blur_effect_test;
#[path = "gl_outer_glow_effect_test.rs"]
mod flight_effects_gl_gl_outer_glow_effect_test;
#[path = "gl_outline_effect_test.rs"]
mod flight_effects_gl_gl_outline_effect_test;
#[path = "gl_pixelate_effect_test.rs"]
mod flight_effects_gl_gl_pixelate_effect_test;
#[path = "gl_posterize_effect_test.rs"]
mod flight_effects_gl_gl_posterize_effect_test;
#[path = "gl_radial_blur_effect_test.rs"]
mod flight_effects_gl_gl_radial_blur_effect_test;
#[path = "gl_render_texture_effect_test.rs"]
mod flight_effects_gl_gl_render_texture_effect_test;
#[path = "gl_scanlines_effect_test.rs"]
mod flight_effects_gl_gl_scanlines_effect_test;
#[path = "gl_screen_space_fog_effect_test.rs"]
mod flight_effects_gl_gl_screen_space_fog_effect_test;
#[path = "gl_shader_test_helper_test.rs"]
mod flight_effects_gl_gl_shader_test_helper_test;
#[path = "gl_sharpen_effect_test.rs"]
mod flight_effects_gl_gl_sharpen_effect_test;
#[path = "gl_sketch_effect_test.rs"]
mod flight_effects_gl_gl_sketch_effect_test;
#[path = "gl_smaa_effect_test.rs"]
mod flight_effects_gl_gl_smaa_effect_test;
#[path = "gl_spatial_effect_registration_test.rs"]
mod flight_effects_gl_gl_spatial_effect_registration_test;
#[path = "gl_ssao_effect_test.rs"]
mod flight_effects_gl_gl_ssao_effect_test;
#[path = "gl_tilt_shift_effect_test.rs"]
mod flight_effects_gl_gl_tilt_shift_effect_test;
#[path = "gl_tone_map_effect_test.rs"]
mod flight_effects_gl_gl_tone_map_effect_test;
#[path = "gl_vignette_effect_test.rs"]
mod flight_effects_gl_gl_vignette_effect_test;
#[path = "gl_white_balance_effect_test.rs"]
mod flight_effects_gl_gl_white_balance_effect_test;
