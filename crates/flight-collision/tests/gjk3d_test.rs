use flight_collision::contract::*;

fn sphere(x: f32, y: f32, z: f32, radius: f32) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D { x, y, z, radius })
}

fn aabb(min_x: f32, min_y: f32, min_z: f32, size: f32) -> CollisionShape3D {
    CollisionShape3D::Aabb(CollisionAabb3D {
        min_x,
        min_y,
        min_z,
        max_x: min_x + size,
        max_y: min_y + size,
        max_z: min_z + size,
    })
}

fn translate_shape(shape: &CollisionShape3D, dx: f32, dy: f32, dz: f32) -> CollisionShape3D {
    match shape {
        CollisionShape3D::Sphere(s) => CollisionShape3D::Sphere(CollisionSphere3D {
            x: s.x + dx,
            y: s.y + dy,
            z: s.z + dz,
            radius: s.radius,
        }),
        CollisionShape3D::Aabb(a) => CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: a.min_x + dx,
            min_y: a.min_y + dy,
            min_z: a.min_z + dz,
            max_x: a.max_x + dx,
            max_y: a.max_y + dy,
            max_z: a.max_z + dz,
        }),
        CollisionShape3D::Capsule(c) => CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: c.x0 + dx,
            y0: c.y0 + dy,
            z0: c.z0 + dz,
            x1: c.x1 + dx,
            y1: c.y1 + dy,
            z1: c.z1 + dz,
            radius: c.radius,
        }),
        CollisionShape3D::Box(b) => CollisionShape3D::Box(CollisionBox3D {
            x: b.x + dx,
            y: b.y + dy,
            z: b.z + dz,
            ..*b
        }),
        CollisionShape3D::Convex(c) => {
            let mut points = c.points.clone();
            let mut i = 0;
            while i < points.len() {
                points[i] += dx;
                points[i + 1] += dy;
                points[i + 2] += dz;
                i += 3;
            }
            CollisionShape3D::Convex(CollisionConvex3D { points })
        }
        _ => panic!("untranslatable kind"),
    }
}

fn expect_minimum_translation_separates(
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    manifold: &CollisionManifold3D,
    margin: f32,
) {
    let clear_by = manifold.depth + margin;
    let clear = translate_shape(
        a,
        manifold.normal_x * clear_by,
        manifold.normal_y * clear_by,
        manifold.normal_z * clear_by,
    );
    assert!(
        !test_collision_support_overlap3d(&crate::collision_registry3d_with_supports(), &clear, b),
        "expected separation after translating by depth + margin: a={a:?} b={b:?} manifold={manifold:?} margin={margin}"
    );

    let short_by = manifold.depth - margin.max(1e-3) * 10.0;
    let short = translate_shape(
        a,
        manifold.normal_x * short_by,
        manifold.normal_y * short_by,
        manifold.normal_z * short_by,
    );
    assert!(
        test_collision_support_overlap3d(&crate::collision_registry3d_with_supports(), &short, b),
        "expected overlap after translating by less than depth"
    );
}

mod test_collision_support3d {
    use super::*;

