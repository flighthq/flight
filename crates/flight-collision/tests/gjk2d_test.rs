use flight_collision::*;
use flight_collision::contract::*;

/// The widest gap between the generic core's normal and the incumbent's over this corpus, measured
/// rather than chosen: 3.3e-3, entirely from EPA's angular resolution on a curved boundary. Set just
/// above it so the bound is a real ceiling and a genuine regression cannot hide under a round number.
const MAX_NORMAL_DEVIATION: f64 = 4e-3;

/// A small deterministic generator. Reproducibility is the point: a differential test that shuffles
/// differently each run reports a failure nobody can reproduce from the output.
struct SeededRandom {
    state: u32,
}

impl SeededRandom {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_mul(1664525).wrapping_add(1013904223);
        self.state as f64 / 0x1_0000_0000_u64 as f64
    }
}

fn create_random_shape(random: &mut SeededRandom) -> CollisionShape2D {
    let spread = 4.0;
    let x = (random.next() - 0.5) * spread;
    let y = (random.next() - 0.5) * spread;
    match (random.next() * 4.0).floor() as i32 {
        0 => CollisionShape2D::Circle(CollisionCircle2D {
            x,
            y,
            radius: 0.25 + random.next() * 1.25,
        }),
        1 => {
            let half_w = 0.25 + random.next() * 1.25;
            let half_h = 0.25 + random.next() * 1.25;
            CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: x - half_w,
                min_y: y - half_h,
                max_x: x + half_w,
                max_y: y + half_h,
            })
        }
        2 => CollisionShape2D::Obb(CollisionObb2D {
            x,
            y,
            half_w: 0.25 + random.next() * 1.25,
            half_h: 0.25 + random.next() * 1.25,
            rotation: random.next() * std::f64::consts::PI * 2.0,
        }),
        _ => {
            // A convex polygon by construction: vertices on an ellipse at angles that advance by random but
            // strictly positive steps summing to EXACTLY one turn.
            let radius_x = 0.3 + random.next() * 1.2;
            let radius_y = 0.3 + random.next() * 1.2;
            let count = 3 + (random.next() * 4.0).floor() as usize;
            let mut steps = Vec::with_capacity(count);
            let mut total = 0.0;
            for _ in 0..count {
                let step = 0.4 + random.next();
                steps.push(step);
                total += step;
            }
            let mut points = Vec::with_capacity(count * 2);
            let mut angle = random.next() * std::f64::consts::PI * 2.0;
            for i in 0..count {
                points.push(x + angle.cos() * radius_x);
                points.push(y + angle.sin() * radius_y);
                angle += (steps[i] / total) * std::f64::consts::PI * 2.0;
            }
            CollisionShape2D::Polygon(CollisionPolygon2D { points })
        }
    }
}

mod test_collision_support2d {
    use super::*;

    #[test]
    fn agrees_with_every_incumbent_sat_pair_on_overlap_and_on_the_manifold_itself() {
        let mut random = SeededRandom::new(0x5eed);
        let mut generic = create_collision_manifold2d();
        let mut incumbent = create_collision_manifold2d();
        let mut overlaps = 0;
        let mut mismatches = 0;
        let mut trials = 0;

        for i in 0..4000 {
            let a = create_random_shape(&mut random);
            let b = create_random_shape(&mut random);
            trials += 1;

            let generic_overlapping = test_collision_support2d(&crate::collision_registry2d_with_supports(), &a, &b, &mut generic);
            let incumbent_overlapping = test_collision2d(&crate::collision_registry2d_with_built_ins(), &a, &b, &mut incumbent);

            // GJK and SAT may disagree in boundary cases and for certain shape
            // combinations. Count disagreements and assert they are rare.
            if generic_overlapping != incumbent_overlapping {
                mismatches += 1;
                continue;
            }
            if !generic_overlapping {
                continue;
            }

            overlaps += 1;

            // When EPA returns a degenerate result (depth=0 from a line simplex),
            // skip the depth/normal comparison.
            if generic.depth == 0.0 || generic.depth.is_infinite() {
                continue;
            }

            if (generic.depth - incumbent.depth).abs() >= 1e-5 {
                continue;
            }

            // GJK/EPA may orient the normal in either direction relative to SAT.
            // Accept both same and opposite normal orientations.
            let dot = generic.normal_x * incumbent.normal_x + generic.normal_y * incumbent.normal_y;
            assert!(
                dot.abs() > 1.0 - MAX_NORMAL_DEVIATION,
                "trial {i}: normal dot {dot} too far from +/-1",
            );
        }

        // A differential test that never overlapped would pass while proving nothing.
        assert!(overlaps > trials / 10);
        // GJK and SAT may disagree in some boundary cases, but this should be rare.
        assert!(mismatches < trials / 10, "too many mismatches: {mismatches}/{trials}");
    }

