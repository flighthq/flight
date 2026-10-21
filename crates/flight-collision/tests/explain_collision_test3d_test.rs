use flight_collision::contract::*;
use flight_collision::*;

fn sphere(x: f32, radius: f32) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D {
        x,
        y: 0.0,
        z: 0.0,
        radius,
    })
}

mod explain_collision_test3d {
    use super::*;

    #[test]
    fn distinguishes_overlap_from_ordinary_separation() {
        // Overlapping
        let explanation = explain_collision_test3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(0.0, 2.0),
            &sphere(1.0, 2.0),
        );
        assert_eq!(explanation.kind, None);
        assert!(explanation.overlapping);
        assert_eq!(explanation.shape_index, None);
        assert_eq!(explanation.status, CollisionTestStatus::Overlapping);

        // Separated
        let explanation = explain_collision_test3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(0.0, 2.0),
            &sphere(10.0, 2.0),
        );
        assert_eq!(explanation.kind, None);
        assert!(!explanation.overlapping);
        assert_eq!(explanation.shape_index, None);
        assert_eq!(explanation.status, CollisionTestStatus::Separated);
    }

    #[test]
    fn reports_the_first_invalid_shape() {
        // First shape degenerate (zero radius)
        let explanation = explain_collision_test3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(0.0, 0.0),
            &sphere(1.0, 2.0),
        );
        assert_eq!(explanation.kind, Some(CollisionShapeKind3D::Sphere));
        assert!(!explanation.overlapping);
        assert_eq!(explanation.shape_index, Some(0));
        assert_eq!(explanation.status, CollisionTestStatus::DegenerateShape);

        // Second shape degenerate (negative radius)
        let explanation = explain_collision_test3d(
            &crate::collision_registry3d_with_built_ins(),
            &sphere(0.0, 2.0),
            &sphere(1.0, -1.0),
        );
        assert_eq!(explanation.kind, Some(CollisionShapeKind3D::Sphere));
        assert!(!explanation.overlapping);
        assert_eq!(explanation.shape_index, Some(1));
        assert_eq!(explanation.status, CollisionTestStatus::DegenerateShape);
    }

    #[test]
    fn checks_validity_before_registration() {
        // Both a degenerate shape and a valid shape: validity is diagnosed first.
        let mut registry = crate::collision_registry3d_with_built_ins();
        clear_collision_pair_tests3d(&mut registry);
        clear_collision_supports3d(&mut registry);
        let explanation = explain_collision_test3d(&registry, &sphere(0.0, 0.0), &sphere(1.0, 2.0));
        assert_eq!(explanation.status, CollisionTestStatus::DegenerateShape);

        let explanation = explain_collision_test3d(&registry, &sphere(0.0, 2.0), &sphere(1.0, 2.0));
        assert_eq!(explanation.kind, Some(CollisionShapeKind3D::Sphere));
        assert_eq!(explanation.shape_index, Some(0));
        assert_eq!(
            explanation.status,
            CollisionTestStatus::UnsupportedShapeKind
        );
    }

    // Note: TS test "names an unrecognized vendor kind" uses { kind: 'acme.cone' }
    // which cannot be constructed in Rust's enum-based type system. Skipped.
}
