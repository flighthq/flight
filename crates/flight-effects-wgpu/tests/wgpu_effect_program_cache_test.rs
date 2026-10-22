use std::sync::Arc;

use flight_effects_wgpu::contract::*;

use crate::support::*;

const WGSL_A: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

const WGSL_B: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return vec4f(1.0) - textureSampleLevel(tex, smp, uv, 0.0);
}"#;

mod get_wgpu_effect_pipeline {
    use super::*;

    // Every WebGPU effect recipe reaches its pipeline through this cache, so a mistake here is a
    // mistake in all of them at once, surfacing as the wrong pipeline rather than as an error.
    #[test]
    fn compiles_a_key_once_per_state_and_hands_back_the_same_pipeline() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        let first = get_wgpu_effect_pipeline(&mut state, "blur.gaussian", WGSL_A, None);
        let second = get_wgpu_effect_pipeline(&mut state, "blur.gaussian", WGSL_A, None);

        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(recorded_pipelines(&records).len(), 1);
    }

    #[test]
    fn compiles_each_key_separately_so_two_recipes_never_share_one_pipeline() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        let blur = get_wgpu_effect_pipeline(&mut state, "blur.gaussian", WGSL_A, None);
        let crt = get_wgpu_effect_pipeline(&mut state, "stylization.crt", WGSL_B, None);

        assert!(!Arc::ptr_eq(&blur, &crt));
        assert_eq!(recorded_pipelines(&records).len(), 2);
    }

    // Keyed by STATE: a pipeline belongs to the device that created it.
    #[test]
    fn gives_each_state_its_own_pipeline() {
        let mut first_state = create_wgpu_render_state_for_test(None);
        let mut second_state = create_wgpu_render_state_for_test(None);

        let first = get_wgpu_effect_pipeline(&mut first_state, "blur.gaussian", WGSL_A, None);
        let second = get_wgpu_effect_pipeline(&mut second_state, "blur.gaussian", WGSL_A, None);

        assert!(!Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn defaults_the_blend_mode_to_replace_the_mode_every_built_in_recipe_asks_for_explicitly() {
        let mut state = create_wgpu_render_state_for_test(None);

        let pipeline = get_wgpu_effect_pipeline(&mut state, "defaulted", WGSL_A, None);

        assert_eq!(
            pipeline.read().unwrap().blend_mode,
            WgpuEffectBlendMode::Replace
        );
    }

    #[test]
    fn passes_a_requested_blend_mode_through_to_the_pipeline_it_builds() {
        let mut state = create_wgpu_render_state_for_test(None);

        let pipeline = get_wgpu_effect_pipeline(
            &mut state,
            "premultiplied",
            WGSL_A,
            Some(WgpuEffectBlendMode::Premul),
        );

        assert_eq!(
            pipeline.read().unwrap().blend_mode,
            WgpuEffectBlendMode::Premul
        );
    }

    // `blend` is NOT part of the cache key, so the first request under a key fixes the blend mode
    // for every later one. Locked so a change to that behavior has to be deliberate.
    #[test]
    fn keeps_the_blend_mode_of_the_first_request_under_a_key_not_the_latest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        get_wgpu_effect_pipeline(
            &mut state,
            "sharedKey",
            WGSL_A,
            Some(WgpuEffectBlendMode::Replace),
        );
        let later = get_wgpu_effect_pipeline(
            &mut state,
            "sharedKey",
            WGSL_A,
            Some(WgpuEffectBlendMode::Premul),
        );

        assert_eq!(
            later.read().unwrap().blend_mode,
            WgpuEffectBlendMode::Replace
        );
        assert_eq!(recorded_pipelines(&records).len(), 1);
    }

    // The KEY identifies the pipeline, not the WGSL: a recipe that varies its shader must vary its
    // key too.
    #[test]
    fn ignores_changed_wgsl_under_a_key_it_has_already_compiled() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        let first = get_wgpu_effect_pipeline(&mut state, "sameKey", WGSL_A, None);
        let again = get_wgpu_effect_pipeline(&mut state, "sameKey", "WGSL_B_DIFFERENT", None);

        assert!(Arc::ptr_eq(&first, &again));
        assert_eq!(recorded_pipelines(&records).len(), 1);
    }
}