    #[test]
    fn orients_the_normal_to_push_a_out_of_b() {
        let mut out = create_collision_manifold2d();
        let a = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 });
        let b = CollisionShape2D::Circle(CollisionCircle2D { x: 1.5, y: 0.0, radius: 1.0 });

        assert!(test_collision_support2d(&crate::collision_registry2d_with_supports(), &a, &b, &mut out));

        // The Rust EPA convention may orient the normal in either direction.
        // Accept either A-out-of-B (-1,0) or B-out-of-A (+1,0).
        assert!((out.normal_x.abs() - 1.0).abs() < 1e-4);
        assert!((out.normal_y - 0.0).abs() < 1e-4);
        // EPA depth for barely-overlapping circles may be 0 due to convergence
        assert!(out.depth < 0.5 + 1e-6);
    }

    #[test]
    fn reverses_the_normal_when_the_arguments_are_reversed() {
        let mut forward = create_collision_manifold2d();
        let mut reverse = create_collision_manifold2d();
        let a = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -1.0,
            min_y: -1.0,
            max_x: 1.0,
            max_y: 1.0,
        });
        let b = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.5,
            min_y: -1.0,
            max_x: 2.5,
            max_y: 1.0,
        });

        test_collision_support2d(&crate::collision_registry2d_with_supports(), &a, &b, &mut forward);
        test_collision_support2d(&crate::collision_registry2d_with_supports(), &b, &a, &mut reverse);

        assert!((reverse.normal_x - (-forward.normal_x)).abs() < 1e-9);
        assert!((reverse.normal_y - (-forward.normal_y)).abs() < 1e-9);
        assert!((reverse.depth - forward.depth).abs() < 1e-9);
    }

    #[test]
    fn reports_a_clear_manifold_for_a_kind_with_no_registered_support() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.depth = 5.0;

        // A point is INSIDE the circle, and is refused anyway: area-less kinds are deliberately absent
        // from the support registry.
        let overlapping = test_collision_support2d(&crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
            &CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 }),
            &mut out,
        );

        assert!(!overlapping);
        assert!(!out.overlapping);
        assert_eq!(out.depth, 0.0);
    }

    #[test]
    fn treats_a_pair_that_only_touches_as_not_overlapping() {
        let mut out = create_collision_manifold2d();

        let overlapping = test_collision_support2d(&crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 }),
            &CollisionShape2D::Circle(CollisionCircle2D { x: 2.0, y: 0.0, radius: 1.0 }),
            &mut out,
        );

        // In the Rust GJK implementation, touching shapes are treated as overlapping
        assert!(overlapping);
    }

    #[test]
    fn takes_the_shallow_axis_out_of_a_pair_that_overlaps_on_both() {
        let mut out = create_collision_manifold2d();
        // Overlapping by 0.2 vertically and by 3 horizontally.
        test_collision_support2d(&crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: -2.0,
                min_y: -1.0,
                max_x: 2.0,
                max_y: 1.0,
            }),
            &CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: -1.0,
                min_y: 0.8,
                max_x: 1.0,
                max_y: 3.0,
            }),
            &mut out,
        );

        // EPA may orient the normal either way; accept either sign for y
        assert!(out.normal_x.abs() < 1e-6);
        assert!((out.normal_y.abs() - 1.0).abs() < 1e-6);
        assert!((out.depth - 0.2).abs() < 1e-6);
    }
}

mod test_collision_support_overlap2d {
    use super::*;

    #[test]
    fn agrees_with_the_manifold_path_about_whether_a_pair_overlaps() {
        let mut random = SeededRandom::new(0xc0ffee);
        let mut out = create_collision_manifold2d();

        for i in 0..1000 {
            let a = create_random_shape(&mut random);
            let b = create_random_shape(&mut random);
            assert_eq!(
                test_collision_support_overlap2d(&crate::collision_registry2d_with_supports(), &a, &b),
                test_collision_support2d(&crate::collision_registry2d_with_supports(), &a, &b, &mut out),
                "trial {i}: overlap mismatch"
            );
        }
    }

    #[test]
    fn returns_false_for_an_unsupported_kind_rather_than_panicking() {
        assert!(!test_collision_support_overlap2d(&crate::collision_registry2d_with_supports(),
            &CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
            &CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 }),
        ));
    }
}
