use flight_collision::contract::*;
use std::sync::Arc;

mod get_collision_pair_test2d {
    use super::*;

    #[test]
    fn keeps_ordered_and_prefix_related_kind_pairs_distinct() {
        let mut registry = crate::collision_registry2d();
        let first: CollisionPairTest2D = Arc::new(|_, _, out| {
            out.depth = 1.0;
            true
        });
        let second: CollisionPairTest2D = Arc::new(|_, _, out| {
            out.depth = 2.0;
            true
        });
        register_collision_pair_test2d(&mut registry, "ab", "c", first);
        register_collision_pair_test2d(&mut registry, "a", "bc", second);

        assert!(get_collision_pair_test2d(&registry, "c", "ab").is_none());
        let shape = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        });
        let mut out = create_collision_manifold2d();
        get_collision_pair_test2d(&registry, "ab", "c").unwrap()(&shape, &shape, &mut out);
        assert_eq!(out.depth, 1.0);
        get_collision_pair_test2d(&registry, "a", "bc").unwrap()(&shape, &shape, &mut out);
        assert_eq!(out.depth, 2.0);
    }
}

mod get_collision_support2d {
    use super::*;

    #[test]
    fn returns_the_registered_callback_and_none_for_an_unregistered_kind() {
        let mut registry = crate::collision_registry2d();
        register_built_in_collision_supports2d(&mut registry);
        let support = get_collision_support2d(&registry, "circle").unwrap();
        let mut out = [0.0_f32; 2];
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 1.0,
            y: 1.0,
            radius: 2.0,
        });
        support(&circle, 1.0, 0.0, &mut out);
        assert_eq!(out, [3.0, 1.0]);
        assert!(get_collision_support2d(&registry, "acme.unknown").is_none());
    }
}

mod has_collision_support2d {
    use super::*;

    #[test]
    fn reports_only_entries_in_the_caller_owned_registry() {
        let mut registry = crate::collision_registry2d();
        assert!(!has_collision_support2d(&registry, "circle"));
        register_built_in_collision_supports2d(&mut registry);
        assert!(has_collision_support2d(&registry, "circle"));
        assert!(!has_collision_support2d(&registry, "capsule"));
    }
}

mod register_built_in_collision_supports2d {
    use super::*;

    #[test]
    fn registers_exactly_the_four_source_built_ins() {
        let mut registry = crate::collision_registry2d();
        register_built_in_collision_supports2d(&mut registry);
        assert_eq!(registry.supports.len(), 4);
        assert!(has_collision_support2d(&registry, "aabb"));
        assert!(has_collision_support2d(&registry, "circle"));
        assert!(has_collision_support2d(&registry, "obb"));
        assert!(has_collision_support2d(&registry, "polygon"));
        assert!(!has_collision_support2d(&registry, "capsule"));
        assert!(!has_collision_support2d(&registry, "point"));
        assert!(!has_collision_support2d(&registry, "segment"));
    }
}

mod register_collision_pair_test2d {
    use super::*;

    #[test]
    fn uses_custom_kinds_and_last_write_wins() {
        let mut registry = crate::collision_registry2d();
        register_collision_pair_test2d(
            &mut registry,
            "acme.left",
            "acme.right",
            Arc::new(|_, _, _| false),
        );
        register_collision_pair_test2d(
            &mut registry,
            "acme.left",
            "acme.right",
            Arc::new(|_, _, _| true),
        );
        let shape = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        let mut out = create_collision_manifold2d();
        assert!(get_collision_pair_test2d(
            &registry,
            "acme.left",
            "acme.right"
        )
        .unwrap()(&shape, &shape, &mut out,));
        assert_eq!(registry.pair_tests.len(), 1);
    }
}

mod register_collision_support2d {
    use super::*;

    #[test]
    fn invokes_the_last_callback_registered_for_a_custom_kind() {
        let mut registry = crate::collision_registry2d();
        register_collision_support2d(
            &mut registry,
            "acme.shape",
            Arc::new(|_, _, _, out| out[0] = 1.0),
        );
        register_collision_support2d(
            &mut registry,
            "acme.shape",
            Arc::new(|_, _, _, out| out[0] = 2.0),
        );
        let shape = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        let mut out = [0.0_f32; 2];
        get_collision_support2d(&registry, "acme.shape").unwrap()(&shape, 0.0, 0.0, &mut out);
        assert_eq!(out[0], 2.0);
        assert_eq!(registry.supports.len(), 1);
    }
}

