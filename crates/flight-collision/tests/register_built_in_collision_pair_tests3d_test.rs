use flight_collision::*;

fn sphere_shape(x: f64, y: f64, z: f64, radius: f64) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D { x, y, z, radius })
}
fn aabb_shape() -> CollisionShape3D {
    CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -1.0,
        min_y: -1.0,
        min_z: -1.0,
        max_x: 1.0,
        max_y: 1.0,
        max_z: 1.0,
    })
}
fn box_shape() -> CollisionShape3D {
    CollisionShape3D::Box(CollisionBox3D {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        half_x: 1.0,
        half_y: 1.0,
        half_z: 1.0,
        rotation_x: 0.0,
        rotation_y: 0.0,
        rotation_z: 0.0,
        rotation_w: 1.0,
    })
}
fn capsule_shape() -> CollisionShape3D {
    CollisionShape3D::Capsule(CollisionCapsule3D {
        x0: 0.0,
        y0: -1.0,
        z0: 0.0,
        x1: 0.0,
        y1: 1.0,
        z1: 0.0,
        radius: 0.5,
    })
}

fn has_pair_test(a: &CollisionShape3D, b: &CollisionShape3D) -> bool {
    let mut manifold = create_collision_manifold3d();
    get_collision_pair_test3d(a, b, &mut manifold).is_some()
}

mod register_built_in_collision_pair_tests3d {
    use super::*;

    #[test]
    fn registers_exactly_the_seven_canonical_orders() {
        register_built_in_collision_pair_tests3d();

        let aabb1 = aabb_shape();
        let aabb2 = aabb_shape();
        let box1 = box_shape();
        let box2 = box_shape();
        let cap1 = capsule_shape();
        let cap2 = capsule_shape();
        let sp1 = sphere_shape(0.0, 0.0, 0.0, 1.0);
        let sp2 = sphere_shape(0.0, 0.0, 0.0, 1.0);
        let sp3 = sphere_shape(0.0, 0.0, 0.0, 1.0);
        let sp4 = sphere_shape(0.0, 0.0, 0.0, 1.0);
        let sp5 = sphere_shape(1.0, 0.0, 0.0, 1.0);
        let aabb3 = aabb_shape();
        let box3 = box_shape();
        let cap3 = capsule_shape();

        let pairs: Vec<(&CollisionShape3D, &CollisionShape3D, &str)> = vec![
            (&aabb1, &aabb2, "aabb-aabb"),
            (&box1, &box2, "box-box"),
            (&cap1, &cap2, "capsule-capsule"),
            (&sp1, &aabb3, "sphere-aabb"),
            (&sp2, &box3, "sphere-box"),
            (&sp3, &cap3, "sphere-capsule"),
            (&sp4, &sp5, "sphere-sphere"),
        ];

        for (a, b, name) in pairs {
            assert!(has_pair_test(a, b), "{} should be registered", name);
        }
    }

    #[test]
    fn leaves_the_reversed_orders_unregistered_since_the_dispatcher_mirrors_them() {
        register_built_in_collision_pair_tests3d();

        assert!(!has_pair_test(&aabb_shape(), &sphere_shape(0.0, 0.0, 0.0, 1.0)));
        assert!(!has_pair_test(
            &capsule_shape(),
            &sphere_shape(0.0, 0.0, 0.0, 1.0)
        ));
        assert!(!has_pair_test(&box_shape(), &sphere_shape(0.0, 0.0, 0.0, 1.0)));
    }

    #[test]
    fn routes_a_reversed_pair_through_the_dispatcher_with_the_normal_negated() {
        register_built_in_collision_pair_tests3d();

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

        assert!(test_collision3d(&sphere, &aabb, &mut forward));
        assert!(test_collision3d(&aabb, &sphere, &mut reversed));
        assert!((reversed.normal_y - (-forward.normal_y)).abs() < 1e-10);
        assert!((reversed.depth - forward.depth).abs() < 1e-10);
    }

    #[test]
    fn takes_precedence_over_the_generic_floor_for_a_registered_pair() {
        register_built_in_collision_pair_tests3d();

        // Two exactly touching spheres: the closed form says not overlapping.
        let mut out = create_collision_manifold3d();
        assert!(!test_collision3d(
            &sphere_shape(0.0, 0.0, 0.0, 1.0),
            &sphere_shape(2.0, 0.0, 0.0, 1.0),
            &mut out,
        ));
    }
}
