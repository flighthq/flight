use flight_effects::{EffectRef, GodRaysEffect, create_god_rays_effect};
use flight_effects_wgpu::contract::*;
use flight_entity::Ref;
use flight_render_wgpu::*;

use crate::support::*;

fn create(configure: impl FnOnce(&mut GodRaysEffect)) -> Ref<GodRaysEffect> {
    let effect = create_god_rays_effect();
    configure(&mut effect.write().unwrap());
    return effect;
}

fn apply(state: &mut WgpuRenderState, effect: &Ref<GodRaysEffect>) -> Vec<f32> {
    let source = create_test_target(state, 64, 64);
    let dest = create_test_target(state, 64, 64);
    let records = record_test_commands(state);
    with_test_frame(state, |state| {
        apply_god_rays_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    return recorded_effect_uniforms(&records)[0].clone();
}

fn apply_fresh(effect: &Ref<GodRaysEffect>) -> Vec<f32> {
    let mut state = create_wgpu_render_state_for_test(None);
    return apply(&mut state, effect);
}

// Whether a pipeline is already cached under `key`: asking again with WGSL that would not compile
// returns the cached one without compiling anything.
fn is_cached(state: &mut WgpuRenderState, key: &str) -> bool {
    let records = record_test_commands(state);
    let _ = get_wgpu_effect_pipeline(state, key, "not wgsl", None);
    return recorded_pipelines(&records).is_empty();
}

mod apply_god_rays_effect_to_wgpu {
    use super::*;

    // centerY is declared top-left-origin and the fullscreen uv is already top-left, so this
    // backend must NOT convert while its GL sibling must.
    #[test]
    fn passes_a_top_left_center_y_through_unconverted() {
        let uniforms = apply_fresh(&create(|effect| {
            effect.center_x = Some(0.25);
            effect.center_y = Some(0.2);
        }));
        assert_eq!(&uniforms[0..2], &[0.25, 0.2]);
    }

    #[test]
    fn keeps_a_light_near_the_bottom_of_the_frame_near_the_bottom() {
        let uniforms = apply_fresh(&create(|effect| effect.center_y = Some(0.9)));
        assert!(is_close(uniforms[1], 0.9, 6));
    }

    #[test]
    fn maps_a_lower_light_to_a_larger_value_than_a_higher_one_since_uv_counts_down() {
        let high = apply_fresh(&create(|effect| effect.center_y = Some(0.1)))[1];
        let low = apply_fresh(&create(|effect| effect.center_y = Some(0.9)))[1];
        assert!(low > high);
    }

    #[test]
    fn defaults_the_light_to_the_frame_centre_the_one_value_a_flip_cannot_be_seen_at() {
        assert_eq!(&apply_fresh(&create_god_rays_effect())[0..2], &[0.5, 0.5]);
    }

    #[test]
    fn passes_the_marching_parameters_through_as_descriptor_defaults() {
        let uniforms = apply_fresh(&create_god_rays_effect());
        assert!(is_close(uniforms[2], 0.96, 6));
        assert!(is_close(uniforms[3], 0.93, 6));
        assert!(is_close(uniforms[4], 0.4, 6));
        assert!(is_close(uniforms[5], 0.6, 6));
    }

    // The sample count is baked into the WGSL, so it belongs to the pipeline KEY, not a uniform.
    #[test]
    fn rounds_the_sample_count_into_the_pipeline_key_and_floors_it_at_one() {
        let mut state = create_wgpu_render_state_for_test(None);
        apply(&mut state, &create(|effect| effect.samples = Some(12.4)));
        assert!(is_cached(&mut state, "atmospheric.godRays.12"));

        apply(&mut state, &create(|effect| effect.samples = Some(0.0)));
        assert!(is_cached(&mut state, "atmospheric.godRays.1"));
    }

    // The baked count compiles as a WGSL constant (a real pipeline build), in replace blend.
    #[test]
    fn bakes_the_same_count_into_the_shader_it_keys_under() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let effect = create(|effect| effect.samples = Some(12.0));
        let records = record_test_commands(&state);
        let error = capture_test_validation_error(&state, || {});
        assert!(error.is_none());
        with_test_frame(&mut state, |state| {
            apply_god_rays_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });
        let pipelines = recorded_pipelines(&records);
        assert_eq!(pipelines.len(), 1);
        let blend = pipelines[0].targets[0].as_ref().unwrap().blend.unwrap();
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::Zero);
        assert!(is_cached(&mut state, "atmospheric.godRays.12"));
    }
}

mod register_wgpu_god_rays_effect {
    use super::*;

    #[test]
    fn makes_the_runner_resolvable_for_the_god_rays_effect_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "GodRaysEffect").is_none());
        register_wgpu_god_rays_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_god_rays_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "GodRaysEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_god_rays_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create(|effect| effect.center_y = Some(0.25));
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            let mut context = WgpuEffectContext {
                state,
                source: source.clone(),
                dest: dest.clone(),
                pool: &mut pool,
                scene_depth_texture: None,
                scene_velocity_texture: None,
            };
            wgpu_god_rays_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert!(is_close(recorded_effect_uniforms(&records)[0][1], 0.25, 6));
        assert_eq!(
            recorded_pass_views(&records),
            vec![dest.read().unwrap().view.clone()]
        );
    }
}