    #[test]
    fn pushes_an_aabb_up_from_a_floor_with_the_shallow_penetration() {
        let floor = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -20.0,
            min_y: -2.0,
            min_z: -20.0,
            max_x: 20.0,
            max_y: 0.0,
            max_z: 20.0,
        });
        let body = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -0.5,
            min_y: -0.002_777_79,
            min_z: -0.5,
            max_x: 0.5,
            max_y: 0.997_222_2,
            max_z: 0.5,
        });
        let mut out = create_collision_manifold3d();
        assert!(test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &floor,
            &body,
            &mut out,
        ));
        assert_eq!((out.normal_x, out.normal_y, out.normal_z), (0.0, -1.0, 0.0));
        assert!((out.depth - 0.002_777_79).abs() < 1e-6, "{}", out.depth);
    }

    #[test]
    fn pushes_a_box_up_from_a_floor_with_the_shallow_penetration() {
        let floor = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: -1.0,
            z: 0.0,
            half_x: 20.0,
            half_y: 1.0,
            half_z: 20.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        });
        let body = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.497_222_21,
            z: 0.0,
            half_x: 0.5,
            half_y: 0.5,
            half_z: 0.5,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        });
        let mut out = create_collision_manifold3d();
        assert!(test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &floor,
            &body,
            &mut out,
        ));
        assert_eq!((out.normal_x, out.normal_y, out.normal_z), (0.0, -1.0, 0.0));
        assert!((out.depth - 0.002_777_79).abs() < 1e-6, "{}", out.depth);
    }

    #[test]
    fn reports_the_depth_and_axis_for_two_overlapping_spheres_to_curved_surface_accuracy() {
        let mut out = create_collision_manifold3d();
        assert!(test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(1.5, 0.0, 0.0, 1.0),
            &mut out,
        ));
        assert!(out.overlapping);
        assert!((out.depth - 0.5).abs() < 5e-5, "depth={}", out.depth);
        assert!((out.normal_x + 1.0).abs() < 5e-2, "normal={:?}", out);
        assert!(out.normal_y.abs() < 5e-2, "normal={:?}", out);
        assert!(out.normal_z.abs() < 5e-2, "normal={:?}", out);
    }

    #[test]
    fn is_exact_on_polytopes_where_the_minkowski_difference_is_itself_a_polytope() {
        let mut out = create_collision_manifold3d();
        assert!(test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &aabb(0.0, 0.0, 0.0, 2.0),
            &aabb(1.5, 0.0, 0.0, 2.0),
            &mut out,
        ));
        assert_eq!(out.depth, 0.5);
        assert_eq!(out.normal_x, -1.0);

        assert!(test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &aabb(0.0, 0.0, 0.0, 2.0),
            &aabb(1.25, 0.0, 0.0, 2.0),
            &mut out,
        ));
        assert_eq!(out.depth, 0.75);
    }

    #[test]
    fn produces_a_unit_normal() {
        let mut out = create_collision_manifold3d();
        test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.7, 0.7, 0.7, 1.0),
            &mut out,
        );
        let length = (out.normal_x * out.normal_x
            + out.normal_y * out.normal_y
            + out.normal_z * out.normal_z)
            .sqrt();
        assert!((length - 1.0).abs() < 5e-7);
    }

    #[test]
    fn writes_a_minimum_translation_that_actually_separates_each_overlapping_pair() {
        let flat = 1e-6;
        let curved = 1e-4;
        let cases: Vec<(CollisionShape3D, CollisionShape3D, f32)> = vec![
            (
                sphere(0.0, 0.0, 0.0, 1.0),
                sphere(1.5, 0.0, 0.0, 1.0),
                curved,
            ),
            (
                sphere(0.0, 0.0, 0.0, 1.0),
                sphere(0.5, 0.4, 0.3, 1.0),
                curved,
            ),
            (aabb(0.0, 0.0, 0.0, 2.0), aabb(1.5, 0.2, 0.2, 2.0), flat),
            (aabb(0.0, 0.0, 0.0, 2.0), sphere(2.5, 1.0, 1.0, 1.0), curved),
            (
                CollisionShape3D::Capsule(CollisionCapsule3D {
                    x0: 0.0,
                    y0: 0.0,
                    z0: 0.0,
                    x1: 0.0,
                    y1: 2.0,
                    z1: 0.0,
                    radius: 0.5,
                }),
                CollisionShape3D::Capsule(CollisionCapsule3D {
                    x0: 0.6,
                    y0: 0.0,
                    z0: 0.0,
                    x1: 0.6,
                    y1: 2.0,
                    z1: 0.0,
                    radius: 0.5,
                }),
                curved,
            ),
            (
                aabb(0.0, 0.0, 0.0, 2.0),
                CollisionShape3D::Capsule(CollisionCapsule3D {
                    x0: 2.4,
                    y0: 1.0,
                    z0: 1.0,
                    x1: 2.4,
                    y1: 3.0,
                    z1: 1.0,
                    radius: 0.5,
                }),
                curved,
            ),
            (
                CollisionShape3D::Convex(CollisionConvex3D {
                    points: vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0],
                }),
                aabb(1.5, -1.0, -1.0, 2.0),
                flat,
            ),
        ];
        for (a, b, margin) in &cases {
            let mut out = create_collision_manifold3d();
            assert!(test_collision_support3d(
                &crate::collision_registry3d_with_supports(),
                a,
                b,
                &mut out
            ));
            expect_minimum_translation_separates(a, b, &out, *margin);
        }
    }

    #[test]
    fn returns_false_and_clears_the_manifold_for_a_disjoint_pair() {
        let mut out = create_collision_manifold3d();
        out.overlapping = true;
        out.normal_x = 9.0;
        out.depth = 9.0;
        assert!(!test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            &mut out,
        ));
        assert!(!out.overlapping);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.normal_z, 0.0);
        assert_eq!(out.depth, 0.0);
    }

    #[test]
    fn handles_a_box_rotated_about_z_using_its_oriented_corners() {
        let mut out = create_collision_manifold3d();
        let half_turn = std::f32::consts::FRAC_1_SQRT_2;
        let rotated = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 0.5,
            half_y: 0.5,
            half_z: 0.5,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: (std::f32::consts::PI / 8.0).sin(),
            rotation_w: (std::f32::consts::PI / 8.0).cos(),
        });
        assert!(test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &rotated,
            &sphere(1.15, 0.0, 0.0, 0.5),
            &mut out,
        ));
        assert!(!test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &rotated,
            &sphere(1.35, 0.0, 0.0, 0.5),
            &mut out,
        ));
        assert!((half_turn - 0.7071).abs() < 1e-3);
    }

    #[test]
    fn finds_a_convex_hull_overlap_through_its_vertex_support() {
        let mut out = create_collision_manifold3d();
        let tetra = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0],
        });
        assert!(test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &tetra,
            &sphere(0.3, 0.3, 0.3, 0.5),
            &mut out,
        ));
        assert!(!test_collision_support3d(
            &crate::collision_registry3d_with_supports(),
            &tetra,
            &sphere(5.0, 5.0, 5.0, 0.5),
            &mut out,
        ));
    }
}

