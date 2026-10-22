use flight_effects::{EffectRef, create_pixelate_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod apply_pixelate_effect_to_wgpu {
    use super::*;

    #[test]
    fn draws_the_descriptor_into_dest_with_its_size_logical_resolution() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_pixelate_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.size = Some(4.0);
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_pixelate_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][0], 4.0);
        assert_eq!(uniforms[0][2], 32.0);
        assert_eq!(uniforms[0][3], 16.0);
    }

    #[test]
    fn uploads_the_descriptor_defaults_and_compiles_one_replace_pipeline() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_pixelate_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            for _ in 0..2 {
                apply_pixelate_effect_to_wgpu(
                    state,
                    &source.read().unwrap(),
                    &dest.read().unwrap(),
                    &effect.read().unwrap(),
                );
            }
        });

        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][0], 8.0);
        let pipelines = recorded_pipelines(&records);
        assert_eq!(pipelines.len(), 1);
        assert_eq!(
            pipelines[0].targets[0].as_ref().and_then(|target| target.blend),
            Some(wgpu::BlendState::REPLACE)
        );
    }
}

mod register_wgpu_pixelate_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_pixelate_effect() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "PixelateEffect").is_none());
        register_wgpu_pixelate_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_pixelate_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "PixelateEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_pixelate_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_pixelate_effect();
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
            wgpu_pixelate_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        assert_eq!(recorded_effect_uniforms(&records).len(), 1);
    }
}
