use flight_effects::{EffectRef, create_median_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

fn uploaded_radius(radius: Option<f32>) -> i32 {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 32, 16);
    let dest = create_test_target(&state, 32, 16);
    let effect = create_median_effect();
    effect.write().unwrap().radius = radius;
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_median_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    let uniforms = recorded_effect_uniforms(&records);
    assert_eq!(&uniforms[0][0..2], &[1.0 / 32.0, 1.0 / 16.0]);
    return recorded_effect_uniform_ints(&records)[0][2];
}

mod apply_median_effect_to_wgpu {
    use super::*;

    #[test]
    fn uploads_the_texel_size_and_an_integer_radius_defaulting_to_one() {
        assert_eq!(uploaded_radius(None), 1);
        assert_eq!(uploaded_radius(Some(1.6)), 2);
    }

    #[test]
    fn clamps_the_radius_to_the_supported_window() {
        assert_eq!(
            uploaded_radius(Some(9.0)),
            MAX_MEDIAN_EFFECT_WGPU_RADIUS as i32
        );
        assert_eq!(uploaded_radius(Some(-3.0)), 0);
    }
}

mod register_wgpu_median_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_median_effect_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_median_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_median_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "MedianEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "MedianEffect").is_none());
    }
}

mod wgpu_median_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_median_effect();
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
            wgpu_median_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records).last(),
            Some(&dest.read().unwrap().view)
        );
    }
}
