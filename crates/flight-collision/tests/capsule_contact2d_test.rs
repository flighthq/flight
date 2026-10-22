use flight_collision::contract::*;

fn manifold() -> CollisionContactManifold2D {
    create_collision_contact_manifold2d()
}

fn distance_to_capsule_axis(x0: f32, y0: f32, x1: f32, y1: f32, px: f32, py: f32) -> f32 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length_squared = dx * dx + dy * dy;
    let mut t = 0.0;
    if length_squared > 0.0 {
        t = ((px - x0) * dx + (py - y0) * dy) / length_squared;
        if t < 0.0 {
            t = 0.0;
        }
        if t > 1.0 {
            t = 1.0;
        }
    }
    ((px - (x0 + t * dx)).powi(2) + (py - (y0 + t * dy)).powi(2)).sqrt()
}

mod collide_capsule_aabb_contact_manifold2d {
    use super::*;

    #[test]
    fn gives_a_horizontal_capsule_resting_on_a_floor_a_two_point_span() {
        let mut out = manifold();
        let overlapping = collide_capsule_aabb_contact_manifold2d(
            &CollisionCapsule2D {
                x0: -1.0,
                y0: 0.49,
                x1: 1.0,
                y1: 0.49,
                radius: 0.5,
            },
            &CollisionAabb2D {
                min_x: -10.0,
                min_y: -1.0,
                max_x: 10.0,
                max_y: 0.0,
            },
            &mut out,
        );

        assert_eq!(overlapping, true);
        // Pinned capsuleContact2D.test.ts:74: a capsule lying along a face produces a TWO-point
        // span (one under each cap end), which is what keeps it from rocking. Principal 6cbf7f43.
        assert_eq!(out.point_count, 2);
        let mut xs: Vec<f32> = out.points[..out.point_count].iter().map(|p| p.x).collect();
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((xs[0] - (-1.0)).abs() < 1e-6, "xs: {:?}", xs);
        assert!((xs[1] - 1.0).abs() < 1e-6, "xs: {:?}", xs);
        for point in &out.points[..out.point_count] {
            assert!(
                (point.y - (-0.01)).abs() < 1e-6,
                "point y on the capsule underside"
            );
        }
        assert!(
            (out.normal_x - 0.0).abs() < 1e-6,
            "normal_x: {} vs 0.0",
            out.normal_x
        );
        assert!(
            (out.normal_y - 1.0).abs() < 1e-6,
            "normal_y: {} vs 1.0",
            out.normal_y
        );
        assert!(
            (out.depth - 0.01).abs() < 1e-6,
            "depth: {} vs 0.01",
            out.depth
        );
    }

    #[test]
    fn gives_an_end_on_capsule_a_single_point() {
        let mut out = manifold();
        collide_capsule_aabb_contact_manifold2d(
            &CollisionCapsule2D {
                x0: 0.0,
                y0: 0.49,
                x1: 0.0,
                y1: 2.49,
                radius: 0.5,
            },
            &CollisionAabb2D {
                min_x: -10.0,
                min_y: -1.0,
                max_x: 10.0,
                max_y: 0.0,
            },
            &mut out,
        );

        assert_eq!(out.point_count, 1);
        assert!(
            (out.normal_y - 1.0).abs() < 1e-6,
            "normal_y: {} vs 1.0",
            out.normal_y
        );
        let d = distance_to_capsule_axis(0.0, 0.49, 0.0, 2.49, out.points[0].x, out.points[0].y);
        assert!((d - 0.5).abs() < 1e-6, "distance to axis: {} vs 0.5", d);
    }

    #[test]
    fn reports_no_contact_for_a_capsule_clear_of_the_box() {
        let mut out = manifold();
        assert_eq!(
            collide_capsule_aabb_contact_manifold2d(
                &CollisionCapsule2D {
                    x0: -1.0,
                    y0: 0.5,
                    x1: 1.0,
                    y1: 0.5,
                    radius: 0.5
                },
                &CollisionAabb2D {
                    min_x: -10.0,
                    min_y: -1.0,
                    max_x: 10.0,
                    max_y: 0.0
                },
                &mut out,
            ),
            false,
        );
        assert_eq!(out.overlapping, false);
    }
}

mod collide_capsule_capsule_contact_manifold2d {
    use super::*;

