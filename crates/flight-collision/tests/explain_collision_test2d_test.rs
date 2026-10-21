use flight_collision::*;
use flight_collision::contract::*;

mod explain_collision_test2d {
    use super::*;

    // Note: the TS test "names an unregistered kind" uses vi.resetModules() to clear
    // registrations. In Rust, dispatch is static via match, so there is no "unregistered"
    // state. That test is not portable.

    #[test]
    fn distinguishes_overlap_from_ordinary_separation() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        // Overlapping
        let mut explanation = CollisionTestExplanation2D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test2d(
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 1.0,
                y: 0.0,
                radius: 2.0,
            }),
            &mut explanation,
        );
        assert!(result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::ShapePairTest);
        assert!(explanation.overlapping);
        assert!(explanation.status.is_none());

        // Separated
        let mut explanation = CollisionTestExplanation2D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test2d(
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 10.0,
                y: 0.0,
                radius: 2.0,
            }),
            &mut explanation,
        );
        assert!(!result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::ShapePairTest);
        assert!(!explanation.overlapping);
        assert!(explanation.status.is_none());
    }

    #[test]
    fn identifies_degenerate_shape() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        // Second shape is degenerate (zero radius)
        let mut explanation = CollisionTestExplanation2D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test2d(
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 0.0,
            }),
            &mut explanation,
        );
        assert!(!result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::NoTest);
        assert!(!explanation.overlapping);
        assert_eq!(
            explanation.status,
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn identifies_non_convex_polygon() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        // First shape is non-convex polygon
        let mut explanation = CollisionTestExplanation2D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test2d(
            &CollisionShape2D::Polygon(CollisionPolygon2D {
                points: vec![0.0, 0.0, 2.0, 0.0, 1.0, 1.0, 2.0, 2.0, 0.0, 2.0],
            }),
            &circle,
            &mut explanation,
        );
        assert!(!result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::NoTest);
        assert!(!explanation.overlapping);
        assert_eq!(
            explanation.status,
            Some(CollisionTestStatus::NonConvexPolygon)
        );
    }

    // Note: TS test "explains the silent false sentinel for area-less and unknown kinds"
    // tests Point and custom vendor kinds like 'acme.capsule'. In Rust, Point falls through
    // to the GJK fallback (which returns false since Point has no support function), and
    // custom vendor kinds cannot be constructed via the enum. Those tests are not directly
    // portable.
    #[test]
    fn point_shape_falls_through_to_support_test() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        let mut explanation = CollisionTestExplanation2D { kind: CollisionTestExplanationKind::NoTest, overlapping: false, shape_index: 0, status: None };
        let result = explain_collision_test2d(
            &CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
            &circle,
            &mut explanation,
        );
        // Point has no pair test and no support function, so GJK returns false
        assert!(!result);
        assert_eq!(explanation.kind, CollisionTestExplanationKind::SupportTest);
        assert!(!explanation.overlapping);
    }
}
