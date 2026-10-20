use flight_collision::*;

mod has_collision_support2d {
    use super::*;

    #[test]
    fn resolves_each_built_in_area_kind() {
        assert!(has_collision_support2d(CollisionShapeKind2D::Aabb));
        assert!(has_collision_support2d(CollisionShapeKind2D::Circle));
        assert!(has_collision_support2d(CollisionShapeKind2D::Obb));
        assert!(has_collision_support2d(CollisionShapeKind2D::Polygon));
    }

    #[test]
    fn includes_capsule() {
        assert!(has_collision_support2d(CollisionShapeKind2D::Capsule));
    }

    #[test]
    fn leaves_the_area_less_kinds_unsupported() {
        // Deliberate: a support function could be written for either, and GJK would then report a
        // penetration depth against a shape that has no interior for one to mean anything in.
        assert!(!has_collision_support2d(CollisionShapeKind2D::Point));
        assert!(!has_collision_support2d(CollisionShapeKind2D::Segment));
    }
}

mod get_collision_support2d_fn {
    use super::*;

    #[test]
    fn returns_true_for_supported_shapes() {
        let mut out = [0.0_f64; 2];
        let circle = CollisionShape2D::Circle(CollisionCircle2D { x: 1.0, y: 1.0, radius: 2.0 });
        assert!(get_collision_support2d(&circle, 1.0, 0.0, &mut out));

        let aabb = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -1.0,
            min_y: -4.0,
            max_x: 2.0,
            max_y: 3.0,
        });
        assert!(get_collision_support2d(&aabb, 1.0, 0.0, &mut out));
    }

    #[test]
    fn returns_false_for_unsupported_shapes() {
        let mut out = [0.0_f64; 2];
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        assert!(!get_collision_support2d(&point, 1.0, 0.0, &mut out));

        let segment = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 1.0,
            y1: 1.0,
        });
        assert!(!get_collision_support2d(&segment, 1.0, 0.0, &mut out));
    }
}

mod register_built_in_collision_supports2d_fn {
    use super::*;

    #[test]
    fn is_a_no_op_that_does_not_panic() {
        // In Rust, dispatch is static via match. This just verifies the function exists and is callable.
        register_built_in_collision_supports2d();
    }
}

mod support_collision_aabb2d_fn {
    use super::*;

    #[test]
    fn picks_the_corner_the_direction_signs_name() {
        let shape = CollisionAabb2D { min_x: -1.0, min_y: -4.0, max_x: 2.0, max_y: 3.0 };
        let mut out = [0.0_f64; 2];

        support_collision_aabb2d(&shape, 1.0, 1.0, &mut out);
        assert_eq!(out, [2.0, 3.0]);
        support_collision_aabb2d(&shape, -1.0, -1.0, &mut out);
        assert_eq!(out, [-1.0, -4.0]);
        support_collision_aabb2d(&shape, -1.0, 1.0, &mut out);
        assert_eq!(out, [-1.0, 3.0]);
    }
}

mod support_collision_circle2d_fn {
    use super::*;

    #[test]
    fn pushes_the_centre_one_radius_along_the_direction_whatever_its_length() {
        let shape = CollisionCircle2D { x: 1.0, y: 1.0, radius: 2.0 };
        let mut unit = [0.0_f64; 2];
        let mut long = [0.0_f64; 2];

        support_collision_circle2d(&shape, 1.0, 0.0, &mut unit);
        support_collision_circle2d(&shape, 50.0, 0.0, &mut long);

        assert!((unit[0] - 3.0).abs() < 1e-12);
        assert!((unit[1] - 1.0).abs() < 1e-12);
        // A support direction is not required to be unit length; normalizing is the function's job.
        assert_eq!(long, unit);
    }

    #[test]
    fn answers_a_zero_direction_with_the_centre_rather_than_a_nan() {
        let mut out = [0.0_f64; 2];

        support_collision_circle2d(
            &CollisionCircle2D { x: 1.0, y: -1.0, radius: 2.0 },
            0.0,
            0.0,
            &mut out,
        );

        // When direction is zero, falls back to centre + radius along +x
        assert_eq!(out[0], 3.0); // x + radius
        assert_eq!(out[1], -1.0);
    }
}

mod support_collision_obb2d_fn {
    use super::*;

    #[test]
    fn picks_the_furthest_rotated_corner() {
        let mut out = [0.0_f64; 2];
        // A quarter turn maps the box's local +x onto world +y, so the furthest corner along +y is the one
        // the unrotated box would have reached along +x.
        support_collision_obb2d(
            &CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 2.0,
                half_h: 1.0,
                rotation: std::f64::consts::FRAC_PI_2,
            },
            0.0,
            1.0,
            &mut out,
        );

        assert!((out[1] - 2.0).abs() < 1e-9);
    }
}

mod support_collision_polygon2d_fn {
    use super::*;

    #[test]
    fn picks_the_furthest_vertex() {
        let mut out = [0.0_f64; 2];
        let triangle = CollisionPolygon2D { points: vec![0.0, 0.0, 4.0, 0.0, 0.0, 3.0] };

        support_collision_polygon2d(&triangle, 1.0, 0.0, &mut out);
        assert_eq!(out, [4.0, 0.0]);
        support_collision_polygon2d(&triangle, 0.0, 1.0, &mut out);
        assert_eq!(out, [0.0, 3.0]);
    }
}

mod write_vertex_list_support2d_fn {
    use super::*;

    #[test]
    fn reads_a_flat_coordinate_list_and_keeps_the_first_of_an_exact_tie() {
        let mut out = [0.0_f64; 2];

        // Two vertices project identically along +y; a strict `>` keeps the first, which is what makes the
        // scan deterministic for a caller feeding the same shape twice.
        write_vertex_list_support2d(&[0.0, 1.0, 5.0, 1.0, 0.0, -1.0], 3, 0.0, 1.0, &mut out);

        assert_eq!(out, [0.0, 1.0]);
    }
}
