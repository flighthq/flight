use flight_collision::*;
use flight_collision::contract::*;

fn sphere(x: f64, y: f64, z: f64, radius: f64) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D { x, y, z, radius })
}

fn aabb(
    min_x: f64,
    min_y: f64,
    min_z: f64,
    max_x: f64,
    max_y: f64,
    max_z: f64,
) -> CollisionShape3D {
    CollisionShape3D::Aabb(CollisionAabb3D {
        min_x,
        min_y,
        min_z,
        max_x,
        max_y,
        max_z,
    })
}

mod create_collision_distance3d {
    use super::*;

    #[test]
    fn starts_zeroed_and_not_overlapping() {
        let d = create_collision_distance3d();
        assert_eq!(d.distance, 0.0);
        assert_eq!(d.direction_x, 0.0);
        assert_eq!(d.direction_y, 0.0);
        assert_eq!(d.direction_z, 0.0);
        assert_eq!(d.point_a_x, 0.0);
        assert_eq!(d.point_a_y, 0.0);
        assert_eq!(d.point_a_z, 0.0);
        assert_eq!(d.point_b_x, 0.0);
        assert_eq!(d.point_b_y, 0.0);
        assert_eq!(d.point_b_z, 0.0);
        assert!(!d.overlapping);
    }
}

mod initialize_collision_distance3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_distance3d() {
        let mut d = create_collision_distance3d();
        d.distance = 99.0;
        d.direction_x = 1.0;
        d.direction_y = 2.0;
        d.direction_z = 3.0;
        d.point_a_x = 4.0;
        d.point_a_y = 5.0;
        d.point_a_z = 6.0;
        d.point_b_x = 7.0;
        d.point_b_y = 8.0;
        d.point_b_z = 9.0;
        d.overlapping = true;
        initialize_collision_distance3d(&mut d);
        assert_eq!(d.distance, 0.0);
        assert_eq!(d.direction_x, 0.0);
        assert!(!d.overlapping);
    }
}

mod write_collision_distance3d {
    use super::*;

    // write_collision_distance3d returns true for separated shapes (with distance > 0,
    // direction, and witness points) and false for overlapping shapes (with overlapping=true).

    #[test]
    fn returns_true_for_separated_spheres() {
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 2.0),
            &mut out,
        );
        // The function returns true (no error) for all valid inputs
        assert!(result);
    }

    #[test]
    fn returns_false_for_overlapping_spheres() {
        // write_collision_distance3d returns false when it detects overlap
        // (the GJK loop terminates early when the simplex encloses the origin).
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &sphere(0.0, 0.0, 0.0, 2.0),
            &sphere(1.0, 0.0, 0.0, 2.0),
            &mut out,
        );
        assert!(!result);
        assert!(out.overlapping);
        assert_eq!(out.distance, 0.0);
    }

    #[test]
    fn detects_overlapping_spheres() {
        let mut out = create_collision_distance3d();
        write_collision_distance3d(
            &sphere(0.0, 0.0, 0.0, 2.0),
            &sphere(1.0, 0.0, 0.0, 2.0),
            &mut out,
        );
        assert!(out.overlapping);
        assert_eq!(out.distance, 0.0);
    }

    #[test]
    fn reports_near_zero_distance_for_touching_spheres() {
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(2.0, 0.0, 0.0, 1.0),
            &mut out,
        );
        // Touching (distance=0) is the boundary: GJK may report a zero-distance
        // separation or detect overlap depending on convergence order. Accept either.
        if result {
            assert!(out.distance < 1e-6);
        } else {
            assert!(out.overlapping);
        }
    }

    #[test]
    fn does_not_panic_on_axis_aligned_boxes() {
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            &aabb(5.0, -1.0, -1.0, 7.0, 1.0, 1.0),
            &mut out,
        );
        assert!(result);
    }

    #[test]
    fn does_not_panic_on_corner_to_corner_boxes() {
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0),
            &aabb(4.0, 4.0, 4.0, 5.0, 5.0, 5.0),
            &mut out,
        );
        assert!(result);
    }

    #[test]
    fn does_not_panic_on_sphere_vs_box() {
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &sphere(7.0, 0.0, 0.0, 1.0),
            &aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            &mut out,
        );
        assert!(result);
    }

    #[test]
    fn does_not_panic_on_capsule_vs_sphere() {
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0, y0: 0.0, z0: 0.0, x1: 2.0, y1: 0.0, z1: 0.0, radius: 0.5,
        });
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &sphere(0.0, 10.0, 0.0, 1.0),
            &capsule,
            &mut out,
        );
        assert!(result);
    }

    #[test]
    fn does_not_panic_on_convex_hull() {
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0,
                -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ],
        });
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &sphere(0.0, 6.0, 0.0, 1.0),
            &cube,
            &mut out,
        );
        assert!(result);
    }

    #[test]
    fn is_symmetric_in_returning_true_when_arguments_swap() {
        let mut out = create_collision_distance3d();
        let a_result = write_collision_distance3d(
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.0, 9.0, 0.0, 2.0),
            &mut out,
        );
        let b_result = write_collision_distance3d(
            &sphere(0.0, 9.0, 0.0, 2.0),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &mut out,
        );
        assert_eq!(a_result, b_result);
    }

    #[test]
    fn zeroes_the_output_on_overlap() {
        let mut out = create_collision_distance3d();
        // First call to populate with potential non-zero values.
        write_collision_distance3d(
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            &mut out,
        );
        // Second call: overlapping.
        write_collision_distance3d(
            &sphere(0.0, 0.0, 0.0, 2.0),
            &sphere(1.0, 0.0, 0.0, 2.0),
            &mut out,
        );
        // Initialize is called at the start, so witness points are zeroed
        assert_eq!(out.point_a_x, 0.0);
        assert_eq!(out.point_b_x, 0.0);
        assert_eq!(out.distance, 0.0);
    }

    #[test]
    fn does_not_panic_on_capsule_pair() {
        let along_x = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0, y0: 0.0, z0: 0.0, x1: 2.0, y1: 0.0, z1: 0.0, radius: 0.5,
        });
        let above_along_y = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0, y0: -2.0, z0: 5.0, x1: 0.0, y1: 2.0, z1: 5.0, radius: 0.5,
        });
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(&along_x, &above_along_y, &mut out);
        assert!(result);
    }

    #[test]
    fn does_not_panic_on_large_aabb_pair() {
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            &aabb(5.0, -20.0, -20.0, 6.0, 20.0, 20.0),
            &mut out,
        );
        assert!(result);
    }

    #[test]
    fn does_not_panic_with_offset_sphere() {
        let mut out = create_collision_distance3d();
        let result = write_collision_distance3d(
            &sphere(3.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            &mut out,
        );
        assert!(result);
    }

    #[test]
    fn handles_multiple_scales_without_panic() {
        let mut out = create_collision_distance3d();
        for &scale in &[0.001, 1.0, 1000.0] {
            let result = write_collision_distance3d(
                &sphere(0.0, 0.0, 0.0, scale),
                &sphere(10.0 * scale, 0.0, 0.0, scale),
                &mut out,
            );
            assert!(result, "failed at scale {}", scale);
        }
    }
}
