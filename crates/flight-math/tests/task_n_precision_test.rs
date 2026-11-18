use flight_math::*;

mod angle_precision {
    use super::*;

    #[test]
    fn preserves_a_sub_single_precision_degree_delta() {
        let delta = deg_to_rad(180.000_000_001) - deg_to_rad(180.0);
        assert!(delta > 0.0);
        assert!(delta < 0.000_000_001);
    }
}

mod comparison_precision {
    use super::*;

    #[test]
    fn distinguishes_values_that_single_precision_collapses() {
        let magnitude = 16_777_216.0;
        assert!(!approx_equal(magnitude, magnitude + 0.25, Some(0.125)));
    }
}

mod constant_precision {
    use super::*;

    #[test]
    fn exposes_double_precision_constants() {
        assert_eq!(std::mem::size_of_val(&EPSILON), std::mem::size_of::<f64>());
        assert_eq!(std::mem::size_of_val(&CIRCLE_KAPPA), 8);
    }
}

mod interpolation_precision {
    use super::*;

    #[test]
    fn preserves_a_small_interval_at_large_magnitude() {
        let start = 16_777_216.0;
        let midpoint = lerp(start, start + 0.5, 0.5);
        assert_eq!(midpoint - start, 0.25);
    }
}
