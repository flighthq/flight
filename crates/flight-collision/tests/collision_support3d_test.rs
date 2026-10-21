use flight_collision::contract::*;
use flight_collision::*;
use std::sync::Arc;

struct Xorshift {
    state: u32,
}

impl Xorshift {
    fn new(seed: u32) -> Self {
        let state = if seed == 0 { 1 } else { seed };
        Self { state }
    }

    fn next(&mut self) -> f32 {
        self.state ^= self.state.wrapping_shl(13);
        self.state ^= self.state >> 17;
        self.state ^= self.state.wrapping_shl(5);
        (self.state % 100000) as f32 / 100000.0
    }
}

// The two round-sided kinds, shared by the describes below.
fn cone_inner() -> CollisionCone3D {
    // base at origin, apex at (0, 3, 0)
    CollisionCone3D {
        x0: 0.0,
        y0: 0.0,
        z0: 0.0,
        x1: 0.0,
        y1: 3.0,
        z1: 0.0,
        radius: 1.5,
    }
}

fn cone_shape() -> CollisionShape3D {
    CollisionShape3D::Cone(cone_inner())
}

fn cylinder_inner() -> CollisionCylinder3D {
    CollisionCylinder3D {
        radius: 1.0,
        x0: 0.0,
        x1: 0.0,
        y0: -2.0,
        y1: 2.0,
        z0: 0.0,
        z1: 0.0,
    }
}

mod clear_collision_pair_tests3d {
    use super::*;

    #[test]
    fn removes_all_registered_pair_tests() {
        let mut registry = crate::collision_registry3d();
        register_collision_pair_test3d(&mut registry, "sphere", "sphere", Arc::new(|_, _, _| true));
        clear_collision_pair_tests3d(&mut registry);
        assert!(get_collision_pair_test3d(&registry, "sphere", "sphere").is_none());
    }
}

mod clear_collision_supports3d {
    use super::*;

    #[test]
    fn removes_all_registered_support_functions() {
        let mut registry = crate::collision_registry3d();
        register_built_in_collision_supports3d(&mut registry);
        clear_collision_supports3d(&mut registry);
        assert!(get_collision_support3d(&registry, "sphere").is_none());
    }
}

mod get_collision_pair_test3d {
    use super::*;

    #[test]
    fn keeps_ordered_and_prefix_related_kind_pairs_distinct() {
        let mut registry = crate::collision_registry3d();
        let first: CollisionPairTest3D = Arc::new(|_, _, _| true);
        let second: CollisionPairTest3D = Arc::new(|_, _, _| false);
        register_collision_pair_test3d(&mut registry, "a.b", "c.d", first.clone());
        register_collision_pair_test3d(&mut registry, "a.bc", ".d", second.clone());
        assert!(Arc::ptr_eq(
            get_collision_pair_test3d(&registry, "a.b", "c.d").unwrap(),
            &first
        ));
        assert!(Arc::ptr_eq(
            get_collision_pair_test3d(&registry, "a.bc", ".d").unwrap(),
            &second
        ));
        assert!(get_collision_pair_test3d(&registry, "c.d", "a.b").is_none());
    }
}

mod get_collision_support3d {
    use super::*;

    #[test]
    fn returns_the_registered_callback_and_none_for_an_unregistered_kind() {
        let mut registry = crate::collision_registry3d();
        register_built_in_collision_supports3d(&mut registry);
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 2.0,
        });
        let mut out = [0.0_f32; 3];
        get_collision_support3d(&registry, "sphere").unwrap()(&sphere, 0.0, 0.0, 1.0, &mut out);
        assert_eq!(out, [0.0, 0.0, 2.0]);
        assert!(get_collision_support3d(&registry, "acme.unknown").is_none());
    }
}

mod has_collision_support3d {
    use super::*;

