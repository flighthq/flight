use super::*;

mod get_blur_downsample_level {
    use super::*;

    #[test]
    fn stays_at_full_resolution_at_or_below_the_max_sigma_threshold() {
        assert_eq!(get_blur_downsample_level(1.0), 0);
        assert_eq!(get_blur_downsample_level(2.0), 0);
        assert_eq!(get_blur_downsample_level(4.0), 0);
    }

    #[test]
    fn adds_one_level_per_doubling_of_sigma_past_the_threshold() {
        assert_eq!(get_blur_downsample_level(8.0), 1);
        assert_eq!(get_blur_downsample_level(16.0), 2);
        assert_eq!(get_blur_downsample_level(32.0), 3);
    }

    #[test]
    fn rounds_a_partial_doubling_up_to_the_next_level() {
        assert_eq!(get_blur_downsample_level(5.0), 1);
    }

    #[test]
    fn returns_zero_for_non_positive_sigma() {
        assert_eq!(get_blur_downsample_level(0.0), 0);
        assert_eq!(get_blur_downsample_level(-4.0), 0);
    }

    #[test]
    fn never_leaves_a_residual_sigma_above_the_threshold() {
        for sigma in [4.0, 5.0, 8.0, 13.0, 16.0, 40.0, 100.0] {
            assert!(get_blur_residual_sigma(sigma, get_blur_downsample_level(sigma)) <= 4.0);
        }
    }
}

mod get_blur_residual_sigma {
    use super::*;

    #[test]
    fn divides_sigma_by_two_to_the_level() {
        assert_eq!(get_blur_residual_sigma(8.0, 1), 4.0);
        assert_eq!(get_blur_residual_sigma(16.0, 2), 4.0);
        assert_eq!(get_blur_residual_sigma(4.0, 0), 4.0);
        assert_eq!(get_blur_residual_sigma(32.0, 3), 4.0);
    }

    #[test]
    fn returns_zero_for_non_positive_sigma() {
        assert_eq!(get_blur_residual_sigma(0.0, 2), 0.0);
        assert_eq!(get_blur_residual_sigma(-8.0, 1), 0.0);
    }
}
