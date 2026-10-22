use flight_effects::{EffectRef, create_bloom_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod apply_bloom_effect_to_wgpu {
    use super::*;

    // Bright pass into a scratch, the two-pass Gaussian through a second scratch, then the
    // dual-source composite of source and blur into dest; all three scratches go back to the pool.
    #[test]
    fn bright_passes_blurs_and_composites_through_three_released_scratch_targets() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let mut pool = create_wgpu_render_target_pool();
        let effect = create_bloom_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.threshold = Some(0.7);
            effect.intensity = Some(1.5);
            effect.radius = Some(2.0);
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_bloom_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &mut pool,
                &effect.read().unwrap(),
            );
        });

        assert_eq!(pool.free.len(), 3);
        let bright = pool.free[0].read().unwrap().view.clone();
        let blurred = pool.free[1].read().unwrap().view.clone();
        let temp = pool.free[2].read().unwrap().view.clone();
        let source_view = source.read().unwrap().view.clone();
        assert_eq!(
            recorded_pass_views(&records),
            vec![
                bright.clone(),
                temp.clone(),
                blurred,
                dest.read().unwrap().view.clone()
            ]
        );
        assert_eq!(
            recorded_draw_sources(&records),
            vec![source_view.clone(), bright, temp, source_view]
        );
        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][0], 0.7);
        assert_eq!(uniforms[1][5], 2.0);
        assert_eq!(uniforms[3][0], 1.5);
    }
}

mod register_wgpu_bloom_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_its_kind_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_bloom_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_bloom_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "BloomEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "BloomEffect").is_none());
    }
}

mod wgpu_bloom_effect_runner {
    use super::*;

    #[test]
    fn draws_the_context_source_into_the_context_dest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_bloom_effect();
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
            wgpu_bloom_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records).last(),
            Some(&dest.read().unwrap().view.clone())
        );
        assert_eq!(
            recorded_draw_sources(&records)[0],
            source.read().unwrap().view.clone()
        );
        assert_eq!(pool.free.len(), 3);
    }
}
