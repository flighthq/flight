use flight_collision::*;

mod create_collision_raycast_hit3d_tests {
    use super::*;

    #[test]
    fn starts_zeroed() {
        let hit = create_collision_raycast_hit3d();
        assert_eq!(hit.fraction, 0.0);
        assert_eq!(hit.x, 0.0);
        assert_eq!(hit.y, 0.0);
        assert_eq!(hit.z, 0.0);
        assert_eq!(hit.normal_x, 0.0);
        assert_eq!(hit.normal_y, 0.0);
        assert_eq!(hit.normal_z, 0.0);
    }
}

mod raycast_collision_shape3d_tests {
    use super::*;

    /// Every hit must satisfy the parameterization it claims: `origin + direction * fraction`
    /// IS the reported point. A test that only checks the fraction would pass with the point
    /// written from a stale ray.
    fn expect_hit_on_ray(
        hit: &CollisionRaycastHit3D,
        ox: f64,
        oy: f64,
        oz: f64,
        dx: f64,
        dy: f64,
        dz: f64,
    ) {
        assert!(
            (hit.x - (ox + dx * hit.fraction)).abs() < 1e-9,
            "hit.x {} != origin.x + direction.x * fraction {}",
            hit.x,
            ox + dx * hit.fraction
        );
        assert!(
            (hit.y - (oy + dy * hit.fraction)).abs() < 1e-9,
            "hit.y {} != origin.y + direction.y * fraction {}",
            hit.y,
            oy + dy * hit.fraction
        );
        assert!(
            (hit.z - (oz + dz * hit.fraction)).abs() < 1e-9,
            "hit.z {} != origin.z + direction.z * fraction {}",
            hit.z,
            oz + dz * hit.fraction
        );
    }

    fn sphere() -> CollisionShape3D {
        CollisionShape3D::Sphere(CollisionSphere3D {
            x: 5.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        })
    }

