use flight_effects::{EffectRef, create_convolution_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

use std::panic::{AssertUnwindSafe, catch_unwind};

fn apply_convolution(
    configure: impl FnOnce(&mut flight_effects::ConvolutionEffect),
) -> (Vec<f32>, Vec<i32>) {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 32, 16);
    let dest = create_test_target(&state, 32, 16);
    let effect = create_convolution_effect();
    configure(&mut effect.write().unwrap());
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_convolution_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    return (
        recorded_effect_uniforms(&records)[0].clone(),
        recorded_effect_uniform_ints(&records)[0].clone(),
    );
}

mod apply_convolution_effect_to_wgpu {
    use super::*;

    #[test]
    fn packs_dimensions_as_ints_and_the_kernel_after_the_edge_color() {
        let (floats, ints) = apply_convolution(|effect| {
            effect.matrix = vec![0.0, 1.0, 0.0, 1.0, 4.0, 1.0, 0.0, 1.0, 0.0];
            effect.matrix_x = 3.0;
            effect.matrix_y = 3.0;
            effect.bias = Some(2.0);
            effect.color = Some(0xff000080);
            effect.preserve_alpha = Some(false);
        });

        assert_eq!(&floats[0..2], &[1.0 / 32.0, 1.0 / 16.0]);
        assert_eq!(&ints[2..4], &[3, 3]);
        // The divisor defaults to the kernel sum.
        assert_eq!(&floats[4..6], &[8.0, 2.0]);
        assert_eq!(&ints[6..8], &[1, 0]);
        assert_eq!(&floats[8..12], &[1.0, 0.0, 0.0, 0x80 as f32 / 255.0]);
        assert_eq!(
            &floats[12..21],
            &[0.0, 1.0, 0.0, 1.0, 4.0, 1.0, 0.0, 1.0, 0.0]
        );
    }

    #[test]
    fn uses_a_divisor_of_one_for_a_zero_sum_kernel() {
        let (floats, _) = apply_convolution(|effect| {
            effect.matrix = vec![-1.0, 0.0, 1.0];
            effect.matrix_x = 3.0;
            effect.matrix_y = 1.0;
        });

        assert_eq!(floats[4], 1.0);
    }

    #[test]
    fn panics_when_the_kernel_exceeds_seven_by_seven() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            apply_convolution(|effect| {
                effect.matrix = vec![1.0; 64];
                effect.matrix_x = 8.0;
                effect.matrix_y = 8.0;
            });
        }));

        assert!(result.is_err());
    }
}

mod register_wgpu_convolution_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_convolution_effect_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_convolution_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_convolution_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "ConvolutionEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "ConvolutionEffect").is_none());
    }
}

mod wgpu_convolution_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let concrete = create_convolution_effect();
        {
            let mut concrete = concrete.write().unwrap();
            concrete.matrix = vec![1.0];
            concrete.matrix_x = 1.0;
            concrete.matrix_y = 1.0;
        }
        let effect: EffectRef = concrete;
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
            wgpu_convolution_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records).last(),
            Some(&dest.read().unwrap().view)
        );
    }
}
