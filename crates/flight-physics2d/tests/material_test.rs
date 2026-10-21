use flight_physics2d::*;

mod mix_physics2d_friction {
    use super::*;

    #[test]
    fn does_not_overflow_while_the_geometric_mean_remains_finite() {
        let mixed = mix_physics2d_friction(f32::MAX, f32::MAX);
        assert!(mixed.is_finite());
        assert!((mixed / f32::MAX - 1.0).abs() < 0.005);
    }

    #[test]
    fn is_symmetric_and_leaves_equal_coefficients_unchanged() {
        assert_eq!(
            mix_physics2d_friction(0.25, 1.0),
            mix_physics2d_friction(1.0, 0.25)
        );
        assert!((mix_physics2d_friction(0.36, 0.36) - 0.36).abs() < 0.005);
    }

    #[test]
    fn keeps_a_pair_frictionless_when_either_surface_has_zero_friction() {
        assert_eq!(mix_physics2d_friction(0.0, 1.0), 0.0);
        assert_eq!(mix_physics2d_friction(1.0, 0.0), 0.0);
    }
}

mod mix_physics2d_restitution {
    use super::*;

    #[test]
    fn uses_the_bouncier_surface_symmetrically() {
        assert_eq!(mix_physics2d_restitution(0.2, 0.8), 0.8);
        assert_eq!(mix_physics2d_restitution(0.8, 0.2), 0.8);
    }
}