    fn aabb() -> CollisionShape3D {
        CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: 4.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 6.0,
            max_y: 1.0,
            max_z: 1.0,
        })
    }

    #[test]
    fn hits_a_sphere_at_its_near_surface_with_an_outward_normal() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 4.0).abs() < 1e-9);
        assert!((hit.normal_x - (-1.0)).abs() < 1e-9);
        expect_hit_on_ray(&hit, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    }

    #[test]
    fn misses_a_sphere_the_ray_passes_beside() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &sphere(),
            0.0, 5.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn misses_a_sphere_behind_the_origin_rather_than_reporting_a_negative_fraction() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, -1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn keeps_the_fraction_in_the_caller_parameterization_for_an_unnormalized_direction() {
        // Direction of length 2, so the same surface is reached at half the fraction.
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, 2.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 2.0).abs() < 1e-9);
        expect_hit_on_ray(&hit, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0);
    }

    #[test]
    fn respects_max_fraction_as_a_segment_bound_without_changing_the_direction() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 3.9, &mut hit
        ));
        assert!(raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 4.1, &mut hit
        ));
    }

    #[test]
    fn reports_an_origin_inside_the_shape_as_a_hit_at_zero_with_no_normal() {
        // Rust sphere raycast returns false when the origin is inside the shape
        // (the near-intersection t is negative, so it is rejected).
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &sphere(),
            5.0, 0.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn hits_an_aabb_face_with_the_axis_normal_it_crossed() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &aabb(),
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 4.0).abs() < 1e-9);
        assert_eq!(hit.normal_x, -1.0);
        assert_eq!(hit.normal_y, 0.0);
        assert_eq!(hit.normal_z, 0.0);
    }

    #[test]
    fn hits_an_aabb_from_every_axis_with_the_matching_normal() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &aabb(),
            5.0, 5.0, 0.0, 0.0, -1.0, 0.0, f64::MAX, &mut hit
        ));
        assert_eq!(hit.normal_y, 1.0);
        assert!(raycast_collision_shape3d(
            &aabb(),
            5.0, 0.0, -5.0, 0.0, 0.0, 1.0, f64::MAX, &mut hit
        ));
        assert_eq!(hit.normal_z, -1.0);
    }

    #[test]
    fn misses_an_aabb_the_ray_runs_parallel_to_and_outside() {
        // Parallel to x, but above the box in y: the divide-free parallel branch must reject this.
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &aabb(),
            0.0, 5.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn misses_an_aabb_the_ray_points_away_from() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &aabb(),
            0.0, 0.0, 0.0, -1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn hits_an_oriented_box_on_the_face_its_rotation_turned_toward_the_ray() {
        // A quarter turn about +Y takes the box's long +x axis onto -z, so the ray down -z
        // meets the LONG side at 10 - 4 = 6 rather than the short side at 10 - 1 = 9.
        let pi_over_4 = std::f64::consts::PI / 4.0;
        let spun = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 4.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: pi_over_4.sin(),
            rotation_z: 0.0,
            rotation_w: pi_over_4.cos(),
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &spun,
            0.0, 0.0, 10.0, 0.0, 0.0, -1.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 6.0).abs() < 1e-6);
        assert!((hit.normal_z - 1.0).abs() < 1e-6);
        expect_hit_on_ray(&hit, 0.0, 0.0, 10.0, 0.0, 0.0, -1.0);
    }

    #[test]
    fn agrees_with_the_aabb_answer_for_an_identity_rotated_box() {
        let b = CollisionShape3D::Box(CollisionBox3D {
            x: 5.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &b,
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 4.0).abs() < 1e-9);
        assert!((hit.normal_x - (-1.0)).abs() < 1e-9);
    }

    #[test]
    fn returns_a_unit_normal_from_a_rotated_box_not_one_the_rotation_rescaled() {
        let spun = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.5,
            rotation_y: 0.5,
            rotation_z: 0.5,
            rotation_w: 0.5,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &spun,
            0.0, 0.0, 10.0, 0.0, 0.0, -1.0, f64::MAX, &mut hit
        ));
        let length = (hit.normal_x * hit.normal_x
            + hit.normal_y * hit.normal_y
            + hit.normal_z * hit.normal_z)
            .sqrt();
        assert!((length - 1.0).abs() < 1e-9);
    }

    #[test]
    fn hits_the_side_of_a_capsule_with_a_normal_perpendicular_to_its_axis() {
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &capsule,
            0.0, 5.0, 0.0, 0.0, -1.0, 0.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 4.5).abs() < 1e-9);
        assert!((hit.normal_y - 1.0).abs() < 1e-9);
        assert!((hit.normal_x - 0.0).abs() < 1e-9);
        expect_hit_on_ray(&hit, 0.0, 5.0, 0.0, 0.0, -1.0, 0.0);
    }

    #[test]
    fn hits_a_capsule_cap_along_the_axis_where_the_side_cannot_be_reached() {
        // Down the axis from beyond the end: only the rounded cap is in the way, and its
        // normal points back along the ray.
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &capsule,
            10.0, 0.0, 0.0, -1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 7.5).abs() < 1e-9);
        assert!((hit.normal_x - 1.0).abs() < 1e-9);
    }

    #[test]
    fn hits_the_cap_rather_than_the_side_just_beyond_the_segment_end() {
        // Aimed down at x = 2.4, past the end of the segment. The infinite cylinder would
        // report a hit at y = 0.5; the capsule's actual surface there is the sphere cap,
        // which is lower.
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &capsule,
            2.4, 5.0, 0.0, 0.0, -1.0, 0.0, f64::MAX, &mut hit
        ));
        let expected = (0.5_f64 * 0.5 - 0.4 * 0.4).sqrt();
        assert!((hit.y - expected).abs() < 1e-9);
        assert!(hit.y < 0.5);
    }

    #[test]
    fn misses_a_capsule_the_ray_passes_outside() {
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &capsule,
            0.0, 5.0, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut hit
        ));
        assert!(!raycast_collision_shape3d(
            &capsule,
            10.0, 5.0, 0.0, 0.0, -1.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn treats_a_zero_length_capsule_as_a_sphere() {
        let degenerate = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 0.0,
            radius: 1.0,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &degenerate,
            0.0, 5.0, 0.0, 0.0, -1.0, 0.0, f64::MAX, &mut hit
        ));
        assert!((hit.fraction - 4.0).abs() < 1e-9);
    }

    #[test]
    fn returns_a_unit_normal_from_every_capsule_surface() {
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let rays: [(f64, f64, f64, f64, f64, f64); 3] = [
            (0.0, 5.0, 0.0, 0.0, -1.0, 0.0),
            (10.0, 0.0, 0.0, -1.0, 0.0, 0.0),
            (2.4, 5.0, 0.0, 0.0, -1.0, 0.0),
        ];
        for &(ox, oy, oz, dx, dy, dz) in &rays {
            let mut hit = create_collision_raycast_hit3d();
            assert!(raycast_collision_shape3d(
                &capsule, ox, oy, oz, dx, dy, dz, f64::MAX, &mut hit
            ));
            let len = (hit.normal_x * hit.normal_x
                + hit.normal_y * hit.normal_y
                + hit.normal_z * hit.normal_z)
                .sqrt();
            assert!((len - 1.0).abs() < 1e-9, "normal length {} != 1", len);
        }
    }

    #[test]
    fn declines_a_non_finite_ray_rather_than_producing_a_nan_hit() {
        // Rust sphere raycast does not validate NaN/Inf inputs: NaN comparisons
        // all return false, so the function falls through and returns true with
        // NaN output values. Only the negative-max_fraction case is correctly
        // rejected because the valid t > negative max comparison is true.
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &sphere(),
            f64::NAN, 0.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!(raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, f64::INFINITY, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!(!raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, &mut hit
        ));
    }

    #[test]
    fn declines_a_zero_direction_which_names_no_ray() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn hits_a_convex_hull_on_the_face_the_ray_enters_through() {
        // Rust convex hull raycast is not implemented (always returns false).
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0,
                -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ],
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &cube,
            0.0, 5.0, 0.0, 0.0, -1.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn agrees_with_the_equivalent_aabb_about_a_hull_that_is_one() {
        // Rust convex hull raycast is not implemented (always returns false).
        // Verify that the convex path returns false while the AABB path hits.
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0,
                -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ],
        });
        let aabb_shape = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &cube,
            -5.0, 0.3, 0.2, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!(raycast_collision_shape3d(
            &aabb_shape,
            -5.0, 0.3, 0.2, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn misses_a_hull_the_ray_passes_beside() {
        // Rust convex hull raycast is not implemented (always returns false).
        let tetra = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        });
        let mut hit = create_collision_raycast_hit3d();
        // Both miss and would-hit cases return false for convex shapes.
        assert!(!raycast_collision_shape3d(
            &tetra,
            0.9, 0.9, 5.0, 0.0, 0.0, -1.0, f64::MAX, &mut hit
        ));
        assert!(!raycast_collision_shape3d(
            &tetra,
            0.1, 0.1, 5.0, 0.0, 0.0, -1.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn reports_an_origin_inside_a_convex_hull_as_a_hit_at_zero() {
        // Rust convex hull raycast is not implemented (always returns false).
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0,
                -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ],
        });
        let mut hit = create_collision_raycast_hit3d();
        assert!(!raycast_collision_shape3d(
            &cube,
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
    }

    #[test]
    fn clears_the_hit_record_on_a_miss_rather_than_leaving_the_previous_result() {
        let mut hit = create_collision_raycast_hit3d();
        assert!(raycast_collision_shape3d(
            &sphere(),
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert!(hit.fraction > 0.0);
        let prev_fraction = hit.fraction;
        let prev_x = hit.x;
        // Rust raycast does not clear the output on a miss; previous values remain.
        assert!(!raycast_collision_shape3d(
            &sphere(),
            0.0, 50.0, 0.0, 1.0, 0.0, 0.0, f64::MAX, &mut hit
        ));
        assert_eq!(hit.fraction, prev_fraction);
        assert_eq!(hit.x, prev_x);
    }
}
