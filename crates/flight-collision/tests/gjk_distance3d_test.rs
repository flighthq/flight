use flight_collision::contract::*;
use flight_collision::*;

const CLOSE_TO_SIX_DIGITS: f32 = 5e-7;
const CLOSE_TO_NINE_DIGITS: f32 = 5e-10;

fn sphere(x: f32, y: f32, z: f32, radius: f32) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D { x, y, z, radius })
}

fn aabb(
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
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

fn write_distance_default(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionDistance3D,
) -> bool {
    write_collision_distance3d(out, registry, a, b, None, None, None)
}

fn assert_close(actual: f32, expected: f32, tolerance: f32) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {actual} to be within {tolerance} of {expected}"
    );
}

mod create_collision_distance3d {
    use super::*;

    #[test]
    fn starts_zeroed_and_not_overlapping() {
        let out = create_collision_distance3d();
        assert_eq!(out.distance, 0.0);
        assert_eq!(out.direction_x, 0.0);
        assert_eq!(out.direction_y, 0.0);
        assert_eq!(out.direction_z, 0.0);
        assert_eq!(out.point_a_x, 0.0);
        assert_eq!(out.point_a_y, 0.0);
        assert_eq!(out.point_a_z, 0.0);
        assert_eq!(out.point_b_x, 0.0);
        assert_eq!(out.point_b_y, 0.0);
        assert_eq!(out.point_b_z, 0.0);
        assert!(!out.overlapping);
    }
}

mod initialize_collision_distance3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_distance3d() {
        let mut out = create_collision_distance3d();
        out.distance = 99.0;
        out.direction_x = 1.0;
        out.direction_y = 2.0;
        out.direction_z = 3.0;
        out.point_a_x = 4.0;
        out.point_a_y = 5.0;
        out.point_a_z = 6.0;
        out.point_b_x = 7.0;
        out.point_b_y = 8.0;
        out.point_b_z = 9.0;
        out.overlapping = true;

        initialize_collision_distance3d(&mut out);

        assert_eq!(out, create_collision_distance3d());
    }
}

mod write_collision_distance3d {
    use super::*;

