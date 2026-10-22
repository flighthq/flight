use super::*;

mod compute_gaussian_radius_from_sigma {
    use super::*;

    #[test]
    fn clamps_negative_sigma_to_zero() {
        assert_eq!(compute_gaussian_radius_from_sigma(-1.0), 0.0);
    }

    #[test]
    fn returns_ceil_three_sigma() {
        assert_eq!(compute_gaussian_radius_from_sigma(2.0), 6.0);
        assert_eq!(compute_gaussian_radius_from_sigma(2.5), 8.0);
    }

    #[test]
    fn returns_zero_for_zero_sigma() {
        assert_eq!(compute_gaussian_radius_from_sigma(0.0), 0.0);
    }

    #[test]
    fn round_trips_with_compute_gaussian_sigma_from_radius() {
        let radius = compute_gaussian_radius_from_sigma(2.0);
        // D1 f32 bound (TS: 0 decimal digits).
        assert_close(compute_gaussian_sigma_from_radius(radius), 2.0, 0.5);
    }
}

mod compute_gaussian_sigma_from_radius {
    use super::*;

    #[test]
    fn clamps_negative_radius_to_zero() {
        assert_eq!(compute_gaussian_sigma_from_radius(-3.0), 0.0);
    }

    #[test]
    fn returns_radius_divided_by_three() {
        // D1 f32 bound (TS: 2 decimal digits default).
        assert_close(compute_gaussian_sigma_from_radius(6.0), 2.0, 5e-3);
        // D1 f32 bound (TS: 2 decimal digits default).
        assert_close(compute_gaussian_sigma_from_radius(9.0), 3.0, 5e-3);
    }

    #[test]
    fn returns_zero_for_zero_radius() {
        assert_eq!(compute_gaussian_sigma_from_radius(0.0), 0.0);
    }

    #[test]
    fn round_trips_with_compute_gaussian_radius_from_sigma() {
        let sigma = compute_gaussian_sigma_from_radius(8.0);
        assert_eq!(compute_gaussian_radius_from_sigma(sigma), 8.0);
    }
}

mod compute_separable_blur_pass_count {
    use super::*;

    #[test]
    fn defaults_to_one_when_samples_is_undefined() {
        assert_eq!(compute_separable_blur_pass_count(None), 1.0);
    }

    #[test]
    fn returns_at_least_one() {
        assert_eq!(compute_separable_blur_pass_count(Some(0.0)), 1.0);
        assert_eq!(compute_separable_blur_pass_count(Some(-5.0)), 1.0);
    }

    #[test]
    fn returns_integer_pass_count() {
        assert_eq!(compute_separable_blur_pass_count(Some(4.0)), 4.0);
    }

    #[test]
    fn rounds_fractional_samples() {
        assert_eq!(compute_separable_blur_pass_count(Some(2.4)), 2.0);
        assert_eq!(compute_separable_blur_pass_count(Some(2.6)), 3.0);
    }
}

mod create_gaussian_kernel_weights {
    use super::*;

    #[test]
    fn center_weight_is_the_largest() {
        let mut out = [0.0; 10];
        let count = create_gaussian_kernel_weights(&mut out, 5.0, 2.0);
        assert!(out[1..count].iter().all(|weight| out[0] > *weight));
    }

    #[test]
    fn normalized_weights_sum_to_one() {
        let mut out = [0.0; 5];
        let count = create_gaussian_kernel_weights(&mut out, 4.0, 1.5);
        let sum = out[0] + out[1..count].iter().map(|value| 2.0 * value).sum::<f32>();
        // D1 f32 bound (TS: 5 decimal digits; nine-term symmetric accumulation).
        assert_sum_close(sum, 1.0, 9, 5e-6);
    }

    #[test]
    fn weights_decrease_monotonically_from_center() {
        let mut out = [0.0; 10];
        let count = create_gaussian_kernel_weights(&mut out, 5.0, 2.0);
        assert!(out[..count].windows(2).all(|pair| pair[0] > pair[1]));
    }

    #[test]
    fn writes_radius_plus_one_weights_and_returns_that_count() {
        let mut out = [0.0; 10];
        assert_eq!(create_gaussian_kernel_weights(&mut out, 4.0, 1.5), 5);
    }
}
