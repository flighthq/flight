//! Rust convenience methods for the public collision lane (D18).

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    fn aabb2() -> CollisionAabb2D {
        return CollisionAabb2D {
            min_x: -1.0,
            min_y: -1.0,
            max_x: 1.0,
            max_y: 1.0,
        };
    }

    fn aabb3() -> CollisionAabb3D {
        return CollisionAabb3D {
            min_x: -1.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        };
    }

    fn box3() -> CollisionBox3D {
        return CollisionBox3D {
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_w: 1.0,
            ..CollisionBox3D::default()
        };
    }

    fn capsule2() -> CollisionCapsule2D {
        return CollisionCapsule2D {
            x0: -0.5,
            y0: 0.0,
            x1: 0.5,
            y1: 0.0,
            radius: 0.75,
        };
    }

    fn capsule3() -> CollisionCapsule3D {
        return CollisionCapsule3D {
            x0: -0.5,
            y0: 0.0,
            z0: 0.0,
            x1: 0.5,
            y1: 0.0,
            z1: 0.0,
            radius: 0.75,
        };
    }

    fn circle2() -> CollisionCircle2D {
        return CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        };
    }

    fn cone3() -> CollisionCone3D {
        return CollisionCone3D {
            x0: 0.0,
            y0: -1.0,
            z0: 0.0,
            x1: 0.0,
            y1: 1.0,
            z1: 0.0,
            radius: 1.0,
        };
    }

    fn convex3() -> CollisionConvex3D {
        return CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 0.0, 1.0, -1.0, 0.0, 0.0, 1.0,
            ],
        };
    }

    fn cylinder3() -> CollisionCylinder3D {
        return CollisionCylinder3D {
            x0: 0.0,
            y0: -1.0,
            z0: 0.0,
            x1: 0.0,
            y1: 1.0,
            z1: 0.0,
            radius: 1.0,
        };
    }

    fn heightfield3() -> CollisionHeightfield3D {
        return create_collision_heightfield3d(2, 2, vec![0.0; 4], 1.0, 1.0);
    }

    fn mesh3() -> CollisionTriangleMesh3D {
        return create_collision_triangle_mesh3d(
            vec![-1.0, 0.0, -1.0, 1.0, 0.0, -1.0, 0.0, 0.0, 1.0],
            vec![0, 1, 2],
        );
    }

    fn obb2() -> CollisionObb2D {
        return CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.0,
        };
    }

    fn polygon2() -> CollisionPolygon2D {
        return CollisionPolygon2D {
            points: vec![-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0],
        };
    }

    fn registry2() -> CollisionRegistry2D {
        let mut registry = CollisionRegistry2D::default();
        register_built_in_collision_supports2d(&mut registry);
        register_built_in_collision_pair_tests2d(&mut registry);
        return registry;
    }

    fn registry3() -> CollisionRegistry3D {
        let mut registry = CollisionRegistry3D::default();
        register_built_in_collision_supports3d(&mut registry);
        register_built_in_collision_pair_tests3d(&mut registry);
        register_built_in_collision_face_queries3d(&mut registry);
        return registry;
    }

    fn segment2() -> CollisionSegment2D {
        return CollisionSegment2D {
            x0: -2.0,
            y0: 0.0,
            x1: 2.0,
            y1: 0.0,
        };
    }

    fn sphere3() -> CollisionSphere3D {
        return CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        };
    }

    macro_rules! contact2_test {
        ($name:ident, $receiver:expr, $other:expr, $method:ident, $free:path) => {
            #[test]
            fn $name() {
                let receiver = $receiver;
                let other = $other;
                let mut actual = CollisionContactManifold2D::default();
                let mut expected = CollisionContactManifold2D::default();
                let method_result = receiver.$method(&other, &mut actual);
                let free_result = $free(&receiver, &other, &mut expected);
                assert_eq!((method_result, actual), (free_result, expected));
            }
        };
    }

    macro_rules! manifold2_test {
        ($name:ident, $receiver:expr, $other:expr, $method:ident, $free:path) => {
            #[test]
            fn $name() {
                let receiver = $receiver;
                let other = $other;
                let mut actual = CollisionManifold2D::default();
                let mut expected = CollisionManifold2D::default();
                let method_result = receiver.$method(&other, &mut actual);
                let free_result = $free(&receiver, &other, &mut expected);
                assert_eq!((method_result, actual), (free_result, expected));
            }
        };
    }

    macro_rules! manifold3_test {
        ($name:ident, $receiver:expr, $other:expr, $method:ident, $free:path) => {
            #[test]
            fn $name() {
                let receiver = $receiver;
                let other = $other;
                let mut actual = CollisionManifold3D::default();
                let mut expected = CollisionManifold3D::default();
                let method_result = receiver.$method(&other, &mut actual);
                let free_result = $free(&receiver, &other, &mut expected);
                assert_eq!((method_result, actual), (free_result, expected));
            }
        };
    }

    macro_rules! segment2_test {
        ($name:ident, $other:expr, $method:ident, $free:path) => {
            #[test]
            fn $name() {
                let receiver = segment2();
                let other = $other;
                let method_result = receiver.$method(&other);
                let free_result = $free(&receiver, &other);
                assert_eq!(method_result, free_result);
            }
        };
    }

    macro_rules! support2_test {
        ($name:ident, $receiver:expr, $free:path) => {
            #[test]
            fn $name() {
                let receiver = $receiver;
                let mut actual = [0.0; 2];
                let mut expected = [0.0; 2];
                receiver.support(1.0, 0.5, &mut actual);
                $free(&receiver, 1.0, 0.5, &mut expected);
                assert_eq!(actual, expected);
            }
        };
    }

    macro_rules! support3_test {
        ($name:ident, $receiver:expr, $free:path) => {
            #[test]
            fn $name() {
                let receiver = $receiver;
                let mut actual = [0.0; 3];
                let mut expected = [0.0; 3];
                receiver.support(1.0, 0.5, -0.25, &mut actual);
                $free(&receiver, 1.0, 0.5, -0.25, &mut expected);
                assert_eq!(actual, expected);
            }
        };
    }

    contact2_test!(
        aabb2_collide_aabb_contact_delegates,
        aabb2(),
        aabb2(),
        collide_aabb_contact,
        collide_aabb_aabb_contact_manifold2d
    );
    contact2_test!(
        aabb2_collide_obb_contact_delegates,
        aabb2(),
        obb2(),
        collide_obb_contact,
        collide_aabb_obb_contact_manifold2d
    );
    contact2_test!(
        aabb2_collide_polygon_contact_delegates,
        aabb2(),
        polygon2(),
        collide_polygon_contact,
        collide_aabb_polygon_contact_manifold2d
    );
    contact2_test!(
        capsule2_collide_aabb_contact_delegates,
        capsule2(),
        aabb2(),
        collide_aabb_contact,
        collide_capsule_aabb_contact_manifold2d
    );
    contact2_test!(
        capsule2_collide_capsule_contact_delegates,
        capsule2(),
        capsule2(),
        collide_capsule_contact,
        collide_capsule_capsule_contact_manifold2d
    );
    contact2_test!(
        capsule2_collide_obb_contact_delegates,
        capsule2(),
        obb2(),
        collide_obb_contact,
        collide_capsule_obb_contact_manifold2d
    );
    contact2_test!(
        capsule2_collide_polygon_contact_delegates,
        capsule2(),
        polygon2(),
        collide_polygon_contact,
        collide_capsule_polygon_contact_manifold2d
    );
    contact2_test!(
        circle2_collide_aabb_contact_delegates,
        circle2(),
        aabb2(),
        collide_aabb_contact,
        collide_circle_aabb_contact_manifold2d
    );
    contact2_test!(
        circle2_collide_capsule_contact_delegates,
        circle2(),
        capsule2(),
        collide_capsule_contact,
        collide_circle_capsule_contact_manifold2d
    );
    contact2_test!(
        circle2_collide_circle_contact_delegates,
        circle2(),
        circle2(),
        collide_circle_contact,
        collide_circle_circle_contact_manifold2d
    );
    contact2_test!(
        circle2_collide_obb_contact_delegates,
        circle2(),
        obb2(),
        collide_obb_contact,
        collide_circle_obb_contact_manifold2d
    );
    contact2_test!(
        circle2_collide_polygon_contact_delegates,
        circle2(),
        polygon2(),
        collide_polygon_contact,
        collide_circle_polygon_contact_manifold2d
    );
    contact2_test!(
        obb2_collide_obb_contact_delegates,
        obb2(),
        obb2(),
        collide_obb_contact,
        collide_obb_obb_contact_manifold2d
    );
    contact2_test!(
        obb2_collide_polygon_contact_delegates,
        obb2(),
        polygon2(),
        collide_polygon_contact,
        collide_obb_polygon_contact_manifold2d
    );
    contact2_test!(
        polygon2_collide_polygon_contact_delegates,
        polygon2(),
        polygon2(),
        collide_polygon_contact,
        collide_polygon_polygon_contact_manifold2d
    );

    manifold2_test!(
        aabb2_test_aabb_delegates,
        aabb2(),
        aabb2(),
        test_aabb,
        test_aabb_aabb_collision2d
    );
    manifold2_test!(
        aabb2_test_obb_delegates,
        aabb2(),
        obb2(),
        test_obb,
        test_aabb_obb_collision2d
    );
    manifold2_test!(
        aabb2_test_polygon_delegates,
        aabb2(),
        polygon2(),
        test_polygon,
        test_aabb_polygon_collision2d
    );
    manifold2_test!(
        circle2_test_aabb_delegates,
        circle2(),
        aabb2(),
        test_aabb,
        test_circle_aabb_collision2d
    );
    manifold2_test!(
        circle2_test_circle_delegates,
        circle2(),
        circle2(),
        test_circle,
        test_circle_circle_collision2d
    );
    manifold2_test!(
        circle2_test_obb_delegates,
        circle2(),
        obb2(),
        test_obb,
        test_circle_obb_collision2d
    );
    manifold2_test!(
        circle2_test_polygon_delegates,
        circle2(),
        polygon2(),
        test_polygon,
        test_circle_polygon_collision2d
    );
    manifold2_test!(
        obb2_test_obb_delegates,
        obb2(),
        obb2(),
        test_obb,
        test_obb_obb_collision2d
    );
    manifold2_test!(
        obb2_test_polygon_delegates,
        obb2(),
        polygon2(),
        test_polygon,
        test_obb_polygon_collision2d
    );
    manifold2_test!(
        polygon2_test_polygon_delegates,
        polygon2(),
        polygon2(),
        test_polygon,
        test_polygon_polygon_collision2d
    );

    manifold3_test!(
        aabb3_test_aabb_delegates,
        aabb3(),
        aabb3(),
        test_aabb,
        test_aabb_aabb_collision3d
    );
    manifold3_test!(
        box3_test_box_delegates,
        box3(),
        box3(),
        test_box,
        test_box_box_collision3d
    );
    manifold3_test!(
        capsule3_test_capsule_delegates,
        capsule3(),
        capsule3(),
        test_capsule,
        test_capsule_capsule_collision3d
    );
    manifold3_test!(
        sphere3_test_aabb_delegates,
        sphere3(),
        aabb3(),
        test_aabb,
        test_sphere_aabb_collision3d
    );
    manifold3_test!(
        sphere3_test_box_delegates,
        sphere3(),
        box3(),
        test_box,
        test_sphere_box_collision3d
    );
    manifold3_test!(
        sphere3_test_capsule_delegates,
        sphere3(),
        capsule3(),
        test_capsule,
        test_sphere_capsule_collision3d
    );
    manifold3_test!(
        sphere3_test_sphere_delegates,
        sphere3(),
        sphere3(),
        test_sphere,
        test_sphere_sphere_collision3d
    );

    segment2_test!(
        segment2_test_aabb_delegates,
        aabb2(),
        test_aabb,
        test_segment_aabb_collision2d
    );
    segment2_test!(
        segment2_test_capsule_delegates,
        capsule2(),
        test_capsule,
        test_segment_capsule_collision2d
    );
    segment2_test!(
        segment2_test_circle_delegates,
        circle2(),
        test_circle,
        test_segment_circle_collision2d
    );
    segment2_test!(
        segment2_test_obb_delegates,
        obb2(),
        test_obb,
        test_segment_obb_collision2d
    );
    segment2_test!(
        segment2_test_polygon_delegates,
        polygon2(),
        test_polygon,
        test_segment_polygon_collision2d
    );
    segment2_test!(
        segment2_test_segment_delegates,
        segment2(),
        test_segment,
        test_segment_segment_collision2d
    );

    support2_test!(aabb2_support_delegates, aabb2(), support_collision_aabb2d);
    support2_test!(
        capsule2_support_delegates,
        capsule2(),
        support_collision_capsule2d
    );
    support2_test!(
        circle2_support_delegates,
        circle2(),
        support_collision_circle2d
    );
    support2_test!(obb2_support_delegates, obb2(), support_collision_obb2d);
    support2_test!(
        polygon2_support_delegates,
        polygon2(),
        support_collision_polygon2d
    );

    support3_test!(aabb3_support_delegates, aabb3(), support_collision_aabb3d);
    support3_test!(box3_support_delegates, box3(), support_collision_box3d);
    support3_test!(
        capsule3_support_delegates,
        capsule3(),
        support_collision_capsule3d
    );
    support3_test!(cone3_support_delegates, cone3(), support_collision_cone3d);
    support3_test!(
        convex3_support_delegates,
        convex3(),
        support_collision_convex3d
    );
    support3_test!(
        cylinder3_support_delegates,
        cylinder3(),
        support_collision_cylinder3d
    );
    support3_test!(
        sphere3_support_delegates,
        sphere3(),
        support_collision_sphere3d
    );

    #[test]
    fn aabb2_write_vertices_delegates() {
        let receiver = aabb2();
        let mut actual = [0.0; 8];
        let mut expected = [0.0; 8];
        receiver.write_vertices(&mut actual);
        write_aabb_vertices(&receiver, &mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn obb2_write_vertices_delegates() {
        let receiver = obb2();
        let mut actual = [0.0; 8];
        let mut expected = [0.0; 8];
        receiver.write_vertices(&mut actual);
        write_obb_vertices(&receiver, &mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn contact_manifold2_new_delegates() {
        let actual = CollisionContactManifold2D::new();
        let expected = create_collision_contact_manifold2d();
        assert_eq!(actual, expected);
    }

    #[test]
    fn contact_manifold2_clear_delegates() {
        let mut actual = CollisionContactManifold2D::default();
        actual.overlapping = true;
        let mut expected = actual.clone();
        actual.clear();
        clear_collision_contact_manifold2d(&mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn contact_manifold3_new_delegates() {
        let actual = CollisionContactManifold3D::new();
        let expected = create_collision_contact_manifold3d();
        assert_eq!(actual, expected);
    }

    #[test]
    fn contact_manifold3_clear_delegates() {
        let mut actual = CollisionContactManifold3D::default();
        actual.overlapping = true;
        let mut expected = actual.clone();
        actual.clear();
        clear_collision_contact_manifold3d(&mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn distance3_new_delegates() {
        assert_eq!(CollisionDistance3D::new(), create_collision_distance3d());
    }

    #[test]
    fn manifold2_new_delegates() {
        assert_eq!(CollisionManifold2D::new(), create_collision_manifold2d());
    }

    #[test]
    fn manifold2_clear_delegates() {
        let mut actual = CollisionManifold2D::default();
        actual.overlapping = true;
        let mut expected = actual.clone();
        actual.clear();
        clear_collision_manifold2d(&mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn manifold3_new_delegates() {
        assert_eq!(CollisionManifold3D::new(), create_collision_manifold3d());
    }

    #[test]
    fn manifold3_clear_delegates() {
        let mut actual = CollisionManifold3D::default();
        actual.overlapping = true;
        let mut expected = actual.clone();
        actual.clear();
        clear_collision_manifold3d(&mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn raycast_hit2_new_delegates() {
        assert_eq!(
            CollisionRaycastHit2D::new(),
            create_collision_raycast_hit2d()
        );
    }

    #[test]
    fn raycast_hit3_new_delegates() {
        assert_eq!(
            CollisionRaycastHit3D::new(),
            create_collision_raycast_hit3d()
        );
    }

    #[test]
    fn time_of_impact2_new_delegates() {
        assert_eq!(
            CollisionTimeOfImpact2D::new(),
            create_collision_time_of_impact2d()
        );
    }

    #[test]
    fn time_of_impact3_new_delegates() {
        assert_eq!(
            CollisionTimeOfImpact3D::new(),
            create_collision_time_of_impact3d()
        );
    }

    #[test]
    fn shape2_collide_contact_delegates() {
        let receiver = CollisionShape2D::Circle(circle2());
        let other = CollisionShape2D::Circle(circle2());
        let mut actual = CollisionContactManifold2D::default();
        let mut expected = CollisionContactManifold2D::default();
        let method_result = receiver.collide_contact(&other, &mut actual);
        let free_result = collide_contact_manifold2d(&receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape2_contains_point_delegates() {
        let receiver = CollisionShape2D::Circle(circle2());
        assert_eq!(
            receiver.contains_point(0.25, 0.25),
            get_collision_shape_contains_point2d(&receiver, 0.25, 0.25)
        );
    }

    #[test]
    fn shape2_explain_test_delegates() {
        let registry = registry2();
        let receiver = CollisionShape2D::Circle(circle2());
        let other = CollisionShape2D::Circle(circle2());
        let mut actual = CollisionTestExplanation2D::default();
        let mut expected = CollisionTestExplanation2D::default();
        let method_result = receiver.explain_test(&registry, &other, &mut actual);
        let free_result = explain_collision_test2d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape2_kind_delegates() {
        let receiver = CollisionShape2D::Circle(circle2());
        assert_eq!(receiver.kind(), get_collision_shape2d_kind(&receiver));
    }

    #[test]
    fn shape2_raycast_delegates() {
        let receiver = CollisionShape2D::Circle(circle2());
        let mut actual = CollisionRaycastHit2D::default();
        let mut expected = CollisionRaycastHit2D::default();
        let method_result = receiver.raycast(-2.0, 0.0, 1.0, 0.0, 5.0, &mut actual);
        let free_result =
            raycast_collision_shape2d(&receiver, -2.0, 0.0, 1.0, 0.0, 5.0, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape2_sweep_delegates() {
        let registry = registry2();
        let receiver = CollisionShape2D::Circle(circle2());
        let other = CollisionShape2D::Circle(CollisionCircle2D {
            x: 3.0,
            ..circle2()
        });
        let mut actual = CollisionTimeOfImpact2D::default();
        let mut expected = CollisionTimeOfImpact2D::default();
        let method_result = receiver.sweep(&registry, &other, 2.0, 0.0, &mut actual);
        let free_result =
            sweep_collision_shape2d(&registry, &receiver, &other, 2.0, 0.0, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape2_test_delegates() {
        let registry = registry2();
        let receiver = CollisionShape2D::Circle(circle2());
        let other = receiver.clone();
        let mut actual = CollisionManifold2D::default();
        let mut expected = CollisionManifold2D::default();
        let method_result = receiver.test(&registry, &other, &mut actual);
        let free_result = test_collision2d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape2_test_support_delegates() {
        let registry = registry2();
        let receiver = CollisionShape2D::Circle(circle2());
        let other = receiver.clone();
        let mut actual = CollisionManifold2D::default();
        let mut expected = CollisionManifold2D::default();
        let method_result = receiver.test_support(&registry, &other, &mut actual);
        let free_result = test_collision_support2d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape2_test_support_overlap_delegates() {
        let registry = registry2();
        let receiver = CollisionShape2D::Circle(circle2());
        let other = receiver.clone();
        assert_eq!(
            receiver.test_support_overlap(&registry, &other),
            test_collision_support_overlap2d(&registry, &receiver, &other)
        );
    }

    #[test]
    fn shape2_validation_status_delegates() {
        let receiver = CollisionShape2D::Circle(circle2());
        assert_eq!(
            receiver.validation_status(),
            get_collision_shape_validation_status2d(&receiver)
        );
    }

    #[test]
    fn shape3_collide_contact_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let other = receiver.clone();
        let mut actual = CollisionContactManifold3D::default();
        let mut expected = CollisionContactManifold3D::default();
        let method_result = receiver.collide_contact(&registry, &other, &mut actual);
        let free_result = collide_contact_manifold3d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_collide_heightfield_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let heightfield = heightfield3();
        let mut actual = CollisionManifold3D::default();
        let mut expected = CollisionManifold3D::default();
        let method_result = receiver.collide_heightfield(&registry, &heightfield, &mut actual);
        let free_result =
            collide_collision_heightfield3d(&registry, &heightfield, &receiver, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_collide_triangle_mesh_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let mesh = mesh3();
        let mut actual = CollisionManifold3D::default();
        let mut expected = CollisionManifold3D::default();
        let method_result = receiver.collide_triangle_mesh(&registry, &mesh, &mut actual);
        let free_result =
            collide_collision_triangle_mesh3d(&registry, &mesh, &receiver, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_contains_point_delegates() {
        let receiver = CollisionShape3D::Sphere(sphere3());
        assert_eq!(
            receiver.contains_point(0.25, 0.25, 0.25),
            get_collision_shape_contains_point3d(&receiver, 0.25, 0.25, 0.25)
        );
    }

    #[test]
    fn shape3_explain_test_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let other = receiver.clone();
        let mut actual = CollisionTestExplanation3D::default();
        let mut expected = CollisionTestExplanation3D::default();
        let method_result = receiver.explain_test(&registry, &other, &mut actual);
        let free_result = explain_collision_test3d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_kind_delegates() {
        let receiver = CollisionShape3D::Sphere(sphere3());
        assert_eq!(receiver.kind(), get_collision_shape3d_kind(&receiver));
    }

    macro_rules! face_query_test {
        ($name:ident, $shape:expr, $method:ident, $free:path) => {
            #[test]
            fn $name() {
                let receiver = $shape;
                let mut actual = Vec::new();
                let mut expected = Vec::new();
                let method_result = receiver.$method(1.0, 0.0, 0.0, &mut actual);
                let free_result = $free(&receiver, 1.0, 0.0, 0.0, &mut expected);
                assert_eq!((method_result, actual), (free_result, expected));
            }
        };
    }

    face_query_test!(
        shape3_query_aabb_face_delegates,
        CollisionShape3D::Aabb(aabb3()),
        query_aabb_face,
        query_collision_aabb_face3d
    );
    face_query_test!(
        shape3_query_box_face_delegates,
        CollisionShape3D::Box(box3()),
        query_box_face,
        query_collision_box_face3d
    );
    face_query_test!(
        shape3_query_capsule_face_delegates,
        CollisionShape3D::Capsule(capsule3()),
        query_capsule_face,
        query_collision_capsule_face3d
    );
    face_query_test!(
        shape3_query_convex_face_delegates,
        CollisionShape3D::Convex(convex3()),
        query_convex_face,
        query_collision_convex_face3d
    );

    #[test]
    fn shape3_raycast_delegates() {
        let receiver = CollisionShape3D::Sphere(sphere3());
        let mut actual = CollisionRaycastHit3D::default();
        let mut expected = CollisionRaycastHit3D::default();
        let method_result = receiver.raycast(-2.0, 0.0, 0.0, 1.0, 0.0, 0.0, 5.0, &mut actual);
        let free_result =
            raycast_collision_shape3d(&receiver, -2.0, 0.0, 0.0, 1.0, 0.0, 0.0, 5.0, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_sweep_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let other = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 3.0,
            ..sphere3()
        });
        let mut actual = CollisionTimeOfImpact3D::default();
        let mut expected = CollisionTimeOfImpact3D::default();
        let method_result = receiver.sweep(&registry, &other, 2.0, 0.0, 0.0, &mut actual);
        let free_result =
            sweep_collision_shape3d(&registry, &receiver, &other, 2.0, 0.0, 0.0, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_sweep_heightfield_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let heightfield = heightfield3();
        let mut actual = CollisionTimeOfImpact3D::default();
        let mut expected = CollisionTimeOfImpact3D::default();
        let method_result =
            receiver.sweep_heightfield(&registry, &heightfield, 0.0, -1.0, 0.0, &mut actual);
        let free_result = sweep_collision_heightfield3d(
            &registry,
            &heightfield,
            &receiver,
            0.0,
            -1.0,
            0.0,
            &mut expected,
        );
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_sweep_triangle_mesh_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let mesh = mesh3();
        let mut actual = CollisionTimeOfImpact3D::default();
        let mut expected = CollisionTimeOfImpact3D::default();
        let method_result =
            receiver.sweep_triangle_mesh(&registry, &mesh, 0.0, -1.0, 0.0, &mut actual);
        let free_result = sweep_collision_triangle_mesh3d(
            &registry,
            &mesh,
            &receiver,
            0.0,
            -1.0,
            0.0,
            &mut expected,
        );
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_test_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let other = receiver.clone();
        let mut actual = CollisionManifold3D::default();
        let mut expected = CollisionManifold3D::default();
        let method_result = receiver.test(&registry, &other, &mut actual);
        let free_result = test_collision3d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_test_support_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let other = receiver.clone();
        let mut actual = CollisionManifold3D::default();
        let mut expected = CollisionManifold3D::default();
        let method_result = receiver.test_support(&registry, &other, &mut actual);
        let free_result = test_collision_support3d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn shape3_test_support_overlap_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let other = receiver.clone();
        assert_eq!(
            receiver.test_support_overlap(&registry, &other),
            test_collision_support_overlap3d(&registry, &receiver, &other)
        );
    }

    #[test]
    fn shape3_validation_status_delegates() {
        let receiver = CollisionShape3D::Sphere(sphere3());
        assert_eq!(
            receiver.validation_status(),
            get_collision_shape_validation_status3d(&receiver)
        );
    }

    #[test]
    fn shape3_write_distance_delegates() {
        let registry = registry3();
        let receiver = CollisionShape3D::Sphere(sphere3());
        let other = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 3.0,
            ..sphere3()
        });
        let mut actual = CollisionDistance3D::default();
        let mut expected = CollisionDistance3D::default();
        let method_result = receiver.write_distance(&registry, &other, &mut actual);
        let free_result = write_collision_distance3d(&registry, &receiver, &other, &mut expected);
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn heightfield3_new_delegates() {
        let actual = CollisionHeightfield3D::new(2, 2, vec![0.0; 4], 1.0, 1.0);
        let expected = create_collision_heightfield3d(2, 2, vec![0.0; 4], 1.0, 1.0);
        assert_eq!(actual, expected);
    }

    #[test]
    fn heightfield3_invalidate_delegates() {
        let mut actual = heightfield3();
        let mut expected = actual.clone();
        actual.invalidate();
        invalidate_collision_heightfield3d(&mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn heightfield3_raycast_delegates() {
        let receiver = heightfield3();
        let mut actual = CollisionRaycastHit3D::default();
        let mut expected = CollisionRaycastHit3D::default();
        let method_result = receiver.raycast(0.25, 1.0, 0.25, 0.0, -1.0, 0.0, 2.0, &mut actual);
        let free_result = raycast_collision_heightfield3d(
            &receiver,
            0.25,
            1.0,
            0.25,
            0.0,
            -1.0,
            0.0,
            2.0,
            &mut expected,
        );
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn heightfield3_validation_status_delegates() {
        let receiver = heightfield3();
        assert_eq!(
            receiver.validation_status(),
            get_collision_heightfield_validation_status3d(&receiver)
        );
    }

    #[test]
    fn heightfield3_write_bounds_delegates() {
        let receiver = heightfield3();
        let mut actual = CollisionAabb3D::default();
        let mut expected = CollisionAabb3D::default();
        receiver.write_bounds(&mut actual);
        write_collision_heightfield_bounds3d(&receiver, &mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn triangle_mesh3_new_delegates() {
        let points = vec![-1.0, 0.0, -1.0, 1.0, 0.0, -1.0, 0.0, 0.0, 1.0];
        let indices = vec![0, 1, 2];
        assert_eq!(
            CollisionTriangleMesh3D::new(points.clone(), indices.clone()),
            create_collision_triangle_mesh3d(points, indices)
        );
    }

    #[test]
    fn triangle_mesh3_invalidate_delegates() {
        let mut actual = mesh3();
        let mut expected = actual.clone();
        actual.invalidate();
        invalidate_collision_triangle_mesh3d(&mut expected);
        assert_eq!(actual, expected);
    }

    #[test]
    fn triangle_mesh3_raycast_delegates() {
        let receiver = mesh3();
        let mut actual = CollisionRaycastHit3D::default();
        let mut expected = CollisionRaycastHit3D::default();
        let method_result = receiver.raycast(0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 2.0, &mut actual);
        let free_result = raycast_collision_triangle_mesh3d(
            &receiver,
            0.0,
            1.0,
            0.0,
            0.0,
            -1.0,
            0.0,
            2.0,
            &mut expected,
        );
        assert_eq!((method_result, actual), (free_result, expected));
    }

    #[test]
    fn triangle_mesh3_validation_status_delegates() {
        let receiver = mesh3();
        assert_eq!(
            receiver.validation_status(),
            get_collision_triangle_mesh_validation_status3d(&receiver)
        );
    }

    #[test]
    fn triangle_mesh3_write_bounds_delegates() {
        let receiver = mesh3();
        let mut actual = CollisionAabb3D::default();
        let mut expected = CollisionAabb3D::default();
        receiver.write_bounds(&mut actual);
        write_collision_triangle_mesh_bounds3d(&receiver, &mut expected);
        assert_eq!(actual, expected);
    }
}

impl CollisionAabb2D {
    pub fn collide_aabb_contact(
        &self,
        other: &CollisionAabb2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_aabb_aabb_contact_manifold2d(self, other, out);
    }

    pub fn collide_obb_contact(
        &self,
        other: &CollisionObb2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_aabb_obb_contact_manifold2d(self, other, out);
    }

    pub fn collide_polygon_contact(
        &self,
        other: &CollisionPolygon2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_aabb_polygon_contact_manifold2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing AABB support signature and performs no arithmetic
    pub fn support(&self, direction_x: f64, direction_y: f64, out: &mut [f64; 2]) {
        support_collision_aabb2d(self, direction_x, direction_y, out);
    }

    pub fn test_aabb(&self, other: &CollisionAabb2D, out: &mut CollisionManifold2D) -> bool {
        return test_aabb_aabb_collision2d(self, other, out);
    }

    pub fn test_obb(&self, other: &CollisionObb2D, out: &mut CollisionManifold2D) -> bool {
        return test_aabb_obb_collision2d(self, other, out);
    }

    pub fn test_polygon(&self, other: &CollisionPolygon2D, out: &mut CollisionManifold2D) -> bool {
        return test_aabb_polygon_collision2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing AABB vertex-buffer signature and performs no arithmetic
    pub fn write_vertices(&self, out: &mut [f64; 8]) {
        write_aabb_vertices(self, out);
    }
}

impl CollisionAabb3D {
    // flight-lint: allow(f64) D18 delegate preserves the existing 3D AABB support signature and performs no arithmetic
    pub fn support(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut [f64; 3],
    ) {
        support_collision_aabb3d(self, direction_x, direction_y, direction_z, out);
    }

    pub fn test_aabb(&self, other: &CollisionAabb3D, out: &mut CollisionManifold3D) -> bool {
        return test_aabb_aabb_collision3d(self, other, out);
    }
}

impl CollisionBox3D {
    // flight-lint: allow(f64) D18 delegate preserves the existing box support signature and performs no arithmetic
    pub fn support(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut [f64; 3],
    ) {
        support_collision_box3d(self, direction_x, direction_y, direction_z, out);
    }

    pub fn test_box(&self, other: &CollisionBox3D, out: &mut CollisionManifold3D) -> bool {
        return test_box_box_collision3d(self, other, out);
    }
}

impl CollisionCapsule2D {
    pub fn collide_aabb_contact(
        &self,
        other: &CollisionAabb2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_capsule_aabb_contact_manifold2d(self, other, out);
    }

    pub fn collide_capsule_contact(
        &self,
        other: &CollisionCapsule2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_capsule_capsule_contact_manifold2d(self, other, out);
    }

    pub fn collide_obb_contact(
        &self,
        other: &CollisionObb2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_capsule_obb_contact_manifold2d(self, other, out);
    }

    pub fn collide_polygon_contact(
        &self,
        other: &CollisionPolygon2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_capsule_polygon_contact_manifold2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing capsule support signature and performs no arithmetic
    pub fn support(&self, direction_x: f64, direction_y: f64, out: &mut [f64; 2]) {
        support_collision_capsule2d(self, direction_x, direction_y, out);
    }
}

impl CollisionCapsule3D {
    // flight-lint: allow(f64) D18 delegate preserves the existing 3D capsule support signature and performs no arithmetic
    pub fn support(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut [f64; 3],
    ) {
        support_collision_capsule3d(self, direction_x, direction_y, direction_z, out);
    }

    pub fn test_capsule(&self, other: &CollisionCapsule3D, out: &mut CollisionManifold3D) -> bool {
        return test_capsule_capsule_collision3d(self, other, out);
    }
}

impl CollisionCircle2D {
    pub fn collide_aabb_contact(
        &self,
        other: &CollisionAabb2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_circle_aabb_contact_manifold2d(self, other, out);
    }

    pub fn collide_capsule_contact(
        &self,
        other: &CollisionCapsule2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_circle_capsule_contact_manifold2d(self, other, out);
    }

    pub fn collide_circle_contact(
        &self,
        other: &CollisionCircle2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_circle_circle_contact_manifold2d(self, other, out);
    }

    pub fn collide_obb_contact(
        &self,
        other: &CollisionObb2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_circle_obb_contact_manifold2d(self, other, out);
    }

    pub fn collide_polygon_contact(
        &self,
        other: &CollisionPolygon2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_circle_polygon_contact_manifold2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing circle support signature and performs no arithmetic
    pub fn support(&self, direction_x: f64, direction_y: f64, out: &mut [f64; 2]) {
        support_collision_circle2d(self, direction_x, direction_y, out);
    }

    pub fn test_aabb(&self, other: &CollisionAabb2D, out: &mut CollisionManifold2D) -> bool {
        return test_circle_aabb_collision2d(self, other, out);
    }

    pub fn test_circle(&self, other: &CollisionCircle2D, out: &mut CollisionManifold2D) -> bool {
        return test_circle_circle_collision2d(self, other, out);
    }

    pub fn test_obb(&self, other: &CollisionObb2D, out: &mut CollisionManifold2D) -> bool {
        return test_circle_obb_collision2d(self, other, out);
    }

    pub fn test_polygon(&self, other: &CollisionPolygon2D, out: &mut CollisionManifold2D) -> bool {
        return test_circle_polygon_collision2d(self, other, out);
    }
}

impl CollisionCone3D {
    // flight-lint: allow(f64) D18 delegate preserves the existing cone support signature and performs no arithmetic
    pub fn support(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut [f64; 3],
    ) {
        support_collision_cone3d(self, direction_x, direction_y, direction_z, out);
    }
}

impl CollisionContactManifold2D {
    pub fn new() -> Self {
        return create_collision_contact_manifold2d();
    }

    pub fn clear(&mut self) {
        clear_collision_contact_manifold2d(self);
    }
}

impl CollisionContactManifold3D {
    pub fn new() -> Self {
        return create_collision_contact_manifold3d();
    }

    pub fn clear(&mut self) {
        clear_collision_contact_manifold3d(self);
    }
}

impl CollisionConvex3D {
    // flight-lint: allow(f64) D18 delegate preserves the existing convex support signature and performs no arithmetic
    pub fn support(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut [f64; 3],
    ) {
        support_collision_convex3d(self, direction_x, direction_y, direction_z, out);
    }
}

impl CollisionCylinder3D {
    // flight-lint: allow(f64) D18 delegate preserves the existing cylinder support signature and performs no arithmetic
    pub fn support(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut [f64; 3],
    ) {
        support_collision_cylinder3d(self, direction_x, direction_y, direction_z, out);
    }
}

impl CollisionDistance3D {
    pub fn new() -> Self {
        return create_collision_distance3d();
    }
}

impl CollisionHeightfield3D {
    // flight-lint: allow(f64) D18 constructor preserves the existing heightfield sample and cell-size signature
    pub fn new(
        columns: usize,
        rows: usize,
        heights: Vec<f64>,
        cell_size_x: f64,
        cell_size_z: f64,
    ) -> Self {
        return create_collision_heightfield3d(columns, rows, heights, cell_size_x, cell_size_z);
    }

    pub fn invalidate(&mut self) {
        invalidate_collision_heightfield3d(self);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing heightfield ray domain and performs no arithmetic
    pub fn raycast(
        &self,
        origin_x: f64,
        origin_y: f64,
        origin_z: f64,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        max_fraction: f64,
        out: &mut CollisionRaycastHit3D,
    ) -> bool {
        return raycast_collision_heightfield3d(
            self,
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
            out,
        );
    }

    pub fn validation_status(&self) -> Option<CollisionTestStatus> {
        return get_collision_heightfield_validation_status3d(self);
    }

    pub fn write_bounds(&self, out: &mut CollisionAabb3D) {
        write_collision_heightfield_bounds3d(self, out);
    }
}

impl CollisionManifold2D {
    pub fn new() -> Self {
        return create_collision_manifold2d();
    }

    pub fn clear(&mut self) {
        clear_collision_manifold2d(self);
    }
}

impl CollisionManifold3D {
    pub fn new() -> Self {
        return create_collision_manifold3d();
    }

    pub fn clear(&mut self) {
        clear_collision_manifold3d(self);
    }
}

impl CollisionObb2D {
    pub fn collide_obb_contact(
        &self,
        other: &CollisionObb2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_obb_obb_contact_manifold2d(self, other, out);
    }

    pub fn collide_polygon_contact(
        &self,
        other: &CollisionPolygon2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_obb_polygon_contact_manifold2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing OBB support signature and performs no arithmetic
    pub fn support(&self, direction_x: f64, direction_y: f64, out: &mut [f64; 2]) {
        support_collision_obb2d(self, direction_x, direction_y, out);
    }

    pub fn test_obb(&self, other: &CollisionObb2D, out: &mut CollisionManifold2D) -> bool {
        return test_obb_obb_collision2d(self, other, out);
    }

    pub fn test_polygon(&self, other: &CollisionPolygon2D, out: &mut CollisionManifold2D) -> bool {
        return test_obb_polygon_collision2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing OBB vertex-buffer signature and performs no arithmetic
    pub fn write_vertices(&self, out: &mut [f64; 8]) {
        write_obb_vertices(self, out);
    }
}

impl CollisionPolygon2D {
    pub fn collide_polygon_contact(
        &self,
        other: &CollisionPolygon2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_polygon_polygon_contact_manifold2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing polygon support signature and performs no arithmetic
    pub fn support(&self, direction_x: f64, direction_y: f64, out: &mut [f64; 2]) {
        support_collision_polygon2d(self, direction_x, direction_y, out);
    }

    pub fn test_polygon(&self, other: &CollisionPolygon2D, out: &mut CollisionManifold2D) -> bool {
        return test_polygon_polygon_collision2d(self, other, out);
    }
}

impl CollisionRaycastHit2D {
    pub fn new() -> Self {
        return create_collision_raycast_hit2d();
    }
}

impl CollisionRaycastHit3D {
    pub fn new() -> Self {
        return create_collision_raycast_hit3d();
    }
}

impl CollisionSegment2D {
    pub fn test_aabb(&self, other: &CollisionAabb2D) -> bool {
        return test_segment_aabb_collision2d(self, other);
    }

    pub fn test_capsule(&self, other: &CollisionCapsule2D) -> bool {
        return test_segment_capsule_collision2d(self, other);
    }

    pub fn test_circle(&self, other: &CollisionCircle2D) -> bool {
        return test_segment_circle_collision2d(self, other);
    }

    pub fn test_obb(&self, other: &CollisionObb2D) -> bool {
        return test_segment_obb_collision2d(self, other);
    }

    pub fn test_polygon(&self, other: &CollisionPolygon2D) -> bool {
        return test_segment_polygon_collision2d(self, other);
    }

    pub fn test_segment(&self, other: &CollisionSegment2D) -> bool {
        return test_segment_segment_collision2d(self, other);
    }
}

impl CollisionShape2D {
    pub fn collide_contact(
        &self,
        other: &CollisionShape2D,
        out: &mut CollisionContactManifold2D,
    ) -> bool {
        return collide_contact_manifold2d(self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing 2D point-query signature and performs no arithmetic
    pub fn contains_point(&self, x: f64, y: f64) -> bool {
        return get_collision_shape_contains_point2d(self, x, y);
    }

    pub fn explain_test(
        &self,
        registry: &CollisionRegistry2D,
        other: &CollisionShape2D,
        out: &mut CollisionTestExplanation2D,
    ) -> bool {
        return explain_collision_test2d(registry, self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing 2D ray domain and performs no arithmetic
    pub fn raycast(
        &self,
        origin_x: f64,
        origin_y: f64,
        direction_x: f64,
        direction_y: f64,
        max_fraction: f64,
        out: &mut CollisionRaycastHit2D,
    ) -> bool {
        return raycast_collision_shape2d(
            self,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            out,
        );
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing 2D sweep domain and performs no arithmetic
    pub fn sweep(
        &self,
        registry: &CollisionRegistry2D,
        other: &CollisionShape2D,
        velocity_x: f64,
        velocity_y: f64,
        out: &mut CollisionTimeOfImpact2D,
    ) -> bool {
        return sweep_collision_shape2d(registry, self, other, velocity_x, velocity_y, out);
    }

    pub fn test(
        &self,
        registry: &CollisionRegistry2D,
        other: &CollisionShape2D,
        out: &mut CollisionManifold2D,
    ) -> bool {
        return test_collision2d(registry, self, other, out);
    }

    pub fn test_support(
        &self,
        registry: &CollisionRegistry2D,
        other: &CollisionShape2D,
        out: &mut CollisionManifold2D,
    ) -> bool {
        return test_collision_support2d(registry, self, other, out);
    }

    pub fn test_support_overlap(
        &self,
        registry: &CollisionRegistry2D,
        other: &CollisionShape2D,
    ) -> bool {
        return test_collision_support_overlap2d(registry, self, other);
    }

    pub fn validation_status(&self) -> Option<CollisionTestStatus> {
        return get_collision_shape_validation_status2d(self);
    }
}

impl CollisionShape3D {
    pub fn collide_contact(
        &self,
        registry: &CollisionRegistry3D,
        other: &CollisionShape3D,
        out: &mut CollisionContactManifold3D,
    ) -> bool {
        return collide_contact_manifold3d(registry, self, other, out);
    }

    pub fn collide_heightfield(
        &self,
        registry: &CollisionRegistry3D,
        heightfield: &CollisionHeightfield3D,
        out: &mut CollisionManifold3D,
    ) -> bool {
        return collide_collision_heightfield3d(registry, heightfield, self, out);
    }

    pub fn collide_triangle_mesh(
        &self,
        registry: &CollisionRegistry3D,
        mesh: &CollisionTriangleMesh3D,
        out: &mut CollisionManifold3D,
    ) -> bool {
        return collide_collision_triangle_mesh3d(registry, mesh, self, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing 3D point-query signature and performs no arithmetic
    pub fn contains_point(&self, x: f64, y: f64, z: f64) -> bool {
        return get_collision_shape_contains_point3d(self, x, y, z);
    }

    pub fn explain_test(
        &self,
        registry: &CollisionRegistry3D,
        other: &CollisionShape3D,
        out: &mut CollisionTestExplanation3D,
    ) -> bool {
        return explain_collision_test3d(registry, self, other, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing AABB face-direction domain and performs no arithmetic
    pub fn query_aabb_face(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut Vec<f64>,
    ) -> usize {
        return query_collision_aabb_face3d(self, direction_x, direction_y, direction_z, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing box face-direction domain and performs no arithmetic
    pub fn query_box_face(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut Vec<f64>,
    ) -> usize {
        return query_collision_box_face3d(self, direction_x, direction_y, direction_z, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing capsule face-direction domain and performs no arithmetic
    pub fn query_capsule_face(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut Vec<f64>,
    ) -> usize {
        return query_collision_capsule_face3d(self, direction_x, direction_y, direction_z, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing convex face-direction domain and performs no arithmetic
    pub fn query_convex_face(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut Vec<f64>,
    ) -> usize {
        return query_collision_convex_face3d(self, direction_x, direction_y, direction_z, out);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing 3D ray domain and performs no arithmetic
    pub fn raycast(
        &self,
        origin_x: f64,
        origin_y: f64,
        origin_z: f64,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        max_fraction: f64,
        out: &mut CollisionRaycastHit3D,
    ) -> bool {
        return raycast_collision_shape3d(
            self,
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
            out,
        );
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing 3D sweep domain and performs no arithmetic
    pub fn sweep(
        &self,
        registry: &CollisionRegistry3D,
        other: &CollisionShape3D,
        velocity_x: f64,
        velocity_y: f64,
        velocity_z: f64,
        out: &mut CollisionTimeOfImpact3D,
    ) -> bool {
        return sweep_collision_shape3d(
            registry, self, other, velocity_x, velocity_y, velocity_z, out,
        );
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing heightfield sweep domain and performs no arithmetic
    pub fn sweep_heightfield(
        &self,
        registry: &CollisionRegistry3D,
        heightfield: &CollisionHeightfield3D,
        velocity_x: f64,
        velocity_y: f64,
        velocity_z: f64,
        out: &mut CollisionTimeOfImpact3D,
    ) -> bool {
        return sweep_collision_heightfield3d(
            registry,
            heightfield,
            self,
            velocity_x,
            velocity_y,
            velocity_z,
            out,
        );
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing triangle-mesh sweep domain and performs no arithmetic
    pub fn sweep_triangle_mesh(
        &self,
        registry: &CollisionRegistry3D,
        mesh: &CollisionTriangleMesh3D,
        velocity_x: f64,
        velocity_y: f64,
        velocity_z: f64,
        out: &mut CollisionTimeOfImpact3D,
    ) -> bool {
        return sweep_collision_triangle_mesh3d(
            registry, mesh, self, velocity_x, velocity_y, velocity_z, out,
        );
    }

    pub fn test(
        &self,
        registry: &CollisionRegistry3D,
        other: &CollisionShape3D,
        out: &mut CollisionManifold3D,
    ) -> bool {
        return test_collision3d(registry, self, other, out);
    }

    pub fn test_support(
        &self,
        registry: &CollisionRegistry3D,
        other: &CollisionShape3D,
        out: &mut CollisionManifold3D,
    ) -> bool {
        return test_collision_support3d(registry, self, other, out);
    }

    pub fn test_support_overlap(
        &self,
        registry: &CollisionRegistry3D,
        other: &CollisionShape3D,
    ) -> bool {
        return test_collision_support_overlap3d(registry, self, other);
    }

    pub fn validation_status(&self) -> Option<CollisionTestStatus> {
        return get_collision_shape_validation_status3d(self);
    }

    pub fn write_distance(
        &self,
        registry: &CollisionRegistry3D,
        other: &CollisionShape3D,
        out: &mut CollisionDistance3D,
    ) -> bool {
        return write_collision_distance3d(registry, self, other, out);
    }
}

impl CollisionSphere3D {
    // flight-lint: allow(f64) D18 delegate preserves the existing sphere support signature and performs no arithmetic
    pub fn support(
        &self,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        out: &mut [f64; 3],
    ) {
        support_collision_sphere3d(self, direction_x, direction_y, direction_z, out);
    }

    pub fn test_aabb(&self, other: &CollisionAabb3D, out: &mut CollisionManifold3D) -> bool {
        return test_sphere_aabb_collision3d(self, other, out);
    }

    pub fn test_box(&self, other: &CollisionBox3D, out: &mut CollisionManifold3D) -> bool {
        return test_sphere_box_collision3d(self, other, out);
    }

    pub fn test_capsule(&self, other: &CollisionCapsule3D, out: &mut CollisionManifold3D) -> bool {
        return test_sphere_capsule_collision3d(self, other, out);
    }

    pub fn test_sphere(&self, other: &CollisionSphere3D, out: &mut CollisionManifold3D) -> bool {
        return test_sphere_sphere_collision3d(self, other, out);
    }
}

impl CollisionTimeOfImpact2D {
    pub fn new() -> Self {
        return create_collision_time_of_impact2d();
    }
}

impl CollisionTimeOfImpact3D {
    pub fn new() -> Self {
        return create_collision_time_of_impact3d();
    }
}

impl CollisionTriangleMesh3D {
    // flight-lint: allow(f64) D18 constructor preserves the existing triangle-mesh coordinate signature
    pub fn new(points: Vec<f64>, indices: Vec<usize>) -> Self {
        return create_collision_triangle_mesh3d(points, indices);
    }

    pub fn invalidate(&mut self) {
        invalidate_collision_triangle_mesh3d(self);
    }

    // flight-lint: allow(f64) D18 delegate preserves the existing triangle-mesh ray domain and performs no arithmetic
    pub fn raycast(
        &self,
        origin_x: f64,
        origin_y: f64,
        origin_z: f64,
        direction_x: f64,
        direction_y: f64,
        direction_z: f64,
        max_fraction: f64,
        out: &mut CollisionRaycastHit3D,
    ) -> bool {
        return raycast_collision_triangle_mesh3d(
            self,
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
            out,
        );
    }

    pub fn validation_status(&self) -> Option<CollisionTestStatus> {
        return get_collision_triangle_mesh_validation_status3d(self);
    }

    pub fn write_bounds(&self, out: &mut CollisionAabb3D) {
        write_collision_triangle_mesh_bounds3d(self, out);
    }
}
