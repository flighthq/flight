use flight_effects_wgpu::contract::*;

use crate::support::*;

const IDENTITY: [f32; 20] = [
    1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    0.0,
];

fn packed(matrix: &[f32]) -> Vec<f32> {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 8, 8);
    let dest = create_test_target(&state, 8, 8);
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_color_matrix_pass_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &matrix.to_vec(),
        );
    });
    return recorded_effect_uniforms(&records)[0][0..20].to_vec();
}

mod apply_color_matrix_pass_to_wgpu {
    use super::*;

    // WGSL wants four vec4f coefficient ROWS with the bias column moved to a fifth vec4f, so the
    // runner permutes 20 indices by hand: the shape where one transposed pair survives review.
    #[test]
    fn packs_the_four_coefficient_rows_first_and_the_bias_column_last() {
        let distinct: Vec<f32> = (1..=20).map(|value| value as f32).collect();

        assert_eq!(
            packed(&distinct),
            vec![
                1.0, 2.0, 3.0, 4.0, 6.0, 7.0, 8.0, 9.0, 11.0, 12.0, 13.0, 14.0, 16.0, 17.0, 18.0,
                19.0, 5.0, 10.0, 15.0, 20.0,
            ]
        );
    }

    #[test]
    fn keeps_each_row_bias_with_its_own_row_not_with_the_row_after_it() {
        let distinct: Vec<f32> = (1..=20).map(|value| value as f32).collect();
        let uploaded = packed(&distinct);

        assert_eq!(uploaded[3], distinct[3]);
        assert_eq!(uploaded[16], distinct[4]);
        assert_eq!(uploaded[19], distinct[19]);
    }

    #[test]
    fn leaves_an_identity_matrix_as_an_identity_packing() {
        assert_eq!(
            packed(&IDENTITY),
            vec![
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
                0.0, 0.0, 0.0, 0.0,
            ]
        );
    }

    // A caller handing over a 4x4 (sixteen entries) is the realistic mistake: every missing slot
    // must read as zero rather than NaN, which would be a transparent black frame.
    #[test]
    fn zero_fills_a_matrix_shorter_than_twenty() {
        let uploaded = packed(&[1.0, 0.0, 0.0, 0.0]);

        assert!(uploaded.iter().all(|value| value.is_finite()));
        assert_eq!(&uploaded[4..], &[0.0; 16]);
    }

    #[test]
    fn ignores_coefficients_past_the_twentieth() {
        let mut longer = IDENTITY.to_vec();
        longer.push(99.0);
        longer.push(98.0);
        assert_eq!(packed(&longer), packed(&IDENTITY));
    }

    #[test]
    fn compiles_one_pipeline_for_every_matrix_in_replace_blend() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_color_matrix_pass_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &IDENTITY.to_vec(),
            );
            apply_color_matrix_pass_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &vec![0.5; 20],
            );
        });

        let pipelines = recorded_pipelines(&records);
        assert_eq!(pipelines.len(), 1);
        let blend = pipelines[0].targets[0].as_ref().unwrap().blend.unwrap();
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::Zero);
        // The pipeline is the program cache's "adjustment.colorMatrix" entry.
        let cached = get_wgpu_effect_pipeline(&mut state, "adjustment.colorMatrix", "", None);
        assert_eq!(cached.read().unwrap().pipeline, pipelines[0].pipeline);
    }
}
