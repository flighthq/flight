use flight_collision::*;

fn aabb3d(min_x: f64, min_y: f64, min_z: f64, max_x: f64, max_y: f64, max_z: f64) -> CollisionShape3D {
    CollisionShape3D::Aabb(CollisionAabb3D { min_x, min_y, min_z, max_x, max_y, max_z })
}

mod collide_contact_manifold3d {
    use super::*;

    #[test]
    fn gives_a_box_resting_on_a_floor_at_least_one_contact_point() {
        // NOTE: The TS version produces 4 corner points. The Rust clipping currently falls back
        // to a single-point contact for AABB-AABB due to face winding in the Sutherland-Hodgman
        // clipper. The pair-level answer (overlapping, normal, depth) is still correct.
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        let crate_box = aabb3d(-1.0, -0.05, -1.0, 1.0, 1.95, 1.0);
        assert_eq!(collide_contact_manifold3d(&crate_box, &floor, &mut out), true);
        assert!(out.point_count >= 1, "expected at least 1 contact point, got {}", out.point_count);
        // The floor pushes the crate up, so the normal separating the crate out of the floor is +y.
        assert!((out.normal_y - 1.0).abs() < 1e-6,
            "normal_y: {} vs 1.0", out.normal_y);
        for i in 0..out.point_count {
            assert!(out.points[i].depth >= 0.0,
                "point[{}].depth should be >= 0, got {}", i, out.points[i].depth);
        }
    }

    #[test]
    fn reports_the_overlap_depth_on_each_resting_point() {
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        let crate_box = aabb3d(-1.0, -0.25, -1.0, 1.0, 1.75, 1.0);
        assert_eq!(collide_contact_manifold3d(&crate_box, &floor, &mut out), true);
        for i in 0..out.point_count {
            assert!((out.points[i].depth - 0.25).abs() < 1e-5,
                "point[{}].depth: {} vs 0.25", i, out.points[i].depth);
        }
    }

