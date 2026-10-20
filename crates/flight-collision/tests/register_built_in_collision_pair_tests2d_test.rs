use flight_collision::*;

fn circle() -> CollisionShape2D {
    CollisionShape2D::Circle(CollisionCircle2D {
        x: 0.0,
        y: 0.0,
        radius: 1.0,
    })
}
fn aabb() -> CollisionShape2D {
    CollisionShape2D::Aabb(CollisionAabb2D {
        min_x: -1.0,
        min_y: -1.0,
        max_x: 1.0,
        max_y: 1.0,
    })
}
fn obb() -> CollisionShape2D {
    CollisionShape2D::Obb(CollisionObb2D {
        x: 0.0,
        y: 0.0,
        half_w: 1.0,
        half_h: 1.0,
        rotation: 0.0,
    })
}
fn polygon() -> CollisionShape2D {
    CollisionShape2D::Polygon(CollisionPolygon2D {
        points: vec![0.0, 0.0, 2.0, 0.0, 1.0, 2.0],
    })
}
fn segment() -> CollisionShape2D {
    CollisionShape2D::Segment(CollisionSegment2D {
        x0: 0.0,
        y0: 0.0,
        x1: 1.0,
        y1: 0.0,
    })
}
fn point() -> CollisionShape2D {
    CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 })
}

fn has_pair_test(a: &CollisionShape2D, b: &CollisionShape2D) -> bool {
    let mut manifold = create_collision_manifold2d();
    get_collision_pair_test2d(a, b, &mut manifold).is_some()
}

mod register_built_in_collision_pair_tests2d {
    use super::*;

    #[test]
    fn registers_exactly_the_ten_canonical_orders_and_not_their_reverses() {
        register_built_in_collision_pair_tests2d();

        let shapes: Vec<(&str, CollisionShape2D)> = vec![
            ("circle", circle()),
            ("aabb", aabb()),
            ("obb", obb()),
            ("polygon", polygon()),
        ];

        let mut registered = Vec::new();
        for (name_a, shape_a) in &shapes {
            for (name_b, shape_b) in &shapes {
                if has_pair_test(shape_a, shape_b) {
                    registered.push(format!("{}-{}", name_a, name_b));
                }
            }
        }

        // Ten, not sixteen: the four self-pairs plus one order of each of the six mixed pairs.
        assert_eq!(
            registered,
            vec![
                "circle-circle",
                "circle-aabb",
                "circle-obb",
                "circle-polygon",
                "aabb-aabb",
                "aabb-obb",
                "aabb-polygon",
                "obb-obb",
                "obb-polygon",
                "polygon-polygon",
            ]
        );
    }

    #[test]
    fn leaves_the_area_less_kinds_out_of_the_table_entirely() {
        register_built_in_collision_pair_tests2d();

        for kind_shape in [segment(), point()] {
            assert!(!has_pair_test(&circle(), &kind_shape));
            assert!(!has_pair_test(&kind_shape, &circle()));
        }
    }

    #[test]
    fn routes_each_entry_to_the_direct_typed_test_it_specializes() {
        register_built_in_collision_pair_tests2d();

        let mut through_registry = create_collision_manifold2d();
        let mut direct = create_collision_manifold2d();

        let circle_shape = CollisionShape2D::Circle(CollisionCircle2D {
            x: 15.0,
            y: 5.0,
            radius: 7.0,
        });
        let box_shape = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        });

        let result = get_collision_pair_test2d(&circle_shape, &box_shape, &mut through_registry);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), true);

        let direct_result = test_circle_aabb_collision2d(
            &CollisionCircle2D {
                x: 15.0,
                y: 5.0,
                radius: 7.0,
            },
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 10.0,
                max_y: 10.0,
            },
            &mut direct,
        );
        assert_eq!(direct_result, true);

        assert_eq!(through_registry.depth, direct.depth);
        assert_eq!(through_registry.normal_x, direct.normal_x);
        assert_eq!(through_registry.normal_y, direct.normal_y);
        assert_eq!(through_registry.overlapping, direct.overlapping);
    }
}
