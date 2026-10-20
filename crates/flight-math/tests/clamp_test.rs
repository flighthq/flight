use flight_math::*;

mod clamp {
    use super::*;

    #[test]
    fn clamps_below_minimum() {
        assert_eq!(clamp(-5.0, 0.0, 10.0), 0.0);
    }

    #[test]
    fn clamps_above_maximum() {
        assert_eq!(clamp(15.0, 0.0, 10.0), 10.0);
    }

    #[test]
    fn leaves_value_within_range_unchanged() {
        assert_eq!(clamp(5.0, 0.0, 10.0), 5.0);
    }

    #[test]
    fn leaves_value_equal_to_min_unchanged() {
        assert_eq!(clamp(0.0, 0.0, 10.0), 0.0);
    }

    #[test]
    fn leaves_value_equal_to_max_unchanged() {
        assert_eq!(clamp(10.0, 0.0, 10.0), 10.0);
    }

    #[test]
    fn propagates_nan() {
        assert!(clamp(f32::NAN, 0.0, 10.0).is_nan());
    }
}

mod in_range {
    use super::*;

    #[test]
    fn returns_true_for_a_value_within_range() {
        assert!(in_range(5.0, 0.0, 10.0));
    }

    #[test]
    fn returns_true_at_the_minimum_boundary() {
        assert!(in_range(0.0, 0.0, 10.0));
    }

    #[test]
    fn returns_true_at_the_maximum_boundary() {
        assert!(in_range(10.0, 0.0, 10.0));
    }

    #[test]
    fn returns_false_below_minimum() {
        assert!(!in_range(-1.0, 0.0, 10.0));
    }

    #[test]
    fn returns_false_above_maximum() {
        assert!(!in_range(11.0, 0.0, 10.0));
    }
}

mod saturate {
    use super::*;

    #[test]
    fn clamps_below_0_to_0() {
        assert_eq!(saturate(-1.0), 0.0);
    }

    #[test]
    fn clamps_above_1_to_1() {
        assert_eq!(saturate(2.0), 1.0);
    }

    #[test]
    fn leaves_value_within_0_1_unchanged() {
        assert_eq!(saturate(0.5), 0.5);
    }

    #[test]
    fn leaves_0_unchanged() {
        assert_eq!(saturate(0.0), 0.0);
    }

    #[test]
    fn leaves_1_unchanged() {
        assert_eq!(saturate(1.0), 1.0);
    }

    #[test]
    fn returns_0_for_nan_gpu_semantics() {
        assert_eq!(saturate(f32::NAN), 0.0);
    }
}
