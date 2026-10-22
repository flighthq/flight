use flight_geometry::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {} to be approximately {}, diff = {}",
        actual,
        expected,
        diff
    );
}

fn measure_segment_distance(first: &[f32; 6], second: &[f32; 6]) -> f32 {
    let steps = 600;
    let mut smallest = f32::INFINITY;
    for i in 0..=steps {
        let s = i as f32 / steps as f32;
        let px = first[0] + s * (first[3] - first[0]);
        let py = first[1] + s * (first[4] - first[1]);
        let pz = first[2] + s * (first[5] - first[2]);
        for j in 0..=steps {
            let t = j as f32 / steps as f32;
            let qx = second[0] + t * (second[3] - second[0]);
            let qy = second[1] + t * (second[4] - second[1]);
            let qz = second[2] + t * (second[5] - second[2]);
            let dx = px - qx;
            let dy = py - qy;
            let dz = pz - qz;
            let distance = (dx * dx + dy * dy + dz * dz).sqrt();
            if distance < smallest {
                smallest = distance;
            }
        }
    }
    return smallest;
}

mod create_capsule {
    use super::*;

    #[test]
    fn stores_all_fields() {
        let c = create_capsule(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.5);
        assert_eq!(c.start_x, 1.0);
        assert_eq!(c.start_y, 2.0);
        assert_eq!(c.start_z, 3.0);
        assert_eq!(c.end_x, 4.0);
        assert_eq!(c.end_y, 5.0);
        assert_eq!(c.end_z, 6.0);
        assert_eq!(c.radius, 0.5);
    }
}

mod get_closest_point_on_capsule {
    use super::*;

