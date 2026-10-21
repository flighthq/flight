use flight_collision::contract::*;
use flight_collision::*;

mod explain_collision_test2d {
    use super::*;

    #[test]
    fn distinguishes_overlap_from_ordinary_separation() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        // Overlapping
        let explanation = explain_collision_test2d(
            &crate::collision_registry2d_with_built_ins(),
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 1.0,
                y: 0.0,
                radius: 2.0,
            }),
        );
        assert_eq!(explanation.kind, None);
        assert!(explanation.overlapping);
        assert_eq!(explanation.shape_index, None);
        assert_eq!(explanation.status, CollisionTestStatus::Overlapping);

        // Separated
        let explanation = explain_collision_test2d(
            &crate::collision_registry2d_with_built_ins(),
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 10.0,
                y: 0.0,
                radius: 2.0,
            }),
        );
        assert_eq!(explanation.kind, None);
        assert!(!explanation.overlapping);
        assert_eq!(explanation.shape_index, None);
        assert_eq!(explanation.status, CollisionTestStatus::Separated);
    }

    #[test]
    fn identifies_degenerate_shape() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        // Second shape is degenerate (zero radius)
        let explanation = explain_collision_test2d(
            &crate::collision_registry2d_with_built_ins(),
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 0.0,
            }),
        );
        assert_eq!(explanation.kind, Some(CollisionShapeKind2D::Circle));
        assert!(!explanation.overlapping);
        assert_eq!(explanation.shape_index, Some(1));
        assert_eq!(explanation.status, CollisionTestStatus::DegenerateShape);
    }

    #[test]
    fn identifies_non_convex_polygon() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        // First shape is non-convex polygon
        let explanation = explain_collision_test2d(
            &crate::collision_registry2d_with_built_ins(),
            &CollisionShape2D::Polygon(CollisionPolygon2D {
                points: vec![0.0, 0.0, 2.0, 0.0, 1.0, 1.0, 2.0, 2.0, 0.0, 2.0],
            }),
            &circle,
        );
        assert_eq!(explanation.kind, Some(CollisionShapeKind2D::Polygon));
        assert!(!explanation.overlapping);
        assert_eq!(explanation.shape_index, Some(0));
        assert_eq!(explanation.status, CollisionTestStatus::NonConvexPolygon);
    }

    #[test]
    fn point_shape_falls_through_to_support_test() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });

        let explanation = explain_collision_test2d(
            &crate::collision_registry2d_with_built_ins(),
            &CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
            &circle,
        );
        assert_eq!(explanation.kind, Some(CollisionShapeKind2D::Point));
        assert!(!explanation.overlapping);
        assert_eq!(explanation.shape_index, Some(0));
        assert_eq!(
            explanation.status,
            CollisionTestStatus::UnsupportedShapeKind
        );
    }
}
