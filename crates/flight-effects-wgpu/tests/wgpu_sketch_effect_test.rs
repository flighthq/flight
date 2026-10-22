use flight_effects::{EffectRef, create_sketch_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod apply_sketch_effect_to_wgpu {
    use super::*;

    #[test]
    fn uploads_the_strength_and_the_source_resolution() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_sketch_effect();
        effect.write().unwrap().strength = Some(3.0);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_sketch_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][0], 3.0);
        assert_eq!(&uniforms[0][2..4], &[32.0, 16.0]);
        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
    }

    #[test]
    fn defaults_the_strength_to_one() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let effect = create_sketch_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_sketch_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(recorded_effect_uniforms(&records)[0][0], 1.0);
    }
}

mod register_wgpu_sketch_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_sketch_effect_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_sketch_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_sketch_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "SketchEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "SketchEffect").is_none());
    }
}

mod wgpu_sketch_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_sketch_effect();
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
            wgpu_sketch_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records).last(),
            Some(&dest.read().unwrap().view)
        );
    }
}
