use flight_effects::{EffectRef, create_chromatic_aberration_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod apply_chromatic_aberration_effect_to_wgpu {
    use super::*;

    #[test]
    fn draws_the_source_into_dest_with_the_descriptor_defaults() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_chromatic_aberration_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_chromatic_aberration_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        assert_eq!(recorded_draw_sources(&records), vec![source.read().unwrap().view.clone()]);
        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][0], 0.005);
        assert_eq!(uniforms[0][1], 1.0);
    }
}

mod register_wgpu_chromatic_aberration_effect {
    use super::*;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "ChromaticAberrationEffect").is_none());

        register_wgpu_chromatic_aberration_effect(&mut state);

        let expected: WgpuEffectRunner = wgpu_chromatic_aberration_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "ChromaticAberrationEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "ChromaticAberrationEffect").is_none());
    }
}

mod wgpu_chromatic_aberration_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_chromatic_aberration_effect();
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
            wgpu_chromatic_aberration_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][0], 0.005);
        assert_eq!(uniforms[0][1], 1.0);
    }
}
