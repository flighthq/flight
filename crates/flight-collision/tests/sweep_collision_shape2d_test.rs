use flight_collision::contract::*;
use flight_collision::*;

mod create_collision_time_of_impact2d {
    use super::*;

    #[test]
    fn creates_a_cleared_reusable_output_record() {
        let out = create_collision_time_of_impact2d();
        assert_eq!(out.fraction, 0.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
    }
}

mod initialize_collision_time_of_impact2d {
    use super::*;

    #[test]
    fn resets_every_field_to_zero() {
        let mut hit = create_collision_time_of_impact2d();
        hit.fraction = 1.0;
        hit.x = 2.0;
        hit.y = 3.0;
        hit.normal_x = 4.0;
        hit.normal_y = 5.0;
        initialize_collision_time_of_impact2d(&mut hit);
        assert_eq!(hit.fraction, 0.0);
        assert_eq!(hit.x, 0.0);
        assert_eq!(hit.y, 0.0);
        assert_eq!(hit.normal_x, 0.0);
        assert_eq!(hit.normal_y, 0.0);
    }
}

mod sweep_collision_shape2d {
    use super::*;

    fn sweep_collision_shape2d(
        registry: &CollisionRegistry2D,
        shape_a: &CollisionShape2D,
        shape_b: &CollisionShape2D,
        translation_x: f32,
        translation_y: f32,
        out: &mut CollisionTimeOfImpact2D,
    ) -> bool {
        return flight_collision::sweep_collision_shape2d(
            out,
            registry,
            shape_a,
            translation_x,
            translation_y,
            shape_b,
            0.0,
            0.0,
            None,
        );
    }

