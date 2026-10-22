use super::*;

fn pass_radii(sigma: f32, passes: usize) -> Vec<f32> {
    return (0..passes)
        .map(|pass| compute_box_blur_pass_radius(sigma, passes as f32, pass as f32))
        .collect();
}

fn effective_sigma(radii: &[f32]) -> f32 {
    return radii
        .iter()
        .map(|radius| (radius * radius + radius) / 3.0)
        .sum::<f32>()
        .sqrt();
}

mod compute_box_blur_pass_radius {
    use super::*;

    #[test]
    fn returns_zero_for_every_pass_when_sigma_is_zero() {
        assert_eq!(pass_radii(0.0, 3), [0.0, 0.0, 0.0]);
    }
    #[test]
    fn returns_zero_for_every_pass_when_sigma_is_negative() {
        assert_eq!(pass_radii(-1.0, 2), [0.0, 0.0]);
    }
    #[test]
    fn uses_at_most_two_distinct_box_sizes() {
        let mut values = pass_radii(12.0, 3);
        values.sort_by(f32::total_cmp);
        values.dedup();
        assert!(values.len() <= 2);
    }
    #[test]
    fn is_non_decreasing_in_pass_index() {
        assert!(pass_radii(4.0, 3).windows(2).all(|pair| pair[1] >= pair[0]));
    }
    #[test]
    fn approximates_the_target_sigma_without_overshooting() {
        for sigma in [4.0, 8.0, 12.0] {
            let effective = effective_sigma(&pass_radii(sigma, 3));
            assert!(effective > sigma * 0.9);
            assert!(effective <= sigma * 1.02);
        }
    }
    #[test]
    fn does_not_overshoot_like_a_single_repeated_rounded_radius() {
        let naive = compute_box_blur_radius(4.0, 3.0);
        let naive_sigma = effective_sigma(&[naive, naive, naive]);
        let split_sigma = effective_sigma(&pass_radii(4.0, 3));
        assert!(naive_sigma > 4.0);
        assert!((split_sigma - 4.0).abs() < (naive_sigma - 4.0).abs());
    }
}

mod compute_box_blur_radius {
    use super::*;
    #[test]
    fn returns_zero_for_sigma_zero() {
        assert_eq!(compute_box_blur_radius(0.0, 1.0), 0.0);
    }
    #[test]
    fn returns_zero_for_negative_sigma() {
        assert_eq!(compute_box_blur_radius(-4.0, 1.0), 0.0);
    }
    #[test]
    fn returns_a_positive_radius_for_positive_sigma() {
        assert!(compute_box_blur_radius(4.0, 1.0) > 0.0);
    }
    #[test]
    fn returns_a_smaller_radius_for_more_passes() {
        assert!(compute_box_blur_radius(10.0, 3.0) < compute_box_blur_radius(10.0, 1.0));
    }
    #[test]
    fn returns_radius_six_for_sigma_four_with_one_pass() {
        assert_eq!(compute_box_blur_radius(4.0, 1.0), 6.0);
    }
}

mod compute_gaussian_sigma_for_blur_radius {
    use super::*;
    #[test]
    fn returns_zero_for_radius_zero() {
        assert_eq!(compute_gaussian_sigma_for_blur_radius(0.0, 1.0), 0.0);
    }
    #[test]
    fn returns_zero_for_negative_radius() {
        assert_eq!(compute_gaussian_sigma_for_blur_radius(-1.0, 1.0), 0.0);
    }
    #[test]
    fn returns_zero_for_non_positive_passes() {
        assert_eq!(compute_gaussian_sigma_for_blur_radius(4.0, 0.0), 0.0);
    }
    #[test]
    fn returns_a_positive_sigma_for_positive_inputs() {
        assert!(compute_gaussian_sigma_for_blur_radius(6.0, 1.0) > 0.0);
    }
    #[test]
    fn produces_a_larger_sigma_for_more_passes() {
        assert!(
            compute_gaussian_sigma_for_blur_radius(4.0, 3.0)
                > compute_gaussian_sigma_for_blur_radius(4.0, 1.0)
        );
    }
}
