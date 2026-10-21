use flight_collision::contract::*;
use flight_collision::*;

mod get_collision_polygon_validation_status2d {
    use super::*;

    #[test]
    fn distinguishes_valid_degenerate_and_non_convex_polygons() {
        // Valid convex square
        assert!(
            get_collision_polygon_validation_status2d(&vec![
                0.0, 0.0, 2.0, 0.0, 2.0, 2.0, 0.0, 2.0
            ])
            .is_none()
        );
        // Too few vertices (only 2 points)
        assert_eq!(
            get_collision_polygon_validation_status2d(&vec![0.0, 0.0, 1.0, 1.0]),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_polygon_validation_status2d(&vec![0.0, 0.0, 1.0, 0.0, 2.0, 0.0]),
            Some(CollisionTestStatus::DegenerateShape)
        );
        // Non-convex polygon (concave notch)
        assert_eq!(
            get_collision_polygon_validation_status2d(&vec![
                0.0, 0.0, 2.0, 0.0, 1.0, 1.0, 2.0, 2.0, 0.0, 2.0
            ]),
            Some(CollisionTestStatus::NonConvexPolygon)
        );
    }
}

mod get_collision_shape_validation_status2d {
    use super::*;

    #[test]
    fn accepts_a_zero_length_capsule_which_is_a_circle_and_rejects_a_zero_radius_one_which_is_not()
    {
        // The asymmetry is the design: collapsing the axis leaves a usable shape, collapsing the radius
        // leaves a bare segment, and a segment is a different collider with different rules.
        assert!(
            get_collision_shape_validation_status2d(&CollisionShape2D::Capsule(
                CollisionCapsule2D {
                    x0: 1.0,
                    y0: 1.0,
                    x1: 1.0,
                    y1: 1.0,
                    radius: 0.5,
                }
            ))
            .is_none()
        );
        assert_eq!(
            get_collision_shape_validation_status2d(&CollisionShape2D::Capsule(
                CollisionCapsule2D {
                    x0: 0.0,
                    y0: 0.0,
                    x1: 3.0,
                    y1: 0.0,
                    radius: 0.0,
                }
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_shape_validation_status2d(&CollisionShape2D::Capsule(
                CollisionCapsule2D {
                    x0: 0.0,
                    y0: 0.0,
                    x1: 3.0,
                    y1: 0.0,
                    radius: -1.0,
                }
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn rejects_a_capsule_with_a_non_finite_endpoint_or_radius() {
        assert_eq!(
            get_collision_shape_validation_status2d(&CollisionShape2D::Capsule(
                CollisionCapsule2D {
                    x0: f32::NAN,
                    y0: 0.0,
                    x1: 3.0,
                    y1: 0.0,
                    radius: 1.0,
                }
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_shape_validation_status2d(&CollisionShape2D::Capsule(
                CollisionCapsule2D {
                    x0: 0.0,
                    y0: 0.0,
                    x1: 3.0,
                    y1: 0.0,
                    radius: f32::INFINITY,
                }
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn rejects_every_degenerate_manifold_shape() {
        let shapes: Vec<CollisionShape2D> = vec![
            CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 0.0,
            }),
            CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: 1.0,
                min_y: 0.0,
                max_x: 1.0,
                max_y: 2.0,
            }),
            CollisionShape2D::Obb(CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 1.0,
                half_h: 0.0,
                rotation: 0.0,
            }),
            CollisionShape2D::Polygon(CollisionPolygon2D {
                points: vec![0.0, 0.0, 1.0, 1.0],
            }),
            CollisionShape2D::Segment(CollisionSegment2D {
                x0: 1.0,
                y0: 1.0,
                x1: 1.0,
                y1: 1.0,
            }),
        ];
        for shape in &shapes {
            assert_eq!(
                get_collision_shape_validation_status2d(shape),
                Some(CollisionTestStatus::DegenerateShape),
                "expected degenerate for {:?}",
                shape
            );
        }
    }

    #[test]
    fn reports_area_less_kinds_as_unsupported() {
        assert_eq!(
            get_collision_shape_validation_status2d(&CollisionShape2D::Point(CollisionPoint2D {
                x: 0.0,
                y: 0.0
            })),
            Some(CollisionTestStatus::UnsupportedShapeKind)
        );
        assert_eq!(
            get_collision_shape_validation_status2d(&CollisionShape2D::Segment(
                CollisionSegment2D {
                    x0: 0.0,
                    y0: 0.0,
                    x1: 1.0,
                    y1: 1.0,
                }
            )),
            Some(CollisionTestStatus::UnsupportedShapeKind)
        );
    }
}
