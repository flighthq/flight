use flight_effects_wgpu::contract::*;

use crate::support::*;

fn replace_blend_of_first_pipeline(
    records: &std::sync::Arc<std::sync::Mutex<Vec<flight_render_wgpu::WgpuCommandRecord>>>,
) -> wgpu::BlendState {
    return recorded_pipelines(records)[0].targets[0].as_ref().unwrap().blend.unwrap();
}

mod apply_wgpu_effect_inner_clip_pass {
    use super::*;

    #[test]
    fn uses_replacement_blending() {
        let mut state = create_wgpu_render_state_for_test(None);
        let glow = create_test_target(&state, 8, 8);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_inner_clip_pass(
                state,
                &glow.read().unwrap(),
                &source.read().unwrap(),
                &dest.read().unwrap(),
            );
        });

        assert_eq!(replace_blend_of_first_pipeline(&records).color.dst_factor, wgpu::BlendFactor::Zero);
        // The glow binds at group 1 and the clipping source at group 2.
        let sets = recorded_set_bind_groups(&records);
        assert_eq!(sets.iter().map(|set| set.index).collect::<Vec<u32>>(), vec![0, 1, 2]);
    }
}

mod apply_wgpu_effect_invert_tint_pass {
    use super::*;

    #[test]
    fn uses_replacement_blending() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_invert_tint_pass(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                0xff00ccff,
                0.5,
                2.0,
            );
        });

        assert_eq!(replace_blend_of_first_pipeline(&records).color.dst_factor, wgpu::BlendFactor::Zero);
        let uniforms = recorded_effect_uniforms(&records);
        assert_eq!(&uniforms[0][0..5], &[1.0, 0.0, 0.8, 0.5, 2.0]);
    }
}

mod apply_wgpu_effect_tint_pass {
    use super::*;

    #[test]
    fn uses_replacement_blending() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_wgpu_effect_tint_pass(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                0xff00cc80,
                0.5,
                2.0,
            );
        });

        assert_eq!(replace_blend_of_first_pipeline(&records).color.dst_factor, wgpu::BlendFactor::Zero);
        let uniforms = recorded_effect_uniforms(&records);
        // The packed color's own alpha multiplies the separate alpha.
        assert!(is_close(uniforms[0][3], 0.5 * (128.0 / 255.0), 6));
        assert_eq!(uniforms[0][4], 2.0);
    }
}