    #[test]
    fn reports_only_entries_in_the_caller_owned_registry() {
        let mut registry = crate::collision_registry3d();
        assert!(!has_collision_support3d(&registry, "sphere"));
        register_built_in_collision_supports3d(&mut registry);
        assert!(has_collision_support3d(&registry, "sphere"));
        assert!(!has_collision_support3d(&registry, "triangle-mesh"));
    }
}

mod register_built_in_collision_supports3d {
    use super::*;

    #[test]
    fn registers_exactly_the_convex_built_ins_and_no_area_less_or_concave_kind() {
        let mut registry = crate::collision_registry3d();
        register_built_in_collision_supports3d(&mut registry);
        assert_eq!(registry.supports.len(), 7);
        for kind in [
            "aabb", "box", "capsule", "cone", "convex", "cylinder", "sphere",
        ] {
            assert!(has_collision_support3d(&registry, kind));
        }
        assert!(!has_collision_support3d(&registry, "triangle-mesh"));
        assert!(!has_collision_support3d(&registry, "heightfield"));
    }
}

mod register_collision_pair_test3d {
    use super::*;

    #[test]
    fn uses_custom_kinds_and_last_write_wins() {
        let mut registry = crate::collision_registry3d();
        register_collision_pair_test3d(
            &mut registry,
            "acme.left",
            "acme.right",
            Arc::new(|_, _, _| false),
        );
        register_collision_pair_test3d(
            &mut registry,
            "acme.left",
            "acme.right",
            Arc::new(|_, _, _| true),
        );
        let shape = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        let mut out = create_collision_manifold3d();
        assert!(get_collision_pair_test3d(
            &registry,
            "acme.left",
            "acme.right"
        )
        .unwrap()(&shape, &shape, &mut out,));
        assert_eq!(registry.pair_tests.len(), 1);
    }
}

mod register_collision_support3d {
    use super::*;

    #[test]
    fn invokes_the_last_callback_registered_for_a_custom_kind() {
        let mut registry = crate::collision_registry3d();
        register_collision_support3d(
            &mut registry,
            "acme.shape",
            Arc::new(|_, _, _, _, out| out[0] = 1.0),
        );
        register_collision_support3d(
            &mut registry,
            "acme.shape",
            Arc::new(|_, _, _, _, out| out[0] = 2.0),
        );
        let shape = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        let mut out = [0.0_f32; 3];
        get_collision_support3d(&registry, "acme.shape").unwrap()(&shape, 0.0, 0.0, 0.0, &mut out);
        assert_eq!(out[0], 2.0);
        assert_eq!(registry.supports.len(), 1);
    }
}

mod support_collision_aabb3d {
    use super::*;

    #[test]
    fn picks_the_corner_the_direction_signs_select() {
        let aabb = CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        };
        let mut out = [0.0_f32; 3];

        support_collision_aabb3d(&aabb, 1.0, 1.0, 1.0, &mut out);
        assert_eq!(out, [1.0, 2.0, 3.0]);

        support_collision_aabb3d(&aabb, -1.0, -1.0, -1.0, &mut out);
        assert_eq!(out, [-1.0, -2.0, -3.0]);

        support_collision_aabb3d(&aabb, 1.0, -1.0, 1.0, &mut out);
        assert_eq!(out, [1.0, -2.0, 3.0]);
    }
}

mod support_collision_box3d {
    use super::*;

    #[test]
    fn matches_an_aabb_when_the_rotation_is_identity() {
        let b = CollisionBox3D {
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
        };
        let mut out = [0.0_f32; 3];
        support_collision_box3d(&b, 1.0, 1.0, 1.0, &mut out);
        assert!((out[0] - 1.0).abs() < 5e-13);
        assert!((out[1] - 2.0).abs() < 5e-13);
        assert!((out[2] - 3.0).abs() < 5e-13);
    }

