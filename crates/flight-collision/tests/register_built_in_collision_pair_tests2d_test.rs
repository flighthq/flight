use flight_collision::contract::*;
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
fn has_pair_test(registry: &CollisionRegistry2D, kind_a: &str, kind_b: &str) -> bool {
    return get_collision_pair_test2d(registry, kind_a, kind_b).is_some();
}

mod register_built_in_collision_pair_tests2d {
    use super::*;

    #[test]
    fn registers_exactly_the_ten_canonical_orders_and_not_their_reverses() {
        let mut registry = crate::collision_registry2d();
        register_built_in_collision_pair_tests2d(&mut registry);

        let shapes: Vec<(&str, CollisionShape2D)> = vec![
            ("circle", circle()),
            ("aabb", aabb()),
            ("obb", obb()),
            ("polygon", polygon()),
        ];

        let mut registered = Vec::new();
        for (name_a, _shape_a) in &shapes {
            for (name_b, _shape_b) in &shapes {
                if has_pair_test(&registry, name_a, name_b) {
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
        assert_eq!(registry.pair_tests.len(), 10);
    }

    #[test]
    fn leaves_the_area_less_kinds_out_of_the_table_entirely() {
        let mut registry = crate::collision_registry2d();
        register_built_in_collision_pair_tests2d(&mut registry);

        for kind in ["segment", "point"] {
            assert!(!has_pair_test(&registry, "circle", kind));
            assert!(!has_pair_test(&registry, kind, "circle"));
        }
    }

    #[test]
    fn routes_each_entry_to_the_direct_typed_test_it_specializes() {
        let mut registry = crate::collision_registry2d();
        register_built_in_collision_pair_tests2d(&mut registry);

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

        let result = get_collision_pair_test2d(&registry, "circle", "aabb").unwrap()(
            &circle_shape,
            &box_shape,
            &mut through_registry,
        );
        assert!(result);

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
