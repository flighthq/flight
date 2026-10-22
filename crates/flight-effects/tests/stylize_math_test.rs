use super::*;

mod compute_crt_mask_params {
    use super::*;

    #[test]
    fn curvature_is_clamped_to_zero_to_point_one() {
        let mut out = [0.0; 2];
        compute_crt_mask_params(&mut out, 360.0, 2.0);
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(out[1], 0.1, 5e-6);
    }

    #[test]
    fn higher_resolution_produces_larger_mask_scale() {
        let mut low = [0.0; 2];
        let mut high = [0.0; 2];
        compute_crt_mask_params(&mut low, 360.0, 0.0);
        compute_crt_mask_params(&mut high, 720.0, 0.0);
        assert!(high[0] > low[0]);
    }

    #[test]
    fn writes_two_finite_values() {
        let mut out = [f32::NAN; 2];
        compute_crt_mask_params(&mut out, 720.0, 0.5);
        assert!(out.iter().all(|value| value.is_finite()));
    }
}

mod compute_halftone_cell_params {
    use super::*;

    #[test]
    fn zero_angle_produces_cosine_one_and_sine_zero() {
        let mut out = [0.0; 3];
        compute_halftone_cell_params(&mut out, 0.25, 0.0);
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(out[1], 1.0, 5e-6);
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(out[2], 0.0, 5e-6);
    }

    #[test]
    fn writes_cell_size_cosine_and_sine() {
        let mut out = [0.0; 3];
        compute_halftone_cell_params(&mut out, 0.125, std::f32::consts::FRAC_PI_4);
        for (actual, expected) in out.into_iter().zip([
            8.0,
            std::f32::consts::FRAC_1_SQRT_2,
            std::f32::consts::FRAC_1_SQRT_2,
        ]) {
            // D1 f32 bound (TS: 4 decimal digits).
            assert_close(actual, expected, 5e-5);
        }
    }
}

mod compute_scanline_params {
    use super::*;

    #[test]
    fn clamps_intensity_to_zero_to_one() {
        let mut out = [0.0; 2];
        compute_scanline_params(&mut out, 480.0, 2.0);
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(out[1], 1.0, 5e-6);
    }

    #[test]
    fn writes_scale_and_intensity() {
        let mut out = [0.0; 2];
        compute_scanline_params(&mut out, 480.0, 0.5);
        // D1 f32 bound (TS: 4 decimal digits).
        assert_close(out[0], 1.0, 5e-5);
        // D1 f32 bound (TS: 4 decimal digits).
        assert_close(out[1], 0.5, 5e-5);
    }
}

mod create_bayer_matrix {
    use super::*;

    fn all_unique(values: &[f32]) -> bool {
        return values
            .iter()
            .enumerate()
            .all(|(index, value)| values[index + 1..].iter().all(|other| value != other));
    }

    #[test]
    fn all_values_are_in_zero_to_one() {
        let mut out = [0.0; 16];
        let size = create_bayer_matrix(&mut out, 2.0);
        assert!(
            out[..size * size]
                .iter()
                .all(|value| (0.0..1.0).contains(value))
        );
    }

    #[test]
    fn all_values_in_four_by_four_matrix_are_unique() {
        let mut out = [0.0; 16];
        create_bayer_matrix(&mut out, 2.0);
        assert!(all_unique(&out));
    }

    #[test]
    fn all_values_in_two_by_two_matrix_are_unique() {
        let mut out = [0.0; 4];
        create_bayer_matrix(&mut out, 1.0);
        assert!(all_unique(&out));
    }

    #[test]
    fn is_deterministic() {
        let mut a = [0.0; 16];
        let mut b = [0.0; 16];
        create_bayer_matrix(&mut a, 2.0);
        create_bayer_matrix(&mut b, 2.0);
        for (actual, expected) in a.into_iter().zip(b) {
            // D1 f32 bound (TS: 5 decimal digits).
            assert_close(actual, expected, 5e-6);
        }
    }

    #[test]
    fn returns_size_four_for_order_two() {
        let mut out = [0.0; 16];
        assert_eq!(create_bayer_matrix(&mut out, 2.0), 4);
    }

    #[test]
    fn returns_size_two_for_order_one() {
        let mut out = [0.0; 4];
        assert_eq!(create_bayer_matrix(&mut out, 1.0), 2);
    }
}