    #[test]
    fn gives_two_parallel_capsules_lying_side_by_side_a_two_point_span() {
        let mut out = manifold();
        let overlapping = collide_capsule_capsule_contact_manifold2d(
            &CollisionCapsule2D {
                x0: -1.0,
                y0: 0.9,
                x1: 1.0,
                y1: 0.9,
                radius: 0.5,
            },
            &CollisionCapsule2D {
                x0: -2.0,
                y0: 0.0,
                x1: 2.0,
                y1: 0.0,
                radius: 0.5,
            },
            &mut out,
        );

        assert_eq!(overlapping, true);
        assert_eq!(out.point_count, 2);
        assert!(
            (out.normal_y - 1.0).abs() < 1e-6,
            "normal_y: {} vs 1.0",
            out.normal_y
        );
        assert!(
            (out.depth - 0.1).abs() < 1e-6,
            "depth: {} vs 0.1",
            out.depth
        );
    }

    #[test]
    fn detects_two_capsules_whose_axes_cross() {
        let a = CollisionCapsule2D {
            x0: 0.0,
            y0: -2.0,
            x1: 0.0,
            y1: 2.0,
            radius: 0.4,
        };
        let b = CollisionCapsule2D {
            x0: -2.0,
            y0: 0.0,
            x1: 2.0,
            y1: 0.0,
            radius: 0.3,
        };
        let mut out = manifold();

        assert_eq!(
            collide_capsule_capsule_contact_manifold2d(&a, &b, &mut out),
            true
        );
        // Pinned capsuleContact2D.test.ts:148: a crossed pair needs a depth FAR greater than the
        // sum of radii (0.7) because clearing it means separating the SEGMENTS. Principal 6cbf7f43.
        assert!(
            out.depth > 0.7,
            "depth: {} should exceed the sum of radii 0.7",
            out.depth
        );
        // Normal should be unit length.
        let nl = (out.normal_x * out.normal_x + out.normal_y * out.normal_y).sqrt();
        assert!((nl - 1.0).abs() < 1e-6, "normal length: {} vs 1.0", nl);
        assert_eq!(out.point_count, 1);
    }

    #[test]
    fn places_a_single_contact_point_on_a_surface_even_when_normal_is_not_perpendicular_to_axis() {
        let a = CollisionCapsule2D {
            x0: 0.0,
            y0: 0.0,
            x1: 3.0,
            y1: 0.0,
            radius: 0.5,
        };
        let mut out = manifold();
        collide_capsule_capsule_contact_manifold2d(
            &a,
            &CollisionCapsule2D {
                x0: 3.8,
                y0: 0.0,
                x1: 6.0,
                y1: 0.0,
                radius: 0.4,
            },
            &mut out,
        );

        assert_eq!(out.point_count, 1);
        let d = distance_to_capsule_axis(a.x0, a.y0, a.x1, a.y1, out.points[0].x, out.points[0].y);
        assert!((d - 0.5).abs() < 1e-6, "distance to axis: {} vs 0.5", d);
    }

    #[test]
    fn reports_no_contact_for_capsules_further_apart_than_the_sum_of_their_radii() {
        let mut out = manifold();
        assert_eq!(
            collide_capsule_capsule_contact_manifold2d(
                &CollisionCapsule2D {
                    x0: -1.0,
                    y0: 0.0,
                    x1: 1.0,
                    y1: 0.0,
                    radius: 0.5
                },
                &CollisionCapsule2D {
                    x0: -1.0,
                    y0: 1.0,
                    x1: 1.0,
                    y1: 1.0,
                    radius: 0.5
                },
                &mut out,
            ),
            false,
        );
    }
}

mod collide_capsule_obb_contact_manifold2d {
    use super::*;

    #[test]
    fn rests_a_capsule_flat_on_a_rotated_box_face_with_two_points() {
        let mut out = manifold();
        let overlapping = collide_capsule_obb_contact_manifold2d(
            &CollisionCapsule2D {
                x0: -0.5,
                y0: 1.49,
                x1: 0.5,
                y1: 1.49,
                radius: 0.5,
            },
            &CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 2.0,
                half_h: 1.0,
                rotation: 0.0,
            },
            &mut out,
        );

        assert_eq!(overlapping, true);
        // Pinned capsuleContact2D.test.ts:186: flat face contact is a two-point span.
        assert_eq!(out.point_count, 2);
        assert!(
            (out.normal_y - 1.0).abs() < 1e-6,
            "normal_y: {} vs 1.0",
            out.normal_y
        );
    }

    #[test]
    fn finds_a_corner_contact_along_the_corner() {
        let capsule = CollisionCapsule2D {
            x0: 1.3,
            y0: 1.3,
            x1: 3.0,
            y1: 3.0,
            radius: 0.5,
        };
        let obb = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.0,
        };
        let mut out = manifold();

        assert_eq!(
            collide_capsule_obb_contact_manifold2d(&capsule, &obb, &mut out),
            true
        );
        let sqrt1_2: f32 = std::f32::consts::FRAC_1_SQRT_2;
        assert!(
            (out.normal_x - sqrt1_2).abs() < 1e-6,
            "normal_x: {} vs {}",
            out.normal_x,
            sqrt1_2
        );
        assert!(
            (out.normal_y - sqrt1_2).abs() < 1e-6,
            "normal_y: {} vs {}",
            out.normal_y,
            sqrt1_2
        );
    }
}