mod support_collision_aabb2d {
    use super::*;

    #[test]
    fn picks_the_corner_the_direction_signs_name() {
        let shape = CollisionAabb2D {
            min_x: -1.0,
            min_y: -4.0,
            max_x: 2.0,
            max_y: 3.0,
        };
        let mut out = [0.0_f32; 2];

        support_collision_aabb2d(&shape, 1.0, 1.0, &mut out);
        assert_eq!(out, [2.0, 3.0]);
        support_collision_aabb2d(&shape, -1.0, -1.0, &mut out);
        assert_eq!(out, [-1.0, -4.0]);
        support_collision_aabb2d(&shape, -1.0, 1.0, &mut out);
        assert_eq!(out, [-1.0, 3.0]);
    }
}

mod support_collision_circle2d {
    use super::*;

    #[test]
    fn pushes_the_centre_one_radius_along_the_direction_whatever_its_length() {
        let shape = CollisionCircle2D {
            x: 1.0,
            y: 1.0,
            radius: 2.0,
        };
        let mut unit = [0.0_f32; 2];
        let mut long = [0.0_f32; 2];

        support_collision_circle2d(&shape, 1.0, 0.0, &mut unit);
        support_collision_circle2d(&shape, 50.0, 0.0, &mut long);

        assert!((unit[0] - 3.0).abs() < 1e-12);
        assert!((unit[1] - 1.0).abs() < 1e-12);
        // A support direction is not required to be unit length; normalizing is the function's job.
        assert_eq!(long, unit);
    }

    #[test]
    fn answers_a_zero_direction_with_the_centre_rather_than_a_nan() {
        let mut out = [0.0_f32; 2];

        support_collision_circle2d(
            &CollisionCircle2D {
                x: 1.0,
                y: -1.0,
                radius: 2.0,
            },
            0.0,
            0.0,
            &mut out,
        );

        // When direction is zero, falls back to centre + radius along +x
        assert_eq!(out[0], 3.0); // x + radius
        assert_eq!(out[1], -1.0);
    }
}

mod support_collision_obb2d {
    use super::*;

    #[test]
    fn picks_the_furthest_rotated_corner() {
        let mut out = [0.0_f32; 2];
        // A quarter turn maps the box's local +x onto world +y, so the furthest corner along +y is the one
        // the unrotated box would have reached along +x.
        support_collision_obb2d(
            &CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 2.0,
                half_h: 1.0,
                rotation: std::f32::consts::FRAC_PI_2,
            },
            0.0,
            1.0,
            &mut out,
        );

        assert!((out[1] - 2.0).abs() < 1e-9);
    }
}

mod support_collision_polygon2d {
    use super::*;

    #[test]
    fn picks_the_furthest_vertex() {
        let mut out = [0.0_f32; 2];
        let triangle = CollisionPolygon2D {
            points: vec![0.0, 0.0, 4.0, 0.0, 0.0, 3.0],
        };

        support_collision_polygon2d(&triangle, 1.0, 0.0, &mut out);
        assert_eq!(out, [4.0, 0.0]);
        support_collision_polygon2d(&triangle, 0.0, 1.0, &mut out);
        assert_eq!(out, [0.0, 3.0]);
    }
}

mod write_vertex_list_support2d {
    use super::*;

    #[test]
    fn reads_a_flat_coordinate_list_and_keeps_the_first_of_an_exact_tie() {
        let mut out = [0.0_f32; 2];

        // Two vertices project identically along +y; a strict `>` keeps the first, which is what makes the
        // scan deterministic for a caller feeding the same shape twice.
        write_vertex_list_support2d(&[0.0, 1.0, 5.0, 1.0, 0.0, -1.0], 3, 0.0, 1.0, &mut out);

        assert_eq!(out, [0.0, 1.0]);
    }
}