    #[test]
    fn matches_the_closed_form_for_two_separated_spheres() {
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 2.0),
            &mut out,
        ));
        assert_close(out.distance, 7.0, CLOSE_TO_NINE_DIGITS);
        assert!(!out.overlapping);
    }

    #[test]
    fn points_the_direction_from_b_toward_a() {
        let mut out = create_collision_distance3d();
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 2.0),
            &mut out,
        );
        assert_close(out.direction_x, -1.0, CLOSE_TO_NINE_DIGITS);
        assert_close(out.direction_y, 0.0, CLOSE_TO_NINE_DIGITS);
        assert_close(out.direction_z, 0.0, CLOSE_TO_NINE_DIGITS);
    }

    #[test]
    fn returns_a_unit_direction() {
        let mut out = create_collision_distance3d();
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(6.0, 8.0, 0.0, 1.0),
            &mut out,
        );
        assert_close(
            (out.direction_x * out.direction_x
                + out.direction_y * out.direction_y
                + out.direction_z * out.direction_z)
                .sqrt(),
            1.0,
            CLOSE_TO_NINE_DIGITS,
        );
        assert_close(out.distance, 8.0, CLOSE_TO_NINE_DIGITS);
    }

    #[test]
    fn measures_along_z_as_readily_as_along_x() {
        let mut out = create_collision_distance3d();
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.0, 0.0, 10.0, 1.0),
            &mut out,
        );
        assert_close(out.distance, 8.0, CLOSE_TO_NINE_DIGITS);
        assert_close(out.direction_z, -1.0, CLOSE_TO_NINE_DIGITS);
    }

    #[test]
    fn reports_overlap_rather_than_a_distance_for_an_intersecting_pair() {
        let mut out = create_collision_distance3d();
        assert!(!write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 2.0),
            &sphere(1.0, 0.0, 0.0, 2.0),
            &mut out,
        ));
        assert!(out.overlapping);
        assert_eq!(out.distance, 0.0);
    }

    #[test]
    fn reports_overlap_for_a_pair_that_merely_touches() {
        let mut out = create_collision_distance3d();
        assert!(!write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(2.0, 0.0, 0.0, 1.0),
            &mut out,
        ));
        assert!(out.overlapping);
    }

    #[test]
    fn measures_face_to_face_between_two_boxes() {
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            &aabb(5.0, -1.0, -1.0, 7.0, 1.0, 1.0),
            &mut out,
        ));
        assert_close(out.distance, 4.0, CLOSE_TO_NINE_DIGITS);
        assert_close(out.direction_x, -1.0, CLOSE_TO_NINE_DIGITS);
    }

    #[test]
    fn measures_corner_to_corner_between_two_boxes() {
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0),
            &aabb(4.0, 4.0, 4.0, 5.0, 5.0, 5.0),
            &mut out,
        ));
        assert_close(out.distance, 27.0_f32.sqrt(), CLOSE_TO_NINE_DIGITS);
    }

    #[test]
    fn measures_edge_to_edge_between_two_boxes() {
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0),
            &aabb(4.0, 4.0, 0.0, 5.0, 5.0, 1.0),
            &mut out,
        ));
        assert_close(out.distance, 18.0_f32.sqrt(), CLOSE_TO_NINE_DIGITS);
        assert_close(out.direction_z, 0.0, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn matches_the_closed_form_for_a_sphere_against_a_box_face() {
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(7.0, 0.0, 0.0, 1.0),
            &aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            &mut out,
        ));
        assert_close(out.distance, 5.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.direction_x, 1.0, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn measures_a_capsule_from_its_surface_not_its_axis() {
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 10.0, 0.0, 1.0),
            &capsule,
            &mut out,
        ));
        assert_close(out.distance, 8.5, CLOSE_TO_SIX_DIGITS);
        assert_close(out.direction_y, 1.0, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn measures_to_a_convex_hull() {
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, -1.0,
                1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ],
        });
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 6.0, 0.0, 1.0),
            &cube,
            &mut out,
        ));
        assert_close(out.distance, 4.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.direction_y, 1.0, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn is_symmetric_in_magnitude_and_opposite_in_direction_when_the_arguments_swap() {
        let mut out = create_collision_distance3d();
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.0, 9.0, 0.0, 2.0),
            &mut out,
        );
        let forward = out.distance;
        let forward_y = out.direction_y;
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 9.0, 0.0, 2.0),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &mut out,
        );
        assert_close(out.distance, forward, CLOSE_TO_NINE_DIGITS);
        assert_close(out.direction_y, -forward_y, CLOSE_TO_NINE_DIGITS);
    }

    #[test]
    fn agrees_with_the_overlap_test_about_which_side_of_touching_a_pair_is_on() {
        for gap in [-0.1_f32, -0.001, 0.001, 0.1, 1.0] {
            let mut out = create_collision_distance3d();
            let separated = write_distance_default(
                &crate::collision_registry3d_with_supports(),
                &sphere(0.0, 0.0, 0.0, 1.0),
                &sphere(2.0 + gap, 0.0, 0.0, 1.0),
                &mut out,
            );
            assert_eq!(separated, gap > 0.0, "gap={gap} out={out:?}");
            if separated {
                assert_close(out.distance, gap, CLOSE_TO_SIX_DIGITS);
            }
        }
    }

    #[test]
    fn declines_a_kind_with_no_registered_support_rather_than_reporting_a_distance() {
        let mut registry = crate::collision_registry3d_with_supports();
        clear_collision_supports3d(&mut registry);
        let mut out = create_collision_distance3d();
        assert!(!write_distance_default(
            &registry,
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            &mut out,
        ));
        assert_eq!(out.distance, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn stays_accurate_over_a_wide_range_of_scales() {
        for scale in [0.001_f32, 1.0, 1000.0] {
            let mut out = create_collision_distance3d();
            assert!(write_distance_default(
                &crate::collision_registry3d_with_supports(),
                &sphere(0.0, 0.0, 0.0, scale),
                &sphere(10.0 * scale, 0.0, 0.0, scale),
                &mut out,
            ));
            assert_close(out.distance / scale, 8.0, CLOSE_TO_SIX_DIGITS);
        }
    }

    #[test]
    fn puts_the_witness_points_on_each_sphere_surface_along_the_line_of_centres() {
        let mut out = create_collision_distance3d();
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            &mut out,
        );
        assert_close(out.point_a_x, 1.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_a_y, 0.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_b_x, 9.0, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn separates_the_witness_points_by_the_reported_distance_along_the_reported_direction() {
        for b in [
            sphere(10.0, 0.0, 0.0, 1.0),
            sphere(6.0, 8.0, 0.0, 2.0),
            aabb(4.0, 4.0, 4.0, 5.0, 5.0, 5.0),
        ] {
            let mut out = create_collision_distance3d();
            assert!(write_distance_default(
                &crate::collision_registry3d_with_supports(),
                &sphere(0.0, 0.0, 0.0, 1.0),
                &b,
                &mut out,
            ));
            assert_close(
                out.point_a_x - out.point_b_x,
                out.direction_x * out.distance,
                CLOSE_TO_SIX_DIGITS,
            );
            assert_close(
                out.point_a_y - out.point_b_y,
                out.direction_y * out.distance,
                CLOSE_TO_SIX_DIGITS,
            );
            assert_close(
                out.point_a_z - out.point_b_z,
                out.direction_z * out.distance,
                CLOSE_TO_SIX_DIGITS,
            );
        }
    }

    #[test]
    fn finds_a_closest_point_interior_to_an_edge_which_no_support_call_can_name() {
        let along_x = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let above_along_y = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0,
            y0: -2.0,
            z0: 5.0,
            x1: 0.0,
            y1: 2.0,
            z1: 5.0,
            radius: 0.5,
        });
        let mut out = create_collision_distance3d();
        assert!(write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &along_x,
            &above_along_y,
            &mut out,
        ));
        assert_close(out.distance, 4.0, CLOSE_TO_SIX_DIGITS);
        // D1: f32 support quantization; TS asserts 6 digits (api-drift)
        assert_close(out.point_a_x, 0.0, 1e-4);
        // D1: f32 support quantization; TS asserts 6 digits (api-drift)
        assert_close(out.point_a_y, 0.0, 1e-4);
        assert_close(out.point_a_z, 0.5, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_b_z, 4.5, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn settles_on_a_corner_of_the_shared_region_when_the_closest_features_are_parallel() {
        let mut out = create_collision_distance3d();
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            &aabb(5.0, -20.0, -20.0, 6.0, 20.0, 20.0),
            &mut out,
        );
        assert_close(out.distance, 4.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_a_x, 1.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_a_y.abs(), 1.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_a_z.abs(), 1.0, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn reports_the_witness_on_a_in_the_offset_frame() {
        let mut out = create_collision_distance3d();
        assert!(write_collision_distance3d(
            &mut out,
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            Some(3.0),
            Some(0.0),
            Some(0.0),
        ));
        assert_close(out.distance, 5.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_a_x, 4.0, CLOSE_TO_SIX_DIGITS);
        assert_close(out.point_b_x, 9.0, CLOSE_TO_SIX_DIGITS);
    }

    #[test]
    fn zeroes_the_witness_points_for_an_overlapping_pair_alongside_the_distance() {
        let mut out = create_collision_distance3d();
        write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            &mut out,
        );
        assert!(!write_distance_default(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 2.0),
            &sphere(1.0, 0.0, 0.0, 2.0),
            &mut out,
        ));
        assert_eq!(out.point_a_x, 0.0);
        assert_eq!(out.point_b_x, 0.0);
    }
}
