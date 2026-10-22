use super::*;

mod compute_linear_sampled_gaussian {
    use super::*;

    #[test]
    fn produces_combined_weights_that_sum_to_one() {
        for sigma in [1.0, 2.0, 3.5, 6.0] {
            let mut weights = Vec::new();
            let mut offsets = Vec::new();
            compute_linear_sampled_gaussian(&mut weights, &mut offsets, sigma);
            // D1 f32 bound (TS: 12 decimal digits; N-term accumulation).
            assert_sum_close(weights.iter().sum(), 1.0, weights.len(), 5e-13);
        }
    }

    #[test]
    fn reconstructs_the_discrete_kernel_mass_at_each_tap() {
        let mut discrete = Vec::new();
        compute_gaussian_kernel_weights(&mut discrete, 3.0);
        let mut weights = Vec::new();
        let mut offsets = Vec::new();
        compute_linear_sampled_gaussian(&mut weights, &mut offsets, 3.0);
        // D1 f32 bound (TS: 12 decimal digits; N-term accumulation).
        assert_sum_close(
            weights.iter().sum(),
            discrete.iter().sum(),
            weights.len() + discrete.len(),
            5e-13,
        );
    }

    #[test]
    fn reuses_the_caller_owned_weights_output() {
        let mut weights = Vec::with_capacity(32);
        let pointer = weights.as_ptr();
        let mut offsets = Vec::new();
        compute_linear_sampled_gaussian(&mut weights, &mut offsets, 2.0);
        assert_eq!(weights.as_ptr(), pointer);
    }

    #[test]
    fn sets_each_paired_offset_to_the_weighted_midpoint() {
        let sigma = 2.0;
        let mut discrete = Vec::new();
        compute_gaussian_kernel_weights(&mut discrete, sigma);
        let radius = (get_gaussian_kernel_size(sigma) - 1) / 2;
        let mut weights = Vec::new();
        let mut offsets = Vec::new();
        compute_linear_sampled_gaussian(&mut weights, &mut offsets, sigma);
        for tap in 0..weights.len() {
            let index = tap * 2;
            let position_a = index as f32 - radius as f32;
            if index + 1 < discrete.len() {
                let expected_weight = discrete[index] + discrete[index + 1];
                let expected_offset = (position_a * discrete[index]
                    + (position_a + 1.0) * discrete[index + 1])
                    / expected_weight;
                // D1 f32 bound (TS: 12 decimal digits).
                assert_close(weights[tap], expected_weight, 5e-13);
                // D1 f32 bound (TS: 12 decimal digits).
                assert_close(offsets[tap], expected_offset, 5e-13);
                assert!((position_a..=position_a + 1.0).contains(&offsets[tap]));
            } else {
                // D1 f32 bound (TS: 12 decimal digits).
                assert_close(weights[tap], discrete[index], 5e-13);
                assert_eq!(offsets[tap], position_a);
            }
        }
    }

    #[test]
    fn sizes_both_arrays_to_the_tap_count() {
        let mut weights = Vec::new();
        let mut offsets = Vec::new();
        compute_linear_sampled_gaussian(&mut weights, &mut offsets, 3.0);
        let count = get_linear_sampled_gaussian_tap_count(3.0);
        assert_eq!(weights.len(), count);
        assert_eq!(offsets.len(), count);
    }
}

mod get_linear_sampled_gaussian_tap_count {
    use super::*;

    #[test]
    fn is_ceil_kernel_size_over_two() {
        for sigma in [1.0, 2.0, 3.5, 6.0] {
            assert_eq!(
                get_linear_sampled_gaussian_tap_count(sigma),
                get_gaussian_kernel_size(sigma).div_ceil(2)
            );
        }
    }

    #[test]
    fn roughly_halves_the_discrete_tap_count() {
        let discrete = get_gaussian_kernel_size(4.0);
        let linear = get_linear_sampled_gaussian_tap_count(4.0);
        assert!(linear < discrete);
        assert_eq!(linear, discrete.div_ceil(2));
    }
}
