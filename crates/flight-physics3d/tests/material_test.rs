use super::*;

mod mix_physics_3d_friction {
    use super::*;

    #[test]
    fn uses_the_geometric_mean() {
        assert_eq!(mix_physics_3d_friction(0.25, 1.0), 0.5);
        assert_eq!(mix_physics_3d_friction(0.0, 3.0), 0.0);
        assert_eq!(mix_physics_3d_friction(3.0, 0.0), 0.0);
        assert!((mix_physics_3d_friction(0.3, 0.3) - 0.3).abs() < 1e-6);
        assert_eq!(
            mix_physics_3d_friction(0.2, 0.8),
            mix_physics_3d_friction(0.8, 0.2)
        );
        let mixed = mix_physics_3d_friction(0.1, 0.9);
        assert!(mixed > 0.1);
        assert!(mixed < 0.9);
    }
}

mod mix_physics_3d_restitution {
    use super::*;

    #[test]
    fn uses_the_larger_value() {
        assert_eq!(mix_physics_3d_restitution(0.25, 0.75), 0.75);
        assert_eq!(
            mix_physics_3d_restitution(0.8, 0.1),
            mix_physics_3d_restitution(0.1, 0.8)
        );
        assert_eq!(mix_physics_3d_restitution(0.0, 0.0), 0.0);
    }
}