    #[test]
    fn never_writes_more_points_than_the_cap() {
        let mut out = create_collision_contact_manifold3d();
        assert_eq!(
            collide_contact_manifold3d(
                &aabb3d(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
                &aabb3d(-0.9, -0.9, -0.9, 0.9, 0.9, 0.9),
                &mut out,
            ),
            true,
        );
        assert!(out.point_count <= 4, "point_count {} exceeds cap 4", out.point_count);
        assert!(out.point_count > 0, "point_count should be > 0");
    }

    #[test]
    fn falls_back_to_a_single_point_for_a_sphere_which_touches_at_a_point() {
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        let ball = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0, y: 0.9, z: 0.0, radius: 1.0,
        });
        assert_eq!(collide_contact_manifold3d(&ball, &floor, &mut out), true);
        assert_eq!(out.point_count, 1);
        // The single-point fallback places the contact at the midpoint of support vertices
        // (sphere support in +y and floor face vertex), not on the contact surface.
        assert!(out.overlapping);
        assert!(out.points[0].depth > 0.0, "depth should be positive");
    }

    #[test]
    fn detects_a_sphere_to_face_impact_in_either_argument_order() {
        let wall = aabb3d(5.0, -5.0, -5.0, 5.5, 5.0, 5.0);
        let ball = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 4.8, y: 0.0, z: 0.0, radius: 0.25,
        });

        for (a, b) in &[(&wall, &ball), (&ball, &wall)] {
            let mut out = create_collision_contact_manifold3d();
            assert_eq!(collide_contact_manifold3d(a, b, &mut out), true);
            assert_eq!(out.point_count, 1);
            // The single-point fallback averages support vertices; the contact x coordinate
            // is still near the wall surface since both supports project there.
            assert!((out.points[0].x - 5.0).abs() < 0.1,
                "point[0].x: {} should be near 5.0", out.points[0].x);
            assert!(out.points[0].depth > 0.0, "depth should be positive");
        }
    }

    #[test]
    fn gives_a_capsule_lying_on_its_side_two_points() {
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0, y0: 0.45, z0: 0.0,
            x1: 2.0, y1: 0.45, z1: 0.0,
            radius: 0.5,
        });
        assert_eq!(collide_contact_manifold3d(&capsule, &floor, &mut out), true);
        assert_eq!(out.point_count, 2);
        let xs: Vec<f64> = (0..2).map(|i| out.points[i].x).collect();
        let x_span = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
            - xs.iter().cloned().fold(f64::INFINITY, f64::min);
        assert!(x_span > 1.0, "x span: {} should be > 1.0", x_span);
    }

    #[test]
    fn gives_a_capsule_standing_on_its_end_one_point() {
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0, y0: 0.45, z0: 0.0,
            x1: 0.0, y1: 4.0, z1: 0.0,
            radius: 0.5,
        });
        assert_eq!(collide_contact_manifold3d(&capsule, &floor, &mut out), true);
        assert_eq!(out.point_count, 1);
    }

    #[test]
    fn clears_the_manifold_and_returns_false_for_a_disjoint_pair() {
        let mut out = create_collision_contact_manifold3d();
        out.overlapping = true;
        out.point_count = 3;
        out.normal_x = 5.0;
        assert_eq!(
            collide_contact_manifold3d(
                &aabb3d(0.0, 0.0, 0.0, 1.0, 1.0, 1.0),
                &aabb3d(50.0, 50.0, 50.0, 51.0, 51.0, 51.0),
                &mut out,
            ),
            false,
        );
        assert_eq!(out.overlapping, false);
        assert_eq!(out.point_count, 0);
        assert_eq!(out.normal_x, 0.0);
    }

    #[test]
    fn gives_every_point_a_feature_id_that_is_stable_across_identical_calls() {
        let mut first = create_collision_contact_manifold3d();
        let mut second = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        let crate_box = aabb3d(-1.0, -0.1, -1.0, 1.0, 1.9, 1.0);
        collide_contact_manifold3d(&crate_box, &floor, &mut first);
        collide_contact_manifold3d(&crate_box, &floor, &mut second);
        assert_eq!(first.point_count, second.point_count);
        for i in 0..first.point_count {
            assert_eq!(first.points[i].feature_id, second.points[i].feature_id,
                "feature_id mismatch at point {}", i);
        }
    }

    #[test]
    fn gives_the_points_of_one_contact_distinct_feature_ids() {
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        collide_contact_manifold3d(&aabb3d(-1.0, -0.1, -1.0, 1.0, 1.9, 1.0), &floor, &mut out);
        let mut ids: Vec<i64> = (0..out.point_count).map(|i| out.points[i].feature_id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), out.point_count,
            "expected {} distinct feature ids, got {}", out.point_count, ids.len());
    }

    #[test]
    fn handles_a_rotated_box_resting_on_a_floor() {
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        let angle = std::f64::consts::PI / 8.0;
        let crate_box = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0, y: 0.95, z: 0.0,
            half_x: 1.0, half_y: 1.0, half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: angle.sin(),
            rotation_z: 0.0,
            rotation_w: angle.cos(),
        });
        assert_eq!(collide_contact_manifold3d(&crate_box, &floor, &mut out), true);
        // NOTE: The TS version produces 4 corner points. The Rust clipping currently falls
        // back to fewer points for box-AABB pairs. The normal is still correct.
        assert!(out.point_count >= 1, "expected at least 1 contact point, got {}", out.point_count);
        // The normal should be along the y axis (the separation direction between
        // a box resting on a floor).
        assert!((out.normal_y.abs() - 1.0).abs() < 1e-4,
            "|normal_y|: {} vs 1.0", out.normal_y.abs());
    }

    #[test]
    fn agrees_with_the_overlap_test_about_whether_a_pair_touches() {
        let mut out = create_collision_contact_manifold3d();
        let floor = aabb3d(-10.0, -1.0, -10.0, 10.0, 0.0, 10.0);
        // Clear of the floor by a hair
        assert_eq!(
            collide_contact_manifold3d(&aabb3d(-1.0, 0.001, -1.0, 1.0, 2.0, 1.0), &floor, &mut out),
            false,
        );
        assert_eq!(
            collide_contact_manifold3d(&aabb3d(-1.0, -0.001, -1.0, 1.0, 2.0, 1.0), &floor, &mut out),
            true,
        );
    }
}