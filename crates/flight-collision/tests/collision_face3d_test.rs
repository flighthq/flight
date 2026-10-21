use flight_collision::contract::*;
use flight_collision::*;
use std::sync::Arc;

/// Every vertex of a face must share one coordinate along the face's axis.
fn expect_coplanar_along(vertices: &[f32], count: usize, axis: usize, value: f32) {
    for i in 0..count {
        assert!(
            (vertices[i * 3 + axis] - value).abs() < 1e-9,
            "vertex {} axis {} expected {} got {}",
            i,
            axis,
            value,
            vertices[i * 3 + axis]
        );
    }
}

fn sphere() -> CollisionShape3D {
    return CollisionShape3D::Sphere(CollisionSphere3D {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        radius: 1.0,
    });
}

mod get_collision_face_query3d {
    use super::*;

    #[test]
    fn starts_empty_and_looks_up_custom_kinds_exactly() {
        let mut registry = crate::collision_registry3d();
        assert!(get_collision_face_query3d(&registry, "sphere").is_none());
        assert!(get_collision_face_query3d(&registry, "acme.blob").is_none());

        registry.face_queries.insert(
            "acme.blob".to_string(),
            Arc::new(|_, _, _, _, out| {
                out.clear();
                out.extend_from_slice(&[1.0, 2.0, 3.0]);
                return 1;
            }),
        );

        let mut out = Vec::new();
        let query = get_collision_face_query3d(&registry, "acme.blob").unwrap();
        assert_eq!(query(&sphere(), 0.0, 1.0, 0.0, &mut out), 1);
        assert_eq!(out, vec![1.0, 2.0, 3.0]);
        assert!(get_collision_face_query3d(&registry, "acme.blob.extra").is_none());
    }
}

mod query_collision_aabb_face3d {
    use super::*;

    #[test]
    fn accepts_the_shape_union_and_returns_the_selected_face() {
        let shape = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        });
        let mut out = Vec::new();
        assert_eq!(
            query_collision_aabb_face3d(&shape, 0.0, 1.0, 0.0, &mut out),
            4
        );
        expect_coplanar_along(&out, 4, 1, 2.0);
    }

    #[test]
    fn preserves_the_source_corner_order_on_the_negative_face() {
        let shape = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        });
        let mut out = Vec::new();

        query_collision_aabb_face3d(&shape, 0.0, -1.0, 0.0, &mut out);

        assert_eq!(
            out,
            vec![
                -1.0, -2.0, -3.0, -1.0, -2.0, 3.0, 1.0, -2.0, 3.0, 1.0, -2.0, -3.0,
            ]
        );
    }
}

mod query_collision_box_face3d {
    use super::*;

    #[test]
    fn accepts_the_shape_union_and_returns_the_selected_face() {
        let shape = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 2.0,
            half_z: 3.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        });
        let mut out = Vec::new();
        assert_eq!(
            query_collision_box_face3d(&shape, 0.0, 1.0, 0.0, &mut out),
            4
        );
        expect_coplanar_along(&out, 4, 1, 2.0);
    }

    #[test]
    fn preserves_the_source_corner_order_on_the_negative_face() {
        let shape = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 2.0,
            half_z: 3.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        });
        let mut out = Vec::new();

        query_collision_box_face3d(&shape, 0.0, -1.0, 0.0, &mut out);

        assert_eq!(
            out,
            vec![
                -1.0, -2.0, -3.0, -1.0, -2.0, 3.0, 1.0, -2.0, 3.0, 1.0, -2.0, -3.0,
            ]
        );
    }
}

mod query_collision_capsule_face3d {
    use super::*;

    #[test]
    fn capsule_declines_curved_caps_degenerate_axes_and_zero_directions() {
        let lying = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let degenerate = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 0.0,
            radius: 1.0,
        });
        let mut out = Vec::new();

        assert_eq!(
            query_collision_capsule_face3d(&lying, 1.0, 0.0, 0.0, &mut out),
            0
        );
        assert_eq!(
            query_collision_capsule_face3d(&degenerate, 0.0, 1.0, 0.0, &mut out),
            0
        );
        assert_eq!(
            query_collision_capsule_face3d(&lying, 0.0, 0.0, 0.0, &mut out),
            0
        );
        assert!(out.is_empty());
    }

    #[test]
    fn capsule_normalizes_the_direction_before_offsetting_its_edge() {
        let lying = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let mut out = Vec::new();

        assert_eq!(
            query_collision_capsule_face3d(&lying, 0.0, -4.0, 0.0, &mut out),
            2
        );
        assert_eq!(out, vec![-2.0, -0.5, 0.0, 2.0, -0.5, 0.0]);
    }
}

mod query_collision_convex_face3d {
    use super::*;

    #[test]
    fn convex_declines_a_zero_direction() {
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![-1.0, -1.0, -1.0, 1.0, 1.0, 1.0],
        });
        let mut out = vec![9.0];
        assert_eq!(
            query_collision_convex_face3d(&cube, 0.0, 0.0, 0.0, &mut out),
            0
        );
        assert!(out.is_empty());
    }
}

mod register_built_in_collision_face_queries3d {
    use super::*;

    #[test]
    fn registers_exactly_the_four_source_built_ins() {
        let mut registry = crate::collision_registry3d();
        register_built_in_collision_face_queries3d(&mut registry);

        assert_eq!(registry.face_queries.len(), 4);
        for kind in ["aabb", "box", "capsule", "convex"] {
            assert!(
                get_collision_face_query3d(&registry, kind).is_some(),
                "{kind}"
            );
        }
        for kind in ["sphere", "cylinder", "cone"] {
            assert!(
                get_collision_face_query3d(&registry, kind).is_none(),
                "{kind}"
            );
        }
    }
}

mod register_collision_face_query3d {
    use super::*;

    #[test]
    fn supports_custom_kinds_and_last_write_wins() {
        let mut registry = crate::collision_registry3d();
        register_collision_face_query3d(&mut registry, "custom", Arc::new(|_, _, _, _, _| 1));
        register_collision_face_query3d(&mut registry, "custom", Arc::new(|_, _, _, _, _| 2));

        let mut out = Vec::new();
        assert_eq!(
            get_collision_face_query3d(&registry, "custom").unwrap()(
                &sphere(),
                0.0,
                1.0,
                0.0,
                &mut out,
            ),
            2,
        );
    }
}