    #[test]
    fn reaches_the_spun_corner_for_a_box_rotated_45_degrees_about_z() {
        let b = CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: (std::f32::consts::PI / 8.0).sin(),
            rotation_w: (std::f32::consts::PI / 8.0).cos(),
        };
        let mut out = [0.0_f32; 3];
        support_collision_box3d(&b, 1.0, 0.0, 0.0, &mut out);
        assert!((out[0] - std::f32::consts::SQRT_2).abs() < 1e-10);
    }

    #[test]
    fn honours_the_centre_offset() {
        let b = CollisionBox3D {
            x: 10.0,
            y: 20.0,
            z: 30.0,
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        };
        let mut out = [0.0_f32; 3];
        support_collision_box3d(&b, 1.0, 1.0, 1.0, &mut out);
        assert!((out[0] - 11.0).abs() < 5e-13);
        assert!((out[1] - 21.0).abs() < 5e-13);
        assert!((out[2] - 31.0).abs() < 5e-13);
    }
}

mod support_collision_capsule3d {
    use super::*;

    #[test]
    fn takes_the_further_endpoint_and_pushes_one_radius_along_the_direction() {
        let capsule = CollisionCapsule3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 4.0,
            z1: 0.0,
            radius: 0.5,
        };
        let mut out = [0.0_f32; 3];
        support_collision_capsule3d(&capsule, 0.0, 1.0, 0.0, &mut out);
        assert_eq!(out, [0.0, 4.5, 0.0]);
        support_collision_capsule3d(&capsule, 0.0, -1.0, 0.0, &mut out);
        assert_eq!(out, [0.0, -0.5, 0.0]);
    }

    #[test]
    fn degenerates_to_a_sphere_when_the_segment_has_zero_length() {
        let capsule = CollisionCapsule3D {
            x0: 1.0,
            y0: 1.0,
            z0: 1.0,
            x1: 1.0,
            y1: 1.0,
            z1: 1.0,
            radius: 2.0,
        };
        let mut out = [0.0_f32; 3];
        support_collision_capsule3d(&capsule, 1.0, 0.0, 0.0, &mut out);
        assert_eq!(out, [3.0, 1.0, 1.0]);
    }

    #[test]
    fn returns_an_endpoint_for_a_zero_direction_rather_than_dividing_by_zero() {
        let capsule = CollisionCapsule3D {
            x0: 5.0,
            y0: 6.0,
            z0: 7.0,
            x1: 8.0,
            y1: 9.0,
            z1: 10.0,
            radius: 1.0,
        };
        let mut out = [0.0_f32; 3];
        support_collision_capsule3d(&capsule, 0.0, 0.0, 0.0, &mut out);
        assert!(out.iter().all(|v| v.is_finite()));
    }
}

mod support_collision_cone3d {
    use super::*;

    #[test]
    fn returns_the_apex_when_the_direction_favours_it_and_a_rim_point_otherwise() {
        let cone = cone_inner();
        let mut out = [0.0_f32; 3];

        support_collision_cone3d(&cone, 0.0, 1.0, 0.0, &mut out);
        assert_eq!(out, [0.0, 3.0, 0.0]);

        support_collision_cone3d(&cone, 1.0, 0.0, 0.0, &mut out);
        assert!((out[0] - 1.5).abs() < 1e-10);
        assert!((out[1] - 0.0).abs() < 1e-10);
    }

    #[test]
    fn agrees_with_containment_the_support_point_is_never_outside_the_shape() {
        let cone = cone_inner();
        let shape = cone_shape();
        let mut random = Xorshift::new(4242);
        let mut out = [0.0_f32; 3];
        for i in 0..300 {
            support_collision_cone3d(
                &cone,
                random.next() - 0.5,
                random.next() - 0.5,
                random.next() - 0.5,
                &mut out,
            );
            // Pull slightly toward the centroid (at y = 0.75 * 3 = 2.25 for base-apex).
            let toward_x = -out[0] * 1e-6;
            let toward_y = (0.75 * 3.0 - out[1]) * 1e-6;
            let toward_z = -out[2] * 1e-6;
            assert!(
                get_collision_shape_contains_point3d(
                    &shape,
                    out[0] + toward_x,
                    out[1] + toward_y,
                    out[2] + toward_z,
                ),
                "direction {} produced {},{},{}",
                i,
                out[0],
                out[1],
                out[2]
            );
        }
    }
}