    #[test]
    fn returns_the_nearest_surface_point_for_a_point_off_the_side() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_capsule(&mut out, &c, &create_vector3(5.0, 0.0, 0.0));
        assert_approx(out.x, 1.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn returns_the_start_cap_surface_for_a_point_beyond_the_start() {
        let c = create_capsule(0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_capsule(&mut out, &c, &create_vector3(0.0, -5.0, 0.0));
        assert_approx(out.x, 0.0);
        assert_approx(out.y, -1.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn returns_the_end_cap_surface_for_a_point_beyond_the_end() {
        let c = create_capsule(0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_capsule(&mut out, &c, &create_vector3(0.0, 10.0, 0.0));
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 3.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let c = create_capsule(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        let mut p = create_vector3(5.0, 0.0, 0.0);
        let snap = p.clone();
        get_closest_point_on_capsule(&mut p, &c, &snap);
        assert_approx(p.x, 1.0);
        assert_approx(p.y, 0.0);
    }

    #[test]
    fn answers_a_point_on_the_axis_with_a_surface_point() {
        let mut out = create_vector3(0.0, 0.0, 0.0);

        get_closest_point_on_capsule(
            &mut out,
            &create_capsule(-5.0, 0.0, 0.0, 5.0, 0.0, 0.0, 1.0),
            &create_vector3(0.0, 0.0, 0.0),
        );
        assert_approx((out.x * out.x + out.y * out.y + out.z * out.z).sqrt(), 1.0);
        assert_approx(out.x, 0.0);

        get_closest_point_on_capsule(
            &mut out,
            &create_capsule(0.0, -5.0, 0.0, 0.0, 5.0, 0.0, 1.0),
            &create_vector3(0.0, 0.0, 0.0),
        );
        assert_approx((out.x * out.x + out.y * out.y + out.z * out.z).sqrt(), 1.0);
        assert_approx(out.y, 0.0);

        get_closest_point_on_capsule(
            &mut out,
            &create_capsule(0.0, 0.0, -5.0, 0.0, 0.0, 5.0, 1.0),
            &create_vector3(0.0, 0.0, 0.0),
        );
        assert_approx((out.x * out.x + out.y * out.y + out.z * out.z).sqrt(), 1.0);
        assert_approx(out.z, 0.0);

        get_closest_point_on_capsule(
            &mut out,
            &create_capsule(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0),
            &create_vector3(0.0, 0.0, 0.0),
        );
        assert_approx((out.x * out.x + out.y * out.y + out.z * out.z).sqrt(), 1.0);
    }

    #[test]
    fn answers_a_point_on_a_diagonal_axis_with_a_surface_point_too() {
        let evenly_diagonal = create_capsule(-3.0, -3.0, -3.0, 3.0, 3.0, 3.0, 2.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_capsule(&mut out, &evenly_diagonal, &create_vector3(0.0, 0.0, 0.0));
        assert_approx((out.x * out.x + out.y * out.y + out.z * out.z).sqrt(), 2.0);
        assert_approx(out.x + out.y + out.z, 0.0);

        let leaning_diagonal = create_capsule(-3.0, -2.0, -1.0, 3.0, 2.0, 1.0, 2.0);
        get_closest_point_on_capsule(&mut out, &leaning_diagonal, &create_vector3(0.0, 0.0, 0.0));
        assert_approx((out.x * out.x + out.y * out.y + out.z * out.z).sqrt(), 2.0);
        assert_approx(out.x * 3.0 + out.y * 2.0 + out.z * 1.0, 0.0);
    }
}

mod intersect_ray3d_capsule {
    use super::*;

    #[test]
    fn hits_a_unit_capsule_from_the_side() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        let ray = create_ray3d(5.0, 0.0, 0.0, -1.0, 0.0, 0.0);
        let t = intersect_ray3d_capsule(&ray, &c);
        assert_approx(t, 4.0);
    }

    #[test]
    fn returns_negative_one_for_a_ray_pointing_away() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        let ray = create_ray3d(5.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert_eq!(intersect_ray3d_capsule(&ray, &c), -1.0);
    }

    #[test]
    fn returns_zero_for_a_ray_starting_inside() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        let ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert_eq!(intersect_ray3d_capsule(&ray, &c), 0.0);
    }

    #[test]
    fn hits_the_end_cap_from_above() {
        let c = create_capsule(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        let ray = create_ray3d(0.0, 5.0, 0.0, 0.0, -1.0, 0.0);
        let t = intersect_ray3d_capsule(&ray, &c);
        assert_approx(t, 4.0);
    }

    #[test]
    fn returns_negative_one_for_a_ray_with_no_direction() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        assert_eq!(
            intersect_ray3d_capsule(&create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0), &c),
            -1.0
        );
        assert_eq!(
            intersect_ray3d_capsule(&create_ray3d(9.0, 9.0, 9.0, 0.0, 0.0, 0.0), &c),
            -1.0
        );
    }

    #[test]
    fn returns_negative_one_for_an_empty_capsule() {
        let empty = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, -1.0);
        assert_eq!(
            intersect_ray3d_capsule(&create_ray3d(5.0, 0.0, 0.0, -1.0, 0.0, 0.0), &empty),
            -1.0
        );
    }

    #[test]
    fn returns_negative_one_for_a_ray_that_passes_wide() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        assert_eq!(
            intersect_ray3d_capsule(&create_ray3d(5.0, 0.0, 5.0, -1.0, 0.0, 0.0), &c),
            -1.0
        );
    }

    #[test]
    fn hits_a_cap_when_the_ray_runs_along_the_axis() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        assert_approx(
            intersect_ray3d_capsule(&create_ray3d(0.0, 5.0, 0.0, 0.0, -1.0, 0.0), &c),
            3.0,
        );
    }

    #[test]
    fn returns_zero_for_a_ray_starting_inside_a_cap() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        assert_eq!(
            intersect_ray3d_capsule(&create_ray3d(0.0, 1.5, 0.0, 0.0, 1.0, 0.0), &c),
            0.0
        );
    }

