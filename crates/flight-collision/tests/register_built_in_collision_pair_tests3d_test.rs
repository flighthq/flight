use flight_collision::contract::*;
use flight_collision::*;

fn sphere_shape(x: f32, y: f32, z: f32, radius: f32) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D { x, y, z, radius })
}
fn has_pair_test(registry: &CollisionRegistry3D, kind_a: &str, kind_b: &str) -> bool {
    return get_collision_pair_test3d(registry, kind_a, kind_b).is_some();
}

mod register_built_in_collision_pair_tests3d {
    use super::*;

    #[test]
    fn registers_exactly_the_seven_canonical_orders() {
        let mut registry = crate::collision_registry3d();
        register_built_in_collision_pair_tests3d(&mut registry);

        let pairs: Vec<(&str, &str, &str)> = vec![
            ("aabb", "aabb", "aabb-aabb"),
            ("box", "box", "box-box"),
            ("capsule", "capsule", "capsule-capsule"),
            ("sphere", "aabb", "sphere-aabb"),
            ("sphere", "box", "sphere-box"),
            ("sphere", "capsule", "sphere-capsule"),
            ("sphere", "sphere", "sphere-sphere"),
        ];

        for (kind_a, kind_b, name) in pairs {
            assert!(
                has_pair_test(&registry, kind_a, kind_b),
                "{} should be registered",
                name
            );
        }
        assert_eq!(registry.pair_tests.len(), 7);
    }

    #[test]
    fn leaves_the_reversed_orders_unregistered_since_the_dispatcher_mirrors_them() {
        let mut registry = crate::collision_registry3d();
        register_built_in_collision_pair_tests3d(&mut registry);

        assert!(!has_pair_test(&registry, "aabb", "sphere"));
        assert!(!has_pair_test(&registry, "capsule", "sphere"));
        assert!(!has_pair_test(&registry, "box", "sphere"));
    }

    #[test]
    fn routes_a_reversed_pair_through_the_dispatcher_with_the_normal_negated() {
        let registry = crate::collision_registry3d_with_built_ins();

        let mut forward = create_collision_manifold3d();
        let mut reversed = create_collision_manifold3d();

        let sphere = sphere_shape(0.0, 2.5, 0.0, 1.0);
        let aabb = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 1.0,
        });

        assert!(test_collision3d(&registry, &sphere, &aabb, &mut forward));
        assert!(test_collision3d(&registry, &aabb, &sphere, &mut reversed));
        assert!((reversed.normal_y - (-forward.normal_y)).abs() < 1e-10);
        assert!((reversed.depth - forward.depth).abs() < 1e-10);
    }

    #[test]
    fn takes_precedence_over_the_generic_floor_for_a_registered_pair() {
        let registry = crate::collision_registry3d_with_built_ins();

        // Two exactly touching spheres: the closed form says not overlapping.
        let mut out = create_collision_manifold3d();
        assert!(!test_collision3d(
            &registry,
            &sphere_shape(0.0, 0.0, 0.0, 1.0),
            &sphere_shape(2.0, 0.0, 0.0, 1.0),
            &mut out,
        ));
    }
}
