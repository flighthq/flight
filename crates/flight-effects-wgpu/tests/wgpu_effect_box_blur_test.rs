use flight_effects_wgpu::contract::*;

use crate::support::*;

mod apply_wgpu_effect_box_blur {
    use super::*;

    #[test]
    fn blurs_each_axis_through_temp_and_lands_in_dest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let temp = create_test_target(&state, 32, 16);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_box_blur(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &temp.read().unwrap(),
                &WgpuEffectBoxBlurOptions {
                    blur_x: Some(4.0),
                    blur_y: Some(4.0),
                    passes: Some(1.0),
                    edge_color: None,
                },
            );
        });

        assert_eq!(
            recorded_pass_views(&records),
            vec![temp.read().unwrap().view.clone(), dest.read().unwrap().view.clone()]
        );
    }

    #[test]
    fn binds_the_exterior_edge_color_when_one_is_provided() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let temp = create_test_target(&state, 32, 16);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_box_blur(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &temp.read().unwrap(),
                &WgpuEffectBoxBlurOptions {
                    blur_x: Some(4.0),
                    blur_y: Some(0.0),
                    passes: Some(1.0),
                    edge_color: Some([0.1, 0.2, 0.3, 0.4]),
                },
            );
        });

        let blend = recorded_pipelines(&records)[0].targets[0].as_ref().unwrap().blend.unwrap();
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::Zero);
        let uniforms = recorded_effect_uniforms(&records);
        assert!(is_close(uniforms[0][4], 0.1, 2));
        assert!(is_close(uniforms[0][5], 0.2, 2));
        assert!(is_close(uniforms[0][6], 0.3, 2));
        assert!(is_close(uniforms[0][7], 0.4, 2));
        assert_eq!(uniforms[0][9], 1.0);
    }

    #[test]
    fn uses_the_replacement_blur_pipeline_for_zero_radius_copies() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let temp = create_test_target(&state, 32, 16);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_box_blur(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &temp.read().unwrap(),
                &WgpuEffectBoxBlurOptions {
                    blur_x: Some(0.0),
                    blur_y: Some(0.0),
                    passes: Some(1.0),
                    edge_color: None,
                },
            );
        });

        assert_eq!(recorded_draws(&records).len(), 1);
        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(uniforms[0][8], 0.0);
        assert_eq!(uniforms[0][9], 0.0);
    }
}