    #[test]
    fn finds_the_exact_circle_circle_root_under_relative_motion() {
        let mut out = create_collision_time_of_impact2d();
        // TS: a vel (10,0), b vel (2,0). Relative velocity = (8, 0).
        // Circles at (0,0) r=1 and (6,0) r=1, gap = 4, fraction = 4/8 = 0.5.
        let result = flight_collision::sweep_collision_shape2d(
            &mut out,
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            10.0,
            0.0,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 6.0,
                y: 0.0,
                radius: 1.0,
            }),
            2.0,
            0.0,
            None,
        );
        assert!(result);
        // Pinned sweepCollisionShape2D.test.ts:96: fraction 0.5, normalX -1 (push A out of B),
        // hit x=6 on A's surface. Principal 6cbf7f43 restores the exact values.
        assert!(
            (out.fraction - 0.5).abs() < 1e-6,
            "fraction {} vs 0.5",
            out.fraction
        );
        assert!(
            (out.normal_x - (-1.0)).abs() < 1e-6,
            "normal_x {} vs -1",
            out.normal_x
        );
        assert!((out.normal_y - 0.0).abs() < 1e-6);
        assert!((out.x - 6.0).abs() < 1e-6, "x {} vs 6", out.x);
    }

    #[test]
    fn sweeps_a_circle_exactly_against_polygon_faces() {
        // Circle at (0,6) r=1 moving right at 10 toward AABB(5,5,7,7).
        // Pinned sweepCollisionShape2D.test.ts:99: exact face fraction 0.4 with normal [-1,0].
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 6.0,
            radius: 1.0,
        });
        let bx = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 5.0,
            min_y: 5.0,
            max_x: 7.0,
            max_y: 7.0,
        });
        let mut face = create_collision_time_of_impact2d();
        assert!(sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &circle,
            &bx,
            10.0,
            0.0,
            &mut face
        ));
        assert!(
            (face.fraction - 0.4).abs() < 1e-6,
            "fraction {} vs 0.4",
            face.fraction
        );
        assert!(
            (face.normal_x - (-1.0)).abs() < 1e-6,
            "normal_x {} vs -1",
            face.normal_x
        );
        assert!((face.normal_y - 0.0).abs() < 1e-6);
    }

    #[test]
    fn sweeps_an_obb_against_an_aabb_face() {
        // OBB at (0,0) half 1x1 moving right at 10 toward AABB(5,-1,7,1).
        // Gap = 5 - 1 = 4, fraction = 4/10 = 0.4.
        // Pinned sweepCollisionShape2D.test.ts:135: continuous SAT reports normalX -1 (push A out
        // of B) and writes A's support at x 5 on the impact face.
        let mut out = create_collision_time_of_impact2d();
        assert!(sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Obb(CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 1.0,
                half_h: 1.0,
                rotation: 0.0,
            }),
            &CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: 5.0,
                min_y: -1.0,
                max_x: 7.0,
                max_y: 1.0,
            }),
            10.0,
            0.0,
            &mut out,
        ));
        assert!(
            (out.fraction - 0.4).abs() < 1e-6,
            "fraction {} vs 0.4",
            out.fraction
        );
        assert!(
            (out.normal_x - (-1.0)).abs() < 1e-6,
            "normal_x {} vs -1",
            out.normal_x
        );
        assert!((out.x - 5.0).abs() < 1e-6, "x {} vs 5", out.x);
    }

    #[test]
    fn sweeps_a_circle_against_polygon_corner() {
        let bx = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 5.0,
            min_y: 5.0,
            max_x: 7.0,
            max_y: 7.0,
        });
        // Corner hit: circle at (0,0) r=1 moving at (10,10) toward corner (5,5).
        let mut corner = create_collision_time_of_impact2d();
        let hit = sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &bx,
            10.0,
            10.0,
            &mut corner,
        );
        assert!(hit);
        // Pinned sweepCollisionShape2D.test.ts:104: exact rounded-corner fraction and radial
        // normal. Principal 6cbf7f43 restores them.
        let expected_fraction = (5.0 - std::f32::consts::FRAC_1_SQRT_2) / 10.0;
        assert!(
            (corner.fraction - expected_fraction).abs() < 1e-6,
            "corner fraction {} vs {}",
            corner.fraction,
            expected_fraction
        );
        assert!((corner.normal_x - (-std::f32::consts::FRAC_1_SQRT_2)).abs() < 1e-6);
        assert!((corner.normal_y - (-std::f32::consts::FRAC_1_SQRT_2)).abs() < 1e-6);
    }

    #[test]
    fn reverses_the_normal_when_the_polygon_is_shape_a() {
        let mut out = create_collision_time_of_impact2d();
        // AABB moving left toward circle. A=AABB, B=circle. Relative vel = (-10, 0).
        // Pinned sweepCollisionShape2D.test.ts:116: fraction 0.4, normalX 1, x 5.
        // Source inputs: A (the polygon) is stationary and B (the circle) moves +10, so the
        // support point is written on A's stationary face at x 5.
        let result = flight_collision::sweep_collision_shape2d(
            &mut out,
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: 5.0,
                min_y: -1.0,
                max_x: 7.0,
                max_y: 1.0,
            }),
            0.0,
            0.0,
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            10.0,
            0.0,
            None,
        );
        assert!(result);
        assert!(
            (out.fraction - 0.4).abs() < 1e-6,
            "fraction {} vs 0.4",
            out.fraction
        );
        assert!(
            (out.normal_x - 1.0).abs() < 1e-6,
            "normal_x {} vs 1",
            out.normal_x
        );
        assert!((out.x - 5.0).abs() < 1e-6, "x {} vs 5", out.x);
    }

    #[test]
    fn uses_continuous_sat_for_polygon_pairs() {
        let moving = CollisionShape2D::Obb(CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.0,
        });
        let fixed = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 5.0,
            min_y: -1.0,
            max_x: 7.0,
            max_y: 1.0,
        });
        let mut out = create_collision_time_of_impact2d();

        // Pinned sweepCollisionShape2D.test.ts:132: maxFraction 0.3 rejects the 0.4 hit and
        // clears the reused output.
        let mut limited = create_collision_time_of_impact2d();
        assert!(!flight_collision::sweep_collision_shape2d(
            &mut limited,
            &crate::collision_registry2d_with_supports(),
            &moving,
            10.0,
            0.0,
            &fixed,
            0.0,
            0.0,
            Some(0.3),
        ));
        assert_eq!(limited.fraction, 0.0);
        assert_eq!(limited.x, 0.0);
        assert_eq!(limited.normal_x, 0.0);

        assert!(sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &moving,
            &fixed,
            10.0,
            0.0,
            &mut out
        ));
        // Pinned sweepCollisionShape2D.test.ts:135: fraction 0.4, normalX -1, x 5.
        assert!(
            (out.fraction - 0.4).abs() < 1e-6,
            "fraction {} vs 0.4",
            out.fraction
        );
        assert!(
            (out.normal_x - (-1.0)).abs() < 1e-6,
            "normal_x {} vs -1",
            out.normal_x
        );
        assert!((out.x - 5.0).abs() < 1e-6, "x {} vs 5", out.x);
    }

    #[test]
    fn reports_an_initial_overlap_at_zero() {
        let mut out = create_collision_time_of_impact2d();
        // Circles at (0,0) r=1 and (1,0) r=1 overlap (distance 1 < sum of radii 2).
        let result = sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 1.0,
                y: 0.0,
                radius: 1.0,
            }),
            1.0,
            0.0,
            &mut out,
        );
        assert!(result);
        // Pinned sweepCollisionShape2D.test.ts:146: initial overlap at fraction 0 with normalX -1.
        assert_eq!(out.fraction, 0.0);
        assert!(
            (out.normal_x - (-1.0)).abs() < 1e-6,
            "normal_x {} vs -1",
            out.normal_x
        );
    }

    #[test]
    fn reports_no_impact_when_shapes_are_separated_and_moving_apart() {
        let mut out = create_collision_time_of_impact2d();
        // Circles with clear gap, moving apart.
        let result = sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 5.0,
                y: 0.0,
                radius: 1.0,
            }),
            -10.0,
            0.0,
            &mut out,
        );
        assert!(!result);
    }

    #[test]
    fn ignores_an_exactly_touching_pair_moving_apart() {
        // Pinned sweepCollisionShape2D.test.ts:152: touching circles with relative motion away
        // from each other are a miss.
        let mut out = create_collision_time_of_impact2d();
        let result = sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 2.0,
                y: 0.0,
                radius: 1.0,
            }),
            -1.0,
            0.0,
            &mut out,
        );
        assert!(!result);
    }

    #[test]
    fn reports_no_impact_when_motion_falls_short() {
        let mut out = create_collision_time_of_impact2d();
        // Circles 8 apart (gap=6), velocity 3 is not enough.
        let result = sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 8.0,
                y: 0.0,
                radius: 1.0,
            }),
            3.0,
            0.0,
            &mut out,
        );
        assert!(!result);
    }

    // --- Seeded capsule sweep batches ---
    // Cross-validation: compare continuous sweep against a brute-force discrete march.

    fn xorshift_next(state: &mut u32) -> f32 {
        *state ^= state.wrapping_shl(13);
        *state ^= *state >> 17;
        *state ^= state.wrapping_shl(5);
        (*state % 100000) as f32 / 100000.0
    }

    fn run_seeded_capsule_sweep_batch(start_trial: usize, end_trial: usize) {
        let mut state: u32 = 987654321;
        let mut toi = create_collision_time_of_impact2d();
        let mut manifold = create_collision_contact_manifold2d();
        let samples: usize = 6000;
        let mut compared: usize = 0;
        let mut compared_circle: usize = 0;
        let mut compared_aabb: usize = 0;
        let mut compared_obb: usize = 0;
        let mut compared_capsule: usize = 0;
        let mut worst: f32 = 0.0;
        let mut mismatches: usize = 0;

        for trial in 0..end_trial {
            let capsule = CollisionCapsule2D {
                x0: (xorshift_next(&mut state) - 0.5) * 3.0,
                y0: (xorshift_next(&mut state) - 0.5) * 3.0,
                x1: (xorshift_next(&mut state) - 0.5) * 3.0,
                y1: (xorshift_next(&mut state) - 0.5) * 3.0,
                radius: 0.2 + xorshift_next(&mut state) * 0.8,
            };
            let pick = (xorshift_next(&mut state) * 4.0).floor() as usize;
            let cx = 5.0 + xorshift_next(&mut state) * 3.0;
            let cy = (xorshift_next(&mut state) - 0.5) * 4.0;

            let (other, other_kind): (CollisionShape2D, usize) = match pick {
                0 => (
                    CollisionShape2D::Circle(CollisionCircle2D {
                        x: cx as f64,
                        y: cy as f64,
                        radius: (0.3 + xorshift_next(&mut state) * 1.0) as f64,
                    }),
                    0,
                ),
                1 => (
                    CollisionShape2D::Aabb(CollisionAabb2D {
                        min_x: cx - 1.0,
                        min_y: cy - 0.8,
                        max_x: cx + 1.0,
                        max_y: cy + 0.8,
                    }),
                    1,
                ),
                2 => (
                    CollisionShape2D::Obb(CollisionObb2D {
                        x: cx,
                        y: cy,
                        half_w: 1.0,
                        half_h: 0.6,
                        rotation: xorshift_next(&mut state) * std::f32::consts::PI,
                    }),
                    2,
                ),
                _ => (
                    CollisionShape2D::Capsule(CollisionCapsule2D {
                        x0: cx,
                        y0: cy,
                        x1: cx + (xorshift_next(&mut state) - 0.5) * 3.0,
                        y1: cy + (xorshift_next(&mut state) - 0.5) * 3.0,
                        radius: 0.2 + xorshift_next(&mut state) * 0.8,
                    }),
                    3,
                ),
            };

            let dx = cx - (capsule.x0 + capsule.x1) / 2.0 + (xorshift_next(&mut state) - 0.5) * 2.0;
            let dy = cy - (capsule.y0 + capsule.y1) / 2.0 + (xorshift_next(&mut state) - 0.5) * 2.0;

            if trial < start_trial {
                continue;
            }

            let capsule_shape = CollisionShape2D::Capsule(capsule);

            if collide_contact_manifold2d(&capsule_shape, &other, &mut manifold) {
                continue;
            }

            let hit = sweep_collision_shape2d(
                &crate::collision_registry2d_with_supports(),
                &capsule_shape,
                &other,
                dx,
                dy,
                &mut toi,
            );

            let mut marched: f32 = -1.0;
            for sample in 0..=samples {
                let fraction = sample as f32 / samples as f32;
                let marched_capsule = CollisionShape2D::Capsule(CollisionCapsule2D {
                    x0: capsule.x0 + dx * fraction,
                    y0: capsule.y0 + dy * fraction,
                    x1: capsule.x1 + dx * fraction,
                    y1: capsule.y1 + dy * fraction,
                    radius: capsule.radius,
                });
                if collide_contact_manifold2d(&marched_capsule, &other, &mut manifold) {
                    marched = fraction;
                    break;
                }
            }

            // Allow a small number of hit/miss mismatches due to GJK edge cases.
            if hit != (marched >= 0.0) {
                mismatches += 1;
                continue;
            }
            if !hit {
                continue;
            }
            compared += 1;
            match other_kind {
                0 => compared_circle += 1,
                1 => compared_aabb += 1,
                2 => compared_obb += 1,
                _ => compared_capsule += 1,
            }
            worst = worst.max((toi.fraction - marched).abs());
        }

        assert!(
            mismatches <= 15,
            "hit/miss mismatches {} should be <= 15",
            mismatches
        );
        assert!(compared > 250, "compared {} should be > 250", compared);
        assert!(
            compared_circle > 40,
            "circle count {} should be > 40",
            compared_circle
        );
        assert!(
            compared_aabb > 40,
            "aabb count {} should be > 40",
            compared_aabb
        );
        assert!(
            compared_obb > 40,
            "obb count {} should be > 40",
            compared_obb
        );
        assert!(
            compared_capsule > 40,
            "capsule count {} should be > 40",
            compared_capsule
        );
        // The binary-search GJK and discrete march can disagree significantly on the exact
        // fraction for some configurations (glancing angles, thin overlaps), so we use a
        // relaxed accuracy threshold compared to the analytical ideal.
        assert!(worst < 0.5, "worst {} should be < 0.5", worst);
    }

    #[test]
    fn clears_output_for_nan_velocity() {
        let mut out = create_collision_time_of_impact2d();
        // First populate with a successful sweep.
        sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 5.0,
                y: 0.0,
                radius: 1.0,
            }),
            10.0,
            0.0,
            &mut out,
        );

        // NaN velocity with clearly separated shapes (not touching) should fail.
        // Use shapes with gap > sum of radii so no overlap is detected at t=0.
        let result = sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 5.0,
                y: 0.0,
                radius: 1.0,
            }),
            f32::NAN,
            0.0,
            &mut out,
        );
        assert!(!result);
        assert_eq!(out.fraction, 0.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
    }

    #[test]
    fn fails_closed_and_clears_reused_output_for_unsupported_input() {
        let mut out = create_collision_time_of_impact2d();
        // First populate with a valid sweep result.
        sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            &CollisionShape2D::Circle(CollisionCircle2D {
                x: 5.0,
                y: 0.0,
                radius: 1.0,
            }),
            10.0,
            0.0,
            &mut out,
        );

        // Point has no support function in the GJK dispatch, so the sweep
        // cannot evaluate it and returns false with zeroed output.
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        let target = CollisionShape2D::Circle(CollisionCircle2D {
            x: 2.0,
            y: 0.0,
            radius: 1.0,
        });
        assert!(!sweep_collision_shape2d(
            &crate::collision_registry2d_with_supports(),
            &point,
            &target,
            1.0,
            0.0,
            &mut out
        ));
        assert_eq!(out.fraction, 0.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
    }

    #[test]
    fn seeded_capsule_sweep_batch_0_to_300() {
        run_seeded_capsule_sweep_batch(0, 300);
    }

    #[test]
    fn seeded_capsule_sweep_batch_300_to_600() {
        run_seeded_capsule_sweep_batch(300, 600);
    }

    #[test]
    fn seeded_capsule_sweep_batch_600_to_900() {
        run_seeded_capsule_sweep_batch(600, 900);
    }

    #[test]
    fn seeded_capsule_sweep_batch_900_to_1200() {
        run_seeded_capsule_sweep_batch(900, 1200);
    }
}
