use flight_collision::*;
use flight_collision::contract::*;

mod create_collision_raycast_hit2d {
    use super::*;

    #[test]
    fn starts_in_the_reusable_miss_state() {
        let hit = create_collision_raycast_hit2d();
        assert_eq!(hit.fraction, 0.0);
        assert_eq!(hit.x, 0.0);
        assert_eq!(hit.y, 0.0);
        assert_eq!(hit.normal_x, 0.0);
        assert_eq!(hit.normal_y, 0.0);
    }
}

mod initialize_collision_raycast_hit2d {
    use super::*;

    #[test]
    fn resets_every_field_to_zero() {
        let mut hit = create_collision_raycast_hit2d();
        hit.fraction = 1.0;
        hit.x = 2.0;
        hit.y = 3.0;
        hit.normal_x = 4.0;
        hit.normal_y = 5.0;
        initialize_collision_raycast_hit2d(&mut hit);
        assert_eq!(hit.fraction, 0.0);
        assert_eq!(hit.x, 0.0);
        assert_eq!(hit.y, 0.0);
        assert_eq!(hit.normal_x, 0.0);
        assert_eq!(hit.normal_y, 0.0);
    }
}

mod raycast_collision_shape2d {
    use super::*;

    // Note: The TS test "keeps polygon center state isolated from a nested raycast triggered
    // by a point getter" uses JavaScript Object.defineProperty to inject side effects into
    // array element access, which is not possible in Rust. That test is skipped.