mod collide_capsule_polygon_contact_manifold2d {
    use super::*;

    #[test]
    fn rests_a_capsule_on_a_polygon_face_with_two_points_whatever_the_winding() {
        let clockwise = CollisionPolygon2D {
            points: vec![-5.0, 0.0, 5.0, 0.0, 5.0, -2.0, -5.0, -2.0],
        };
        let counter_clockwise = CollisionPolygon2D {
            points: vec![-5.0, -2.0, 5.0, -2.0, 5.0, 0.0, -5.0, 0.0],
        };
        for polygon in &[clockwise, counter_clockwise] {
            let mut out = manifold();
            assert_eq!(
                collide_capsule_polygon_contact_manifold2d(
                    &CollisionCapsule2D {
                        x0: -1.0,
                        y0: 0.49,
                        x1: 1.0,
                        y1: 0.49,
                        radius: 0.5
                    },
                    polygon,
                    &mut out,
                ),
                true,
            );
            // Pinned capsuleContact2D.test.ts:211: two points for a face span.
            assert_eq!(out.point_count, 2);
            assert!(
                (out.normal_y - 1.0).abs() < 1e-6,
                "normal_y: {} vs 1.0",
                out.normal_y
            );
        }
    }

    #[test]
    fn declines_a_degenerate_polygon_rather_than_poisoning_the_manifold() {
        let mut out = manifold();
        assert_eq!(
            collide_capsule_polygon_contact_manifold2d(
                &CollisionCapsule2D {
                    x0: 0.0,
                    y0: 0.0,
                    x1: 1.0,
                    y1: 0.0,
                    radius: 0.5
                },
                &CollisionPolygon2D {
                    points: vec![0.0, 0.0, 1.0, 0.0]
                },
                &mut out,
            ),
            false,
        );
    }
}

mod collide_circle_capsule_contact_manifold2d {
    use super::*;

    #[test]
    fn reduces_to_circle_versus_circle_at_the_capsule_closest_axis_point() {
        let mut out = manifold();
        let overlapping = collide_circle_capsule_contact_manifold2d(
            &CollisionCircle2D {
                x: 0.0,
                y: 0.9,
                radius: 0.5,
            },
            &CollisionCapsule2D {
                x0: -2.0,
                y0: 0.0,
                x1: 2.0,
                y1: 0.0,
                radius: 0.5,
            },
            &mut out,
        );

        assert_eq!(overlapping, true);
        assert_eq!(out.point_count, 1);
        assert!(
            (out.normal_y - 1.0).abs() < 1e-6,
            "normal_y: {} vs 1.0",
            out.normal_y
        );
        assert!(
            (out.depth - 0.1).abs() < 1e-6,
            "depth: {} vs 0.1",
            out.depth
        );
        // On the CIRCLE surface
        assert!(
            (out.points[0].y - 0.4).abs() < 1e-6,
            "point[0].y: {} vs 0.4",
            out.points[0].y
        );
    }

    #[test]
    fn pushes_a_circle_centred_on_the_capsule_axis_out_sideways() {
        let mut out = manifold();
        assert_eq!(
            collide_circle_capsule_contact_manifold2d(
                &CollisionCircle2D {
                    x: 0.0,
                    y: 0.0,
                    radius: 0.2
                },
                &CollisionCapsule2D {
                    x0: -2.0,
                    y0: 0.0,
                    x1: 2.0,
                    y1: 0.0,
                    radius: 0.5
                },
                &mut out,
            ),
            true,
        );
        assert!(
            (out.normal_x - 0.0).abs() < 1e-6,
            "normal_x: {} vs 0.0",
            out.normal_x
        );
        assert!(
            (out.normal_y.abs() - 1.0).abs() < 1e-6,
            "|normal_y|: {} vs 1.0",
            out.normal_y.abs()
        );
    }

    #[test]
    fn reports_no_contact_when_the_circle_clears_the_capsule() {
        let mut out = manifold();
        assert_eq!(
            collide_circle_capsule_contact_manifold2d(
                &CollisionCircle2D {
                    x: 0.0,
                    y: 1.1,
                    radius: 0.5
                },
                &CollisionCapsule2D {
                    x0: -2.0,
                    y0: 0.0,
                    x1: 2.0,
                    y1: 0.0,
                    radius: 0.5
                },
                &mut out,
            ),
            false,
        );
    }
}