    #[test]
    fn falls_back_to_a_cap_when_the_body_hit_lands_past_the_end() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        assert_approx(
            intersect_ray3d_capsule(&create_ray3d(5.0, 1.8, 0.0, -1.0, 0.0, 0.0), &c),
            4.4,
        );
        assert_approx(
            intersect_ray3d_capsule(&create_ray3d(5.0, -1.8, 0.0, -1.0, 0.0, 0.0), &c),
            4.4,
        );
        assert_eq!(
            intersect_ray3d_capsule(&create_ray3d(5.0, 2.5, 0.0, -1.0, 0.0, 0.0), &c),
            -1.0
        );
    }

    #[test]
    fn returns_negative_one_from_inside_the_infinite_cylinder_but_past_the_end_cap() {
        let c = create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0);
        assert_eq!(
            intersect_ray3d_capsule(&create_ray3d(0.0, 3.0, 0.0, 1.0, 1.0, 0.0), &c),
            -1.0
        );
    }
}

mod is_capsule_intersecting_aabb {
    use super::*;

    #[test]
    fn returns_true_when_the_capsule_segment_passes_through() {
        let capsule = create_capsule(-5.0, 0.0, 0.0, 5.0, 0.0, 0.0, 0.5);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert!(is_capsule_intersecting_aabb(&capsule, &aabb));
    }

    #[test]
    fn returns_true_when_the_capsule_radius_reaches() {
        let capsule = create_capsule(0.0, 2.0, 0.0, 0.0, 2.0, 0.0, 1.5);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert!(is_capsule_intersecting_aabb(&capsule, &aabb));
    }

    #[test]
    fn returns_false_when_the_capsule_is_far() {
        let capsule = create_capsule(10.0, 10.0, 10.0, 10.0, 12.0, 10.0, 0.5);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert!(!is_capsule_intersecting_aabb(&capsule, &aabb));
    }

    #[test]
    fn returns_false_for_a_negative_radius_capsule() {
        let capsule = create_capsule(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0);
        let aabb = create_aabb(-10.0, -10.0, -10.0, 10.0, 10.0, 10.0);
        assert!(!is_capsule_intersecting_aabb(&capsule, &aabb));
    }

    #[test]
    fn returns_false_for_an_empty_aabb() {
        let capsule = create_capsule(0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 5.0);
        let aabb = create_aabb(1.0, 0.0, 0.0, 0.0, 1.0, 1.0);
        assert!(!is_capsule_intersecting_aabb(&capsule, &aabb));
    }
}

mod is_capsule_intersecting_capsule {
    use super::*;

    #[test]
    fn returns_true_for_two_overlapping_capsules() {
        let a = create_capsule(0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 1.0);
        let b = create_capsule(1.0, 0.0, 0.0, 1.0, 2.0, 0.0, 1.0);
        assert!(is_capsule_intersecting_capsule(&a, &b));
    }

    #[test]
    fn returns_false_for_two_separated_capsules() {
        let a = create_capsule(0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.5);
        let b = create_capsule(10.0, 0.0, 0.0, 10.0, 2.0, 0.0, 0.5);
        assert!(!is_capsule_intersecting_capsule(&a, &b));
    }

    #[test]
    fn returns_false_if_either_capsule_has_negative_radius() {
        let a = create_capsule(0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 1.0);
        let empty = create_capsule(0.0, 0.0, 0.0, 0.0, 2.0, 0.0, -1.0);
        assert!(!is_capsule_intersecting_capsule(&a, &empty));
        assert!(!is_capsule_intersecting_capsule(&empty, &a));
    }

