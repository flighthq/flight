use super::*;

mod compute_depth_of_field_coc {
    use super::*;

    #[test]
    fn behind_focus_depth_returns_positive_coc() {
        assert!(compute_depth_of_field_coc(10.0, 5.0, 1.8, 50.0) > 0.0);
    }

    #[test]
    fn in_front_of_focus_depth_returns_negative_coc() {
        assert!(compute_depth_of_field_coc(2.0, 5.0, 1.8, 50.0) < 0.0);
    }

    #[test]
    fn larger_aperture_increases_coc_magnitude() {
        let coc_14 = compute_depth_of_field_coc(10.0, 5.0, 1.4, 50.0).abs();
        let coc_8 = compute_depth_of_field_coc(10.0, 5.0, 8.0, 50.0).abs();
        assert!(coc_14 > coc_8);
    }

    #[test]
    fn returns_zero_when_depth_equals_focus_distance() {
        // D1 f32 bound (TS: 4 decimal digits).
        assert_close(compute_depth_of_field_coc(5.0, 5.0, 1.8, 50.0), 0.0, 5e-5);
    }
}

mod compute_linear_depth_from_nonlinear {
    use super::*;

    #[test]
    fn depth_half_returns_a_value_between_near_and_far() {
        let linear = compute_linear_depth_from_nonlinear(0.5, 0.1, 100.0);
        assert!(linear > 0.1 && linear < 100.0);
    }

    #[test]
    fn depth_one_returns_far_plane() {
        // D1 f32 bound (TS: 0 decimal digits).
        assert_close(
            compute_linear_depth_from_nonlinear(1.0, 0.1, 1000.0),
            1000.0,
            0.5,
        );
    }

    #[test]
    fn depth_zero_returns_near_plane() {
        // D1 f32 bound (TS: 3 decimal digits).
        assert_close(
            compute_linear_depth_from_nonlinear(0.0, 0.1, 1000.0),
            0.1,
            5e-4,
        );
    }

    #[test]
    fn uses_the_standard_hyperbolic_depth_formula() {
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(
            compute_linear_depth_from_nonlinear(0.0, 1.0, 10.0),
            1.0,
            5e-6,
        );
    }
}

mod compute_ssao_sample_kernel {
    use super::*;

    #[test]
    fn all_samples_are_within_the_unit_sphere() {
        let mut out = [0.0; 48];
        let count = compute_ssao_sample_kernel(&mut out, 16.0);
        for sample in out[..count * 3].chunks_exact(3) {
            let length =
                (sample[0] * sample[0] + sample[1] * sample[1] + sample[2] * sample[2]).sqrt();
            assert!(length <= 1.0 + 1e-6);
        }
    }

    #[test]
    fn all_z_components_are_non_negative() {
        let mut out = [0.0; 48];
        let count = compute_ssao_sample_kernel(&mut out, 16.0);
        assert!((0..count).all(|index| out[index * 3 + 2] >= 0.0));
    }

    #[test]
    fn is_deterministic() {
        let mut a = [0.0; 24];
        let mut b = [0.0; 24];
        compute_ssao_sample_kernel(&mut a, 8.0);
        compute_ssao_sample_kernel(&mut b, 8.0);
        for (actual, expected) in a.into_iter().zip(b) {
            // D1 f32 bound (TS: 5 decimal digits).
            assert_close(actual, expected, 5e-6);
        }
    }

    #[test]
    fn returns_the_requested_sample_count() {
        let mut out = [0.0; 48];
        assert_eq!(compute_ssao_sample_kernel(&mut out, 16.0), 16);
    }
}
