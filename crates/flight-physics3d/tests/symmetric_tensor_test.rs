use super::*;

fn assert_close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 1.0e-5,
        "expected {actual} to be close to {expected}"
    );
}

mod apply_symmetric_tensor {
    use super::*;

    #[test]
    fn is_symmetric_across_the_xy_term() {
        let tensor = [1.0, 1.0, 1.0, 2.0, 0.0, 0.0];
        let mut from_x = [0.0; 3];
        let mut from_y = [0.0; 3];
        apply_symmetric_tensor(&mut from_x, &tensor, 1.0, 0.0, 0.0);
        apply_symmetric_tensor(&mut from_y, &tensor, 0.0, 1.0, 0.0);
        assert_eq!(from_x[1], from_y[0]);
    }

    #[test]
    fn mixes_components_through_off_diagonal_terms() {
        let mut out = [0.0; 3];
        apply_symmetric_tensor(&mut out, &[1.0, 1.0, 1.0, 2.0, 0.0, 0.0], 1.0, 0.0, 0.0);
        assert_eq!(out, [1.0, 2.0, 0.0]);
    }

    #[test]
    fn multiplies_a_diagonal_tensor_componentwise() {
        let mut out = [0.0; 3];
        apply_symmetric_tensor(&mut out, &[2.0, 3.0, 4.0, 0.0, 0.0, 0.0], 1.0, 1.0, 1.0);
        assert_eq!(out, [2.0, 3.0, 4.0]);
    }
}

mod inverse_symmetric_tensor {
    use super::*;

    #[test]
    fn inverts_a_diagonal_tensor_by_reciprocal() {
        let mut out = [0.0; 6];
        assert!(inverse_symmetric_tensor(
            &mut out,
            &[2.0, 4.0, 8.0, 0.0, 0.0, 0.0]
        ));
        assert_close(out[TENSOR_XX], 0.5);
        assert_close(out[TENSOR_YY], 0.25);
        assert_close(out[TENSOR_ZZ], 0.125);
    }

    #[test]
    fn preserves_input_components_while_writing_the_output() {
        let mut tensor = [2.0, 4.0, 8.0, 0.0, 0.0, 0.0];
        let input = tensor;
        assert!(inverse_symmetric_tensor(&mut tensor, &input));
        assert_close(tensor[TENSOR_XX], 0.5);
        assert_close(tensor[TENSOR_ZZ], 0.125);
    }

    #[test]
    fn reports_a_rank_deficient_tensor_as_singular() {
        let mut out = [0.0; 6];
        assert!(!inverse_symmetric_tensor(
            &mut out,
            &[1.0, 1.0, 0.0, 1.0, 0.0, 0.0]
        ));
    }

    #[test]
    fn reports_a_singular_tensor_and_writes_zeroes() {
        let mut out = [9.0; 6];
        assert!(!inverse_symmetric_tensor(&mut out, &[0.0; 6]));
        assert_eq!(out, [0.0; 6]);
    }

    #[test]
    fn round_trips_a_general_tensor_back_to_identity() {
        let tensor = [4.0, 5.0, 6.0, 1.0, 2.0, 3.0];
        let mut inverse = [0.0; 6];
        assert!(inverse_symmetric_tensor(&mut inverse, &tensor));
        let mut out = [0.0; 3];
        apply_symmetric_tensor(
            &mut out,
            &inverse,
            tensor[TENSOR_XX],
            tensor[TENSOR_XY],
            tensor[TENSOR_XZ],
        );
        assert_close(out[0], 1.0);
        assert_close(out[1], 0.0);
        assert_close(out[2], 0.0);
    }
}

mod rotate_symmetric_tensor {
    use super::*;

    #[test]
    fn leaves_an_isotropic_tensor_unchanged_under_any_rotation() {
        let mut out = [0.0; 6];
        let axis = 1.0 / 3.0_f32.sqrt();
        let angle = 0.7_f32;
        let sine = (angle / 2.0).sin();
        rotate_symmetric_tensor(
            &mut out,
            &[4.0, 4.0, 4.0, 0.0, 0.0, 0.0],
            axis * sine,
            axis * sine,
            axis * sine,
            (angle / 2.0).cos(),
        );
        assert_close(out[TENSOR_XX], 4.0);
        assert_close(out[TENSOR_YY], 4.0);
        assert_close(out[TENSOR_ZZ], 4.0);
        assert_close(out[TENSOR_XY], 0.0);
    }