mod test_collision_support_overlap3d {
    use super::*;

    #[test]
    fn separates_a_clearly_disjoint_pair() {
        assert!(!test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(5.0, 0.0, 0.0, 1.0),
        ));
    }

    #[test]
    fn reports_a_deep_overlap() {
        assert!(test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.1, 0.0, 0.0, 1.0),
        ));
    }

    #[test]
    fn treats_exact_touching_as_separated() {
        assert!(!test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(2.0, 0.0, 0.0, 1.0),
        ));
        assert!(!test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &aabb(0.0, 0.0, 0.0, 1.0),
            &aabb(1.0, 0.0, 0.0, 1.0),
        ));
    }

    #[test]
    fn finds_an_overlap_when_the_centres_share_an_axis_the_collinear_case() {
        assert!(test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(1.0, 0.0, 0.0, 1.0),
        ));
        assert!(test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.0, 1.0, 0.0, 1.0),
        ));
        assert!(test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.0, 0.0, 1.0, 1.0),
        ));
    }

    #[test]
    fn finds_an_overlap_when_the_two_shapes_are_exactly_concentric() {
        assert!(test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.0, 0.0, 0.0, 1.0),
        ));
        assert!(test_collision_support_overlap3d(
            &crate::collision_registry3d_with_supports(),
            &aabb(0.0, 0.0, 0.0, 2.0),
            &aabb(0.0, 0.0, 0.0, 2.0),
        ));
    }

    #[test]
    fn agrees_with_itself_when_the_arguments_are_swapped() {
        let cases: Vec<(CollisionShape3D, CollisionShape3D)> = vec![
            (sphere(0.0, 0.0, 0.0, 1.0), sphere(1.5, 0.0, 0.0, 1.0)),
            (sphere(0.0, 0.0, 0.0, 1.0), sphere(9.0, 0.0, 0.0, 1.0)),
            (aabb(0.0, 0.0, 0.0, 2.0), aabb(1.5, 1.5, 1.5, 2.0)),
            (aabb(0.0, 0.0, 0.0, 2.0), sphere(3.5, 1.0, 1.0, 1.0)),
        ];
        for (a, b) in &cases {
            assert_eq!(
                test_collision_support_overlap3d(
                    &crate::collision_registry3d_with_supports(),
                    a,
                    b
                ),
                test_collision_support_overlap3d(
                    &crate::collision_registry3d_with_supports(),
                    b,
                    a
                ),
            );
        }
    }
}
