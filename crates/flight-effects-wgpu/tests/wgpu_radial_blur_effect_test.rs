use flight_effects::{EffectRef, create_radial_blur_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

// Runs the recipe with the given descriptor fields and returns its uploaded uniforms and the
// pipelines it created.
fn apply(
    center_x: Option<f32>,
    center_y: Option<f32>,
    samples: Option<f32>,
) -> (Vec<f32>, Vec<WgpuRenderPipelineRecord>) {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 64, 64);
    let dest = create_test_target(&state, 64, 64);
    let effect = create_radial_blur_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.center_x = center_x;
        effect.center_y = center_y;
        effect.samples = samples;
    }
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_radial_blur_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    return (
        recorded_effect_uniforms(&records)[0].clone(),
        recorded_pipelines(&records),
    );
}

mod apply_radial_blur_effect_to_wgpu {
    use super::*;

    // The pass-through IS the convention: centerY is screen space, top-left origin, and the effect
    // pass's uv is already top-left, so this backend must NOT convert while its GL sibling must.
    #[test]
    fn passes_a_top_left_center_y_through_unconverted() {
        let (uniforms, _) = apply(Some(0.3), Some(0.4), None);
        assert_eq!(&uniforms[0..2], &[0.3, 0.4]);
    }

    #[test]
    fn keeps_a_centre_near_the_top_of_the_frame_near_the_top() {
        let (uniforms, _) = apply(None, Some(0.9), None);
        assert!(is_close(uniforms[1], 0.9, 6));
    }

    #[test]
    fn maps_a_lower_centre_to_a_larger_value_than_a_higher_one_since_uv_counts_down() {
        let (high, _) = apply(None, Some(0.1), None);
        let (low, _) = apply(None, Some(0.9), None);
        assert!(low[1] > high[1]);
    }

    #[test]
    fn defaults_to_the_frame_centre_the_one_value_a_flip_cannot_be_seen_at() {
        let (uniforms, _) = apply(None, None, None);
        assert_eq!(&uniforms[0..2], &[0.5, 0.5]);
    }

    #[test]
    fn passes_strength_and_sample_count_through_as_descriptor_defaults() {
        let (uniforms, _) = apply(None, None, None);
        assert!(is_close(uniforms[2], 0.2, 6));
        assert_eq!(uniforms[3], 16.0);
    }

    // One pipeline for every parameterisation: the sample count is a uniform here.
    #[test]
    fn compiles_one_replace_blend_pipeline_regardless_of_the_descriptor() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let records = record_test_commands(&state);
        with_test_frame(&mut state, |state| {
            for samples in [8.0, 32.0] {
                let effect = create_radial_blur_effect();
                effect.write().unwrap().samples = Some(samples);
                apply_radial_blur_effect_to_wgpu(
                    state,
                    &source.read().unwrap(),
                    &dest.read().unwrap(),
                    &effect.read().unwrap(),
                );
            }
        });
        let pipelines = recorded_pipelines(&records);
        assert_eq!(pipelines.len(), 1);
        assert_eq!(
            pipelines[0].targets[0].as_ref().and_then(|target| target.blend),
            Some(wgpu::BlendState::REPLACE)
        );
        let (_, single) = apply(None, None, Some(8.0));
        assert_eq!(single.len(), 1);
    }
}

mod register_wgpu_radial_blur_effect {
    use super::*;

    #[test]
    fn makes_the_runner_resolvable_for_the_radial_blur_effect_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "RadialBlurEffect").is_none());
        register_wgpu_radial_blur_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_radial_blur_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "RadialBlurEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_radial_blur_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect = create_radial_blur_effect();
        effect.write().unwrap().center_y = Some(0.25);
        let effect: EffectRef = effect;
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
            wgpu_radial_blur_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert!(is_close(recorded_effect_uniforms(&records)[0][1], 0.25, 6));
    }
}
