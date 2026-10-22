use flight_collision::contract::*;
use std::sync::Arc;

fn sphere(x: f32, radius: f32) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D {
        x,
        y: 0.0,
        z: 0.0,
        radius,
    })
}

mod set_collision_test_guard3d {
    use super::*;

    #[test]
    fn is_callable_and_accepts_none() {
        let mut registry = crate::collision_registry3d();
        set_collision_test_guard3d(&mut registry, None);
        assert!(registry.test_guard.is_none());
    }

    #[test]
    fn is_callable_with_a_function() {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let captured = calls.clone();
        let mut registry = crate::collision_registry3d_with_built_ins();
        set_collision_test_guard3d(
            &mut registry,
            Some(Arc::new(move |_a, _b| {
                captured.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            })),
        );
        let mut out = create_collision_manifold3d();
        test_collision3d(&registry, &sphere(0.0, 1.0), &sphere(1.5, 1.0), &mut out);
        set_collision_test_guard3d(&mut registry, None);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}

mod test_collision3d {
    use super::*;

    #[test]
    fn dispatches_the_actual_callback_registered_by_the_caller() {
        let mut registry = crate::collision_registry3d();
        register_collision_pair_test3d(
            &mut registry,
            "sphere",
            "cylinder",
            Arc::new(|_, _, out| {
                out.overlapping = true;
                out.normal_z = 0.5;
                out.depth = 9.0;
                true
            }),
        );
        let cylinder = CollisionShape3D::Cylinder(CollisionCylinder3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 1.0,
            z1: 0.0,
            radius: 1.0,
        });
        let mut out = create_collision_manifold3d();
        assert!(test_collision3d(
            &registry,
            &sphere(0.0, 1.0),
            &cylinder,
            &mut out
        ));
        assert_eq!(out.normal_z, 0.5);
        assert_eq!(out.depth, 9.0);
    }

    #[test]
    fn returns_false_when_the_caller_registered_nothing() {
        let registry = crate::collision_registry3d();
        let mut out = create_collision_manifold3d();
        assert!(!test_collision3d(
            &registry,
            &sphere(0.0, 1.0),
            &sphere(0.0, 1.0),
            &mut out,
        ));
    }

    #[test]
    fn falls_through_to_the_generic_gjk_epa_floor_when_no_specialization_is_registered() {
        // In Rust, sphere-sphere has a direct specialization, so we use a pair without
        // one (e.g. Cylinder-Sphere) to test the GJK/EPA fallthrough.
        let cylinder = CollisionShape3D::Cylinder(CollisionCylinder3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 2.0,
            radius: 1.0,
        });
        let s = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 1.5,
            z: 1.0,
            radius: 1.0,
        });
        let mut out = create_collision_manifold3d();
        assert!(test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &cylinder,
            &s,
            &mut out
        ));
        assert!(out.depth > 0.0);
    }

    #[test]
    fn prefers_a_specialization_registered_for_the_ordered_pair() {
        // In Rust, sphere-sphere is statically specialized with the closed-form test.
        // The closed form produces exact results (12+ digits) vs GJK/EPA (~4 digits).
        let mut out = create_collision_manifold3d();
        assert!(test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(0.0, 1.0),
            &sphere(1.5, 1.0),
            &mut out
        ));
        assert!(out.overlapping);
        // Closed-form depth is exact: 2.0 - 1.5 = 0.5
        assert!((out.depth - 0.5).abs() < 1e-12);
        assert!((out.normal_x - (-1.0)).abs() < 1e-12);
    }

    #[test]
    fn negates_the_normal_when_only_the_reversed_specialization_exists() {
        // (Aabb, Sphere) has no direct match, but (Sphere, Aabb) does.
        // test_collision3d should try the reversed pair and negate the normal.
        let aabb = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        });
        let s = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 1.5,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        // Direct: test_collision3d(&crate::collision_registry3d_with_built_ins(), sphere, aabb) -> normal pushes sphere out of aabb
        let mut direct_out = create_collision_manifold3d();
        assert!(test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &s,
            &aabb,
            &mut direct_out
        ));
        // The sphere is to the right of the aabb, so the normal pushes it further right (+x).
        assert!(direct_out.normal_x > 0.0);

        // Reversed: test_collision3d(&crate::collision_registry3d_with_built_ins(), aabb, sphere) -> should negate the normal
        let mut reversed_out = create_collision_manifold3d();
        assert!(test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &aabb,
            &s,
            &mut reversed_out
        ));
        // Now A is the aabb and the normal should push aabb out of sphere (to the left, -x).
        assert!((reversed_out.normal_x - (-direct_out.normal_x)).abs() < 1e-10);
        assert!((reversed_out.depth - direct_out.depth).abs() < 1e-10);
    }

    #[test]
    fn clears_the_manifold_when_a_reversed_specialization_reports_no_overlap() {
        // (Aabb, Sphere) reversed to (Sphere, Aabb) but the shapes are separated.
        let aabb = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        });
        let s = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 50.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        let mut out = create_collision_manifold3d();
        out.overlapping = true;
        out.normal_x = 5.0;
        assert!(!test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &aabb,
            &s,
            &mut out
        ));
        assert!(!out.overlapping);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.normal_z, 0.0);
        assert_eq!(out.depth, 0.0);
    }

    #[test]
    fn reports_disjoint_shapes_as_not_overlapping() {
        let mut out = create_collision_manifold3d();
        assert!(!test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(0.0, 1.0),
            &sphere(50.0, 1.0),
            &mut out
        ));
    }

    #[test]
    fn orients_the_generic_normal_to_push_a_out_of_b_and_reverses_when_the_arguments_swap() {
        let mut first = create_collision_manifold3d();
        let mut second = create_collision_manifold3d();
        test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(0.0, 1.0),
            &sphere(1.5, 1.0),
            &mut first,
        );
        test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(1.5, 1.0),
            &sphere(0.0, 1.0),
            &mut second,
        );
        assert!((first.normal_x - (-second.normal_x)).abs() < 5e-3);
        assert!((first.depth - second.depth).abs() < 5e-5);
    }
}
