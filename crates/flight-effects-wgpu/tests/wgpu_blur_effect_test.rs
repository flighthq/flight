use flight_effects::{EffectRef, create_blur_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod apply_blur_effect_to_wgpu {
    use super::*;

    #[test]
    fn blurs_horizontally_into_temp_then_vertically_into_dest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let temp = create_test_target(&state, 32, 16);
        let effect = create_blur_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.blur_x = Some(2.0);
            effect.blur_y = Some(3.0);
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_blur_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &temp.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(
            recorded_pass_views(&records),
            vec![temp.read().unwrap().view.clone(), dest.read().unwrap().view.clone()]
        );
        let uniforms = recorded_effect_uniforms(&records);
        // [texelSize.x, texelSize.y, dir.x, dir.y, radius, sigma]; no open pass, so sigma is the
        // authored value at native density.
        assert_eq!(&uniforms[0][2..6], &[1.0, 0.0, 6.0, 2.0]);
        assert_eq!(&uniforms[1][2..6], &[0.0, 1.0, 9.0, 3.0]);
    }
}

mod apply_gaussian_blur_to_wgpu {
    use super::*;

    #[test]
    fn defaults_both_sigmas_to_four() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let temp = create_test_target(&state, 32, 16);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_gaussian_blur_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &temp.read().unwrap(),
                &WgpuGaussianBlurOptions {
                    blur_x: None,
                    blur_y: None,
                },
            );
        });

        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(&uniforms[0][4..6], &[12.0, 4.0]);
        assert_eq!(&uniforms[1][4..6], &[12.0, 4.0]);
        assert_eq!(uniforms[0][0], 1.0 / 32.0);
        assert_eq!(uniforms[0][1], 1.0 / 16.0);
    }
}

mod get_wgpu_render_target_texel_scale {
    use super::*;

    // Sigma is in logical pixels and the pass steps in texels; a supersampled effect target holds
    // two texels per logical pixel.
    #[test]
    fn reports_2_for_a_supersampled_target_and_1_at_native_density() {
        assert_eq!(get_wgpu_render_target_texel_scale(1600.0, 800.0), 2.0);
        assert_eq!(get_wgpu_render_target_texel_scale(800.0, 800.0), 1.0);
    }

    // A target SMALLER than the canvas is a downsampled chain, not a negative supersample.
    #[test]
    fn never_scales_below_1() {
        assert_eq!(get_wgpu_render_target_texel_scale(400.0, 800.0), 1.0);
        assert_eq!(get_wgpu_render_target_texel_scale(1.0, 800.0), 1.0);
    }

    #[test]
    fn returns_1_for_a_zero_or_non_finite_width_instead_of_propagating_it() {
        assert_eq!(get_wgpu_render_target_texel_scale(800.0, 0.0), 1.0);
        assert_eq!(get_wgpu_render_target_texel_scale(f32::NAN, 800.0), 1.0);
        assert_eq!(get_wgpu_render_target_texel_scale(800.0, f32::INFINITY), 1.0);
    }
}

mod register_wgpu_blur_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_blur_effect() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_blur_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_blur_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "BlurEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_blur_effect_runner {
    use super::*;

    #[test]
    fn borrows_one_scratch_target_and_returns_it_to_the_pool() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_blur_effect();

        with_test_frame(&mut state, |state| {
            let mut context = WgpuEffectContext {
                state,
                source: source.clone(),
                dest: dest.clone(),
                pool: &mut pool,
                scene_depth_texture: None,
                scene_velocity_texture: None,
            };
            wgpu_blur_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(pool.free.len(), 1);
    }
}
