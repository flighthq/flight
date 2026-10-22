use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod get_wgpu_effect_logical_resolution {
    use super::*;

    // Logical pixels are the open pass's viewport: a scratch target twice that wide holds two
    // texels per logical pixel, whatever its own sample count says.
    #[test]
    fn preserves_native_target_dimensions() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_test_target(&state, 800, 600);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let resolution = get_wgpu_effect_logical_resolution(pass.state, &target.read().unwrap());

        assert_eq!(
            resolution,
            WgpuEffectLogicalResolution {
                height: 600.0,
                texels_per_logical_pixel: 1.0,
                width: 800.0,
            }
        );
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn normalizes_supersampled_scratch_targets_even_when_their_sample_count_is_one() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_test_target(&state, 1600, 1200);
        assert_eq!(target.read().unwrap().sample_count, 1);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        let resolution = get_wgpu_effect_logical_resolution(pass.state, &target.read().unwrap());

        assert_eq!(
            resolution,
            WgpuEffectLogicalResolution {
                height: 600.0,
                texels_per_logical_pixel: 2.0,
                width: 800.0,
            }
        );
        end_wgpu_render_pass(pass);
    }
}

mod get_wgpu_effect_logical_width {
    use super::*;

    #[test]
    fn measures_against_the_open_pass_viewport_while_a_chain_runs_inside_a_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_test_target(&state, 1600, 8);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);

        assert_eq!(
            get_wgpu_effect_logical_width(pass.state, &target.read().unwrap()),
            800.0
        );
        end_wgpu_render_pass(pass);
    }

    // The render-texture path applies effects with no enclosing pass: there the target IS the
    // logical space.
    #[test]
    fn falls_back_to_the_target_itself_when_no_pass_is_open() {
        let state = create_wgpu_render_state_for_test(None);
        let target = create_test_target(&state, 16, 8);

        assert_eq!(
            get_wgpu_effect_logical_width(&state, &target.read().unwrap()),
            16.0
        );
    }
}

mod get_wgpu_render_target_texel_scale {
    use super::*;

    #[test]
    fn derives_integer_texel_density_from_target_and_canvas_widths() {
        assert_eq!(get_wgpu_render_target_texel_scale(800.0, 800.0), 1.0);
        assert_eq!(get_wgpu_render_target_texel_scale(1600.0, 800.0), 2.0);
        assert_eq!(get_wgpu_render_target_texel_scale(2400.0, 800.0), 3.0);
    }

    #[test]
    fn falls_back_to_one_for_invalid_or_undersized_dimensions() {
        assert_eq!(get_wgpu_render_target_texel_scale(400.0, 800.0), 1.0);
        assert_eq!(get_wgpu_render_target_texel_scale(f32::NAN, 800.0), 1.0);
        assert_eq!(get_wgpu_render_target_texel_scale(800.0, 0.0), 1.0);
    }
}
