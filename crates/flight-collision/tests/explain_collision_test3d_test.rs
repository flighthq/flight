use flight_collision::*;
use flight_collision::contract::*;

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

    // Note: the TS test "names an unregistered kind" uses vi.resetModules() to clear
    // registrations. In Rust, dispatch is static via match, so there is no "unregistered"
    // state. That test is not portable.

    #[test]
    fn distinguishes_overlap_from_ordinary_separation() {
        // Overlapping
        let mut explanation = CollisionTestExplanation3D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test3d(&crate::collision_registry3d_with_built_ins(), &sphere(0.0, 2.0), &sphere(1.0, 2.0), &mut explanation);
        assert!(result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::ShapePairTest);
        assert!(explanation.overlapping);
        assert!(explanation.status.is_none());

        // Separated
        let mut explanation = CollisionTestExplanation3D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result =
            explain_collision_test3d(&crate::collision_registry3d_with_built_ins(), &sphere(0.0, 2.0), &sphere(10.0, 2.0), &mut explanation);
        assert!(!result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::ShapePairTest);
        assert!(!explanation.overlapping);
        assert!(explanation.status.is_none());
    }

    #[test]
    fn reports_the_first_invalid_shape() {
        // First shape degenerate (zero radius)
        let mut explanation = CollisionTestExplanation3D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test3d(&crate::collision_registry3d_with_built_ins(), &sphere(0.0, 0.0), &sphere(1.0, 2.0), &mut explanation);
        assert!(!result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::NoTest);
        assert!(!explanation.overlapping);
        assert_eq!(
            explanation.status,
            Some(CollisionTestStatus::DegenerateShape)
        );

        // Second shape degenerate (negative radius)
        let mut explanation = CollisionTestExplanation3D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result =
            explain_collision_test3d(&crate::collision_registry3d_with_built_ins(), &sphere(0.0, 2.0), &sphere(1.0, -1.0), &mut explanation);
        assert!(!result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::NoTest);
        assert!(!explanation.overlapping);
        assert_eq!(
            explanation.status,
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn checks_validity_before_registration() {
        // Both a degenerate shape and a valid shape: validity is diagnosed first.
        let mut explanation = CollisionTestExplanation3D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test3d(&crate::collision_registry3d_with_built_ins(), &sphere(0.0, 0.0), &sphere(1.0, 2.0), &mut explanation);
        assert!(!result);
        assert_eq!(
            explanation.status,
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    // Note: TS test "names an unrecognized vendor kind" uses { kind: 'acme.cone' }
    // which cannot be constructed in Rust's enum-based type system. Skipped.
}