mod support_collision_convex3d {
    use super::*;

    #[test]
    fn finds_the_furthest_vertex_of_a_hull() {
        let hull = CollisionConvex3D {
            points: vec![0.0, 0.0, 0.0, 5.0, 0.0, 0.0, 0.0, 5.0, 0.0, 0.0, 0.0, 5.0],
        };
        let mut out = [0.0_f32; 3];
        support_collision_convex3d(&hull, 1.0, 0.0, 0.0, &mut out);
        assert_eq!(out, [5.0, 0.0, 0.0]);
        support_collision_convex3d(&hull, 0.0, 0.0, 1.0, &mut out);
        assert_eq!(out, [0.0, 0.0, 5.0]);
    }
}

mod support_collision_cylinder3d {
    use super::*;

    #[test]
    fn returns_a_flat_cap_rim_rather_than_a_rounded_offset() {
        let cyl = cylinder_inner();
        let mut out = [0.0_f32; 3];
        support_collision_cylinder3d(&cyl, 1.0, 1.0, 0.0, &mut out);
        assert!((out[1] - 2.0).abs() < 1e-10);
        assert!((out[0] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn returns_the_cap_centre_when_the_direction_is_along_the_axis() {
        let cyl = cylinder_inner();
        let mut out = [0.0_f32; 3];
        support_collision_cylinder3d(&cyl, 0.0, 1.0, 0.0, &mut out);
        assert_eq!(out, [0.0, 2.0, 0.0]);
    }
}

mod support_collision_sphere3d {
    use super::*;

    #[test]
    fn pushes_the_centre_one_radius_along_a_normalized_direction() {
        let ball = CollisionSphere3D {
            x: 1.0,
            y: 2.0,
            z: 3.0,
            radius: 2.0,
        };
        let mut out = [0.0_f32; 3];
        support_collision_sphere3d(&ball, 1.0, 0.0, 0.0, &mut out);
        assert_eq!(out, [3.0, 2.0, 3.0]);
    }

    #[test]
    fn normalizes_an_unnormalized_direction() {
        let ball = CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        };
        let mut out = [0.0_f32; 3];
        support_collision_sphere3d(&ball, 100.0, 0.0, 0.0, &mut out);
        assert_eq!(out, [1.0, 0.0, 0.0]);
    }

    #[test]
    fn returns_the_centre_for_a_zero_direction_rather_than_dividing_by_zero() {
        let ball = CollisionSphere3D {
            x: 4.0,
            y: 5.0,
            z: 6.0,
            radius: 1.0,
        };
        let mut out = [0.0_f32; 3];
        support_collision_sphere3d(&ball, 0.0, 0.0, 0.0, &mut out);
        assert_eq!(out, [4.0, 5.0, 6.0]);
    }
}

mod write_vertex_list_support3d {
    use super::*;

    #[test]
    fn reads_a_flat_triple_list_and_returns_the_furthest_point() {
        let vertices = [0.0, 0.0, 0.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0];
        let mut out = [0.0_f32; 3];
        write_vertex_list_support3d(&vertices, 3, 1.0, 1.0, 1.0, &mut out);
        assert_eq!(out, [1.0, 1.0, 1.0]);
        write_vertex_list_support3d(&vertices, 3, -1.0, -1.0, -1.0, &mut out);
        assert_eq!(out, [-1.0, -1.0, -1.0]);
    }

    #[test]
    fn returns_the_first_vertex_when_a_single_one_is_offered() {
        let vertices = [7.0, 8.0, 9.0];
        let mut out = [0.0_f32; 3];
        write_vertex_list_support3d(&vertices, 1, 1.0, 0.0, 0.0, &mut out);
        assert_eq!(out, [7.0, 8.0, 9.0]);
    }
}
