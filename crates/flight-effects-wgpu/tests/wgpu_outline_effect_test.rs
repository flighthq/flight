use flight_effects::{EffectRef, create_outline_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod apply_outline_effect_to_wgpu {
    use super::*;

    #[test]
    fn unpacks_the_packed_rgba_color_and_uploads_threshold_thickness_and_resolution() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_outline_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.color = Some(0x336699cc);
            effect.thickness = Some(2.0);
            effect.threshold = Some(0.5);
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_outline_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(&uniforms[0][0..4], &[0.5, 2.0, 32.0, 16.0]);
        assert_eq!(
            &uniforms[0][4..8],
            &[0x33 as f32 / 255.0, 0x66 as f32 / 255.0, 0x99 as f32 / 255.0, 0xcc as f32 / 255.0]
        );
        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
    }

    #[test]
    fn defaults_to_an_opaque_black_one_pixel_outline_at_threshold_0_2() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let effect = create_outline_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_outline_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(&uniforms[0][0..2], &[0.2, 1.0]);
        assert_eq!(&uniforms[0][4..8], &[0.0, 0.0, 0.0, 1.0]);
    }
}

mod register_wgpu_outline_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_outline_effect_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_outline_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_outline_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "OutlineEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "OutlineEffect").is_none());
    }
}

mod wgpu_outline_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_outline_effect();
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
            wgpu_outline_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records).last(),
            Some(&dest.read().unwrap().view)
        );
    }
}