    #[test]
    fn leaves_a_tensor_unchanged_under_identity_rotation() {
        let tensor = [1.0, 2.0, 3.0, 0.5, 0.25, 0.125];
        let mut out = [0.0; 6];
        rotate_symmetric_tensor(&mut out, &tensor, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(out, tensor);
    }

    #[test]
    fn preserves_input_components_while_writing_the_output() {
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let mut tensor = [1.0, 5.0, 9.0, 0.0, 0.0, 0.0];
        let input = tensor;
        rotate_symmetric_tensor(&mut tensor, &input, 0.0, 0.0, half, half);
        assert_close(tensor[TENSOR_XX], 5.0);
        assert_close(tensor[TENSOR_YY], 1.0);
    }

    #[test]
    fn preserves_the_trace() {
        let mut out = [0.0; 6];
        let angle = 1.1_f32;
        rotate_symmetric_tensor(
            &mut out,
            &[2.0, 5.0, 11.0, 0.3, -0.4, 0.6],
            (angle / 2.0).sin(),
            0.0,
            0.0,
            (angle / 2.0).cos(),
        );
        assert_close(out[TENSOR_XX] + out[TENSOR_YY] + out[TENSOR_ZZ], 18.0);
    }

    #[test]
    fn swaps_x_and_y_moments_under_a_quarter_turn_about_z() {
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let mut out = [0.0; 6];
        rotate_symmetric_tensor(
            &mut out,
            &[1.0, 5.0, 9.0, 0.0, 0.0, 0.0],
            0.0,
            0.0,
            half,
            half,
        );
        assert_close(out[TENSOR_XX], 5.0);
        assert_close(out[TENSOR_YY], 1.0);
        assert_close(out[TENSOR_ZZ], 9.0);
    }
}

mod translate_symmetric_tensor {
    use super::*;

    #[test]
    fn adds_the_point_mass_term_along_offset_axes() {
        let mut out = [0.0; 6];
        translate_symmetric_tensor(&mut out, &[0.0; 6], 2.0, 0.0, 3.0, 0.0);
        assert_close(out[TENSOR_XX], 18.0);
        assert_close(out[TENSOR_YY], 0.0);
        assert_close(out[TENSOR_ZZ], 18.0);
    }

    #[test]
    fn is_even_in_the_offset() {
        let mut positive = [0.0; 6];
        let mut negative = [0.0; 6];
        let tensor = [1.0, 1.0, 1.0, 0.0, 0.0, 0.0];
        translate_symmetric_tensor(&mut positive, &tensor, 3.0, 1.0, 2.0, 3.0);
        translate_symmetric_tensor(&mut negative, &tensor, 3.0, -1.0, -2.0, -3.0);
        assert_close(negative[TENSOR_XX], positive[TENSOR_XX]);
        assert_close(negative[TENSOR_XY], positive[TENSOR_XY]);
    }

    #[test]
    fn is_a_no_op_at_zero_offset() {
        let tensor = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let mut out = [0.0; 6];
        translate_symmetric_tensor(&mut out, &tensor, 7.0, 0.0, 0.0, 0.0);
        assert_eq!(out, tensor);
    }

    #[test]
    fn preserves_input_components_while_writing_the_output() {
        let mut tensor = [1.0, 1.0, 1.0, 0.0, 0.0, 0.0];
        let input = tensor;
        translate_symmetric_tensor(&mut tensor, &input, 2.0, 0.0, 3.0, 0.0);
        assert_close(tensor[TENSOR_XX], 19.0);
        assert_close(tensor[TENSOR_YY], 1.0);
    }

    #[test]
    fn produces_negative_off_diagonal_terms_for_a_diagonal_offset() {
        let mut out = [0.0; 6];
        translate_symmetric_tensor(&mut out, &[0.0; 6], 1.0, 2.0, 3.0, 0.0);
        assert_close(out[TENSOR_XY], -6.0);
    }
}