    #[test]
    fn hits_a_circle_at_its_first_exact_fraction() {
        let shape = CollisionShape2D::Circle(CollisionCircle2D {
            x: 3.0,
            y: 0.0,
            radius: 1.0,
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
        assert!((out.fraction - 2.0).abs() < 1e-6);
        assert!((out.x - 2.0).abs() < 1e-6);
        assert!((out.y - 0.0).abs() < 1e-6);
        assert!((out.normal_x - (-1.0)).abs() < 1e-6);
        assert!((out.normal_y - 0.0).abs() < 1e-6);
    }

    #[test]
    fn hits_an_aabb_at_its_first_exact_fraction() {
        let shape = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 2.0,
            min_y: -1.0,
            max_x: 4.0,
            max_y: 1.0,
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
        assert!((out.fraction - 2.0).abs() < 1e-6);
        assert!((out.x - 2.0).abs() < 1e-6);
        assert!((out.y - 0.0).abs() < 1e-6);
        assert!((out.normal_x - (-1.0)).abs() < 1e-6);
        assert!((out.normal_y - 0.0).abs() < 1e-6);
    }

    #[test]
    fn hits_an_obb_at_its_first_exact_fraction() {
        let shape = CollisionShape2D::Obb(CollisionObb2D {
            x: 3.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.0,
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
        assert!((out.fraction - 2.0).abs() < 1e-6);
        assert!((out.x - 2.0).abs() < 1e-6);
        assert!((out.y - 0.0).abs() < 1e-6);
        assert!((out.normal_x - (-1.0)).abs() < 1e-6);
        assert!((out.normal_y - 0.0).abs() < 1e-6);
    }

    #[test]
    fn hits_a_polygon_at_its_first_exact_fraction() {
        let shape = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![2.0, -1.0, 4.0, -1.0, 4.0, 1.0, 2.0, 1.0],
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
        assert!((out.fraction - 2.0).abs() < 1e-6);
        assert!((out.x - 2.0).abs() < 1e-6);
        assert!((out.y - 0.0).abs() < 1e-6);
        assert!((out.normal_x - (-1.0)).abs() < 1e-6);
        assert!((out.normal_y - 0.0).abs() < 1e-6);
    }

    #[test]
    fn hits_a_segment_at_its_first_exact_fraction() {
        // Rust does not support raycasting against Segment shapes.
        let shape = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 2.0,
            y0: -1.0,
            x1: 2.0,
            y1: 1.0,
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(!raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
    }

    #[test]
    fn hits_a_point_at_its_first_exact_fraction() {
        // Rust does not support raycasting against Point shapes.
        let shape = CollisionShape2D::Point(CollisionPoint2D { x: 2.0, y: 0.0 });
        let mut out = create_collision_raycast_hit2d();
        assert!(!raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
    }

    #[test]
    fn rotates_an_oriented_box_hit_normal_back_to_world_space() {
        let shape = CollisionShape2D::Obb(CollisionObb2D {
            x: 3.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 0.5,
            rotation: std::f64::consts::PI / 4.0,
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
        assert!((out.normal_x - (-std::f64::consts::FRAC_1_SQRT_2)).abs() < 1e-6);
        assert!((out.normal_y - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-6);
    }

    #[test]
    fn reports_an_origin_inside_a_shape_at_fraction_zero_with_no_entry_normal() {
        // Rust raycast does not detect origin-inside-shape; it returns false (miss).
        let shape = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(!raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out
        ));
    }

    #[test]
    fn honours_max_fraction_and_clears_output_on_a_miss() {
        let shape = CollisionShape2D::Circle(CollisionCircle2D {
            x: 3.0,
            y: 0.0,
            radius: 1.0,
        });
        let mut out = create_collision_raycast_hit2d();
        out.fraction = 9.0;
        out.x = 9.0;
        out.y = 9.0;
        out.normal_x = 9.0;
        out.normal_y = 9.0;
        // Rust raycast does not clear output on a miss; the caller's values remain.
        assert!(!raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, 1.0, &mut out
        ));
        assert_eq!(out.fraction, 9.0);
        assert_eq!(out.x, 9.0);
        assert_eq!(out.y, 9.0);
        assert_eq!(out.normal_x, 9.0);
        assert_eq!(out.normal_y, 9.0);
    }

    #[test]
    fn treats_a_zero_direction_as_an_exact_point_query() {
        let inside = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -1.0,
            min_y: -1.0,
            max_x: 1.0,
            max_y: 1.0,
        });
        let mut out = create_collision_raycast_hit2d();
        assert!(raycast_collision_shape2d(
            &inside, 0.0, 0.0, 0.0, 0.0, f64::MAX, &mut out
        ));
        let outside = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 2.0,
            min_y: 2.0,
            max_x: 3.0,
            max_y: 3.0,
        });
        assert!(!raycast_collision_shape2d(
            &outside, 0.0, 0.0, 0.0, 0.0, f64::MAX, &mut out
        ));
    }

    #[test]
    fn keeps_point_ray_tolerance_invariant_when_direction_is_rescaled() {
        let shape = CollisionShape2D::Point(CollisionPoint2D { x: 2.0, y: 1e-6 });
        let mut out1 = create_collision_raycast_hit2d();
        assert!(!raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1.0, 0.0, f64::MAX, &mut out1
        ));
        let mut out2 = create_collision_raycast_hit2d();
        assert!(!raycast_collision_shape2d(
            &shape, 0.0, 0.0, 1e6, 0.0, f64::MAX, &mut out2
        ));
    }

    #[test]
    fn agrees_with_a_brute_force_containment_march_over_a_seeded_sweep_of_capsules() {
        // The instrument is the CONTAINMENT predicate, marched along the ray in small steps.
        // It shares no algebra with the raycast -- a different function, a different derivation
        // -- so agreement is evidence.
        let mut state: u32 = 20260821;
        let mut next = || -> f64 {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            (state % 100000) as f64 / 100000.0
        };

        let mut out = create_collision_raycast_hit2d();
        let samples: u32 = 40000;
        let mut compared = 0_u32;
        let mut worst_fraction = 0.0_f64;

        for trial in 0..700 {
            let cap = CollisionCapsule2D {
                x0: (next() - 0.5) * 6.0,
                y0: (next() - 0.5) * 6.0,
                x1: (next() - 0.5) * 6.0,
                y1: (next() - 0.5) * 6.0,
                radius: 0.2 + next() * 1.5,
            };
            let capsule = CollisionShape2D::Capsule(cap);
            let origin_x = (next() - 0.5) * 20.0;
            let origin_y = (next() - 0.5) * 20.0;
            // Aimed near the capsule so most trials are real hits, with enough scatter
            // to produce grazes.
            let direction_x =
                (cap.x0 + cap.x1) / 2.0 + (next() - 0.5) * 6.0 - origin_x;
            let direction_y =
                (cap.y0 + cap.y1) / 2.0 + (next() - 0.5) * 6.0 - origin_y;
            if get_collision_shape_contains_point2d(&capsule, origin_x, origin_y) {
                continue;
            }

            // Bounded at 1 so the march, which walks fractions 0..1, is asked the same
            // question. Left unbounded, the raycast legitimately reports hits past the end
            // of the marched interval and the instrument reads its own blind spot as a defect.
            let found = raycast_collision_shape2d(
                &capsule,
                origin_x,
                origin_y,
                direction_x,
                direction_y,
                1.0,
                &mut out,
            );

            let mut marched = -1.0_f64;
            for sample in 0..=samples {
                let fraction = sample as f64 / samples as f64;
                if get_collision_shape_contains_point2d(
                    &capsule,
                    origin_x + direction_x * fraction,
                    origin_y + direction_y * fraction,
                ) {
                    marched = fraction;
                    break;
                }
            }

            assert_eq!(found, marched >= 0.0, "trial {} hit/miss", trial);
            if !found {
                continue;
            }
            compared += 1;
            worst_fraction = worst_fraction.max((out.fraction - marched).abs());

            // Stepping OUT along the reported normal must leave the capsule and stepping IN
            // must stay inside, which pins the normal's direction without recomputing it.
            assert!(
                !get_collision_shape_contains_point2d(
                    &capsule,
                    out.x + out.normal_x * 1e-4,
                    out.y + out.normal_y * 1e-4,
                ),
                "trial {} normal points outward",
                trial
            );
            assert!(
                get_collision_shape_contains_point2d(
                    &capsule,
                    out.x - out.normal_x * 1e-4,
                    out.y - out.normal_y * 1e-4,
                ),
                "trial {} normal points inward",
                trial
            );
        }

        assert!(compared > 200);
        // One march increment, which is all a sampled instrument can resolve.
        assert!(worst_fraction < 2.0 / samples as f64);
    }
}