    #[test]
    fn switches_over_at_the_true_axis_distance_for_every_segment_arrangement() {
        let arrangements: &[(&str, [f32; 6], [f32; 6])] = &[
            (
                "two points",
                [1.0, 2.0, 3.0, 1.0, 2.0, 3.0],
                [4.0, 6.0, 3.0, 4.0, 6.0, 3.0],
            ),
            (
                "point and segment",
                [0.0, 5.0, 0.0, 0.0, 5.0, 0.0],
                [-10.0, 0.0, 0.0, 10.0, 0.0, 0.0],
            ),
            (
                "segment and point",
                [-10.0, 0.0, 0.0, 10.0, 0.0, 0.0],
                [0.0, 5.0, 0.0, 0.0, 5.0, 0.0],
            ),
            (
                "parallel",
                [0.0, 0.0, 0.0, 0.0, 10.0, 0.0],
                [3.0, 0.0, 0.0, 3.0, 10.0, 0.0],
            ),
            (
                "skew nearest inside both",
                [-5.0, 0.0, 0.0, 5.0, 0.0, 0.0],
                [0.0, -5.0, 2.0, 0.0, 5.0, 2.0],
            ),
            (
                "nearest before second start",
                [0.0, 0.0, 0.0, 10.0, 0.0, 0.0],
                [5.0, 5.0, 3.0, 5.0, 15.0, 3.0],
            ),
            (
                "nearest past second end",
                [0.0, 0.0, 0.0, 10.0, 0.0, 0.0],
                [5.0, -15.0, 3.0, 5.0, -5.0, 3.0],
            ),
        ];

        for (name, first, second) in arrangements {
            let gap = measure_segment_distance(first, second);
            let too_short = create_capsule(
                first[0],
                first[1],
                first[2],
                first[3],
                first[4],
                first[5],
                gap * 0.45,
            );
            let long_enough = create_capsule(
                first[0],
                first[1],
                first[2],
                first[3],
                first[4],
                first[5],
                gap * 0.56,
            );
            let reach = create_capsule(
                second[0],
                second[1],
                second[2],
                second[3],
                second[4],
                second[5],
                gap * 0.45,
            );

            assert!(
                !is_capsule_intersecting_capsule(&too_short, &reach),
                "{} should not intersect",
                name
            );
            assert!(
                is_capsule_intersecting_capsule(&long_enough, &reach),
                "{} should intersect",
                name
            );
        }
    }
}

mod is_capsule_intersecting_sphere {
    use super::*;

    #[test]
    fn returns_true_when_the_sphere_overlaps() {
        let c = create_capsule(0.0, -2.0, 0.0, 0.0, 2.0, 0.0, 1.0);
        let s = create_bounding_sphere(2.0, 0.0, 0.0, 1.0);
        assert!(is_capsule_intersecting_sphere(&c, &s));
    }

    #[test]
    fn returns_false_when_separated() {
        let c = create_capsule(0.0, -2.0, 0.0, 0.0, 2.0, 0.0, 1.0);
        let s = create_bounding_sphere(10.0, 0.0, 0.0, 1.0);
        assert!(!is_capsule_intersecting_sphere(&c, &s));
    }

    #[test]
    fn returns_false_if_sphere_radius_negative() {
        let c = create_capsule(0.0, -2.0, 0.0, 0.0, 2.0, 0.0, 1.0);
        let empty = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        assert!(!is_capsule_intersecting_sphere(&c, &empty));
    }

    #[test]
    fn returns_false_if_capsule_radius_negative() {
        let c = create_capsule(0.0, -2.0, 0.0, 0.0, 2.0, 0.0, -1.0);
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        assert!(!is_capsule_intersecting_sphere(&c, &s));
    }

    #[test]
    fn treats_a_capsule_with_no_length_as_a_sphere() {
        let point = create_capsule(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert!(!is_capsule_intersecting_sphere(
            &point,
            &create_bounding_sphere(2.5, 0.0, 0.0, 1.0)
        ));
        assert!(is_capsule_intersecting_sphere(
            &point,
            &create_bounding_sphere(1.5, 0.0, 0.0, 1.0)
        ));
    }
}

mod set_capsule {
    use super::*;

    #[test]
    fn updates_all_fields_in_place() {
        let mut c = create_capsule(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_capsule(&mut c, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        assert_eq!(c.start_x, 1.0);
        assert_eq!(c.start_y, 2.0);
        assert_eq!(c.start_z, 3.0);
        assert_eq!(c.end_x, 4.0);
        assert_eq!(c.end_y, 5.0);
        assert_eq!(c.end_z, 6.0);
        assert_eq!(c.radius, 7.0);
    }
}
