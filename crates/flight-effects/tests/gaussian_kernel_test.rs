use super::*;

mod compute_gaussian_kernel_weights {
    use super::*;

    #[test]
    fn makes_the_center_weight_the_maximum() {
        let mut out = Vec::new();
        compute_gaussian_kernel_weights(&mut out, 2.5);
        let center = (out.len() - 1) / 2;
        assert!(out.iter().all(|weight| out[center] >= *weight));
    }

    #[test]
    fn matches_the_closed_form_gaussian_ratio_between_taps() {
        let sigma = 2.0;
        let mut out = Vec::new();
        compute_gaussian_kernel_weights(&mut out, sigma);
        let center = (out.len() - 1) / 2;
        for distance in [1, 2, 3] {
            let expected = (-((distance * distance) as f32) / (2.0 * sigma * sigma)).exp();
            // D1 f32 bound (TS: 12 decimal digits).
            assert_close(out[center + distance] / out[center], expected, 5e-13);
        }
    }

    #[test]
    fn produces_a_symmetric_kernel() {
        let mut out = Vec::new();
        compute_gaussian_kernel_weights(&mut out, 2.0);
        for index in 0..out.len() {
            // D1 f32 bound (TS: 12 decimal digits).
            assert_close(out[index], out[out.len() - 1 - index], 5e-13);
        }
    }

    #[test]
    fn produces_weights_that_sum_to_one_across_several_sigmas() {
        for sigma in [0.75, 1.0, 2.0, 3.5, 6.0] {
            let mut out = Vec::new();
            compute_gaussian_kernel_weights(&mut out, sigma);
            // D1 f32 bound (TS: 12 decimal digits; N-term accumulation).
            assert_sum_close(out.iter().sum(), 1.0, out.len(), 5e-13);
        }
    }

    #[test]
    fn returns_the_identity_kernel_for_non_positive_sigma() {
        let mut out = Vec::new();
        compute_gaussian_kernel_weights(&mut out, 0.0);
        assert_eq!(out, [1.0]);
        compute_gaussian_kernel_weights(&mut out, -3.0);
        assert_eq!(out, [1.0]);
    }

    #[test]
    fn reuses_the_caller_owned_output() {
        let mut out = Vec::with_capacity(64);
        let pointer = out.as_ptr();
        compute_gaussian_kernel_weights(&mut out, 1.5);
        assert_eq!(out.as_ptr(), pointer);
    }

    #[test]
    fn sizes_out_to_get_gaussian_kernel_size() {
        let mut out = vec![9.0; 10];
        compute_gaussian_kernel_weights(&mut out, 2.0);
        assert_eq!(out.len(), get_gaussian_kernel_size(2.0));
    }
}

mod get_gaussian_kernel_size {
    use super::*;

    #[test]
    fn is_always_odd() {
        for sigma in [0.5, 1.0, 1.7, 4.0, 9.0] {
            assert_eq!(get_gaussian_kernel_size(sigma) % 2, 1);
        }
    }

    #[test]
    fn is_radius_times_two_plus_one() {
        assert_eq!(get_gaussian_kernel_size(1.0), 7);
        assert_eq!(get_gaussian_kernel_size(2.0), 13);
        assert_eq!(get_gaussian_kernel_size(2.5), 17);
    }

    #[test]
    fn returns_one_for_non_positive_sigma() {
        assert_eq!(get_gaussian_kernel_size(0.0), 1);
        assert_eq!(get_gaussian_kernel_size(-2.0), 1);
    }
}
