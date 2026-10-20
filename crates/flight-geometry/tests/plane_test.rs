use flight_geometry::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn assert_approx_tight(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-6,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod clone_plane {
    use super::*;

    #[test]
    fn creates_an_independent_copy() {
        let p = create_plane(1.0, 0.0, 0.0, -5.0);
        let c = clone_plane(&p);
        assert_eq!(c.a, 1.0);
        assert_eq!(c.d, -5.0);
    }
}

mod copy_plane {
    use super::*;

    #[test]
    fn copies_all_coefficients() {
        let src = create_plane(0.0, 1.0, 0.0, 3.0);
        let mut out = create_plane(0.0, 0.0, 0.0, 0.0);
        copy_plane(&mut out, &src);
        assert_eq!(out.a, 0.0);
        assert_eq!(out.b, 1.0);
        assert_eq!(out.c, 0.0);
        assert_eq!(out.d, 3.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut p = create_plane(2.0, 3.0, 4.0, 5.0);
        let p_copy = clone_plane(&p);
        copy_plane(&mut p, &p_copy);
        assert_eq!(p.a, 2.0);
        assert_eq!(p.d, 5.0);
    }
}

mod create_plane {
    use super::*;

    #[test]
    fn defaults_to_zeros() {
        let p = create_plane(0.0, 0.0, 0.0, 0.0);
        assert_eq!(p.a, 0.0);
        assert_eq!(p.b, 0.0);
        assert_eq!(p.c, 0.0);
        assert_eq!(p.d, 0.0);
    }

    #[test]
    fn uses_provided_coefficients() {
        let p = create_plane(1.0, 2.0, 3.0, 4.0);
        assert_eq!(p.a, 1.0);
        assert_eq!(p.b, 2.0);
        assert_eq!(p.c, 3.0);
        assert_eq!(p.d, 4.0);
    }
}

mod get_closest_point_on_plane {
    use super::*;

    #[test]
    fn projects_a_point_onto_the_plane_along_the_normal() {
        let p = create_plane(0.0, 0.0, 1.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_plane(&mut out, &p, &create_vector3(2.0, 3.0, 5.0));
        assert_approx_tight(out.x, 2.0);
        assert_approx_tight(out.y, 3.0);
        assert_approx_tight(out.z, 0.0);
    }

    #[test]
    fn leaves_a_point_already_on_the_plane_in_place() {
        let p = create_plane(1.0, 0.0, 0.0, -5.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_plane(&mut out, &p, &create_vector3(5.0, 1.0, 2.0));
        assert_approx_tight(out.x, 5.0);
        assert_approx_tight(out.y, 1.0);
        assert_approx_tight(out.z, 2.0);
    }

    #[test]
    fn agrees_with_project_vector3_onto_plane() {
        let p = create_plane(0.0, 1.0, 0.0, -3.0);
        let mut closest = create_vector3(0.0, 0.0, 0.0);
        let mut projected = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_plane(&mut closest, &p, &create_vector3(4.0, 7.0, -2.0));
        project_vector3_onto_plane(&mut projected, &create_vector3(4.0, 7.0, -2.0), &p);
        assert_approx_tight(closest.x, projected.x);
        assert_approx_tight(closest.y, projected.y);
        assert_approx_tight(closest.z, projected.z);
    }

    #[test]
    fn supports_out_equals_point() {
        let p = create_plane(0.0, 0.0, 1.0, 0.0);
        let mut v = create_vector3(1.0, 2.0, 9.0);
        let v_copy = clone_vector3(&v);
        get_closest_point_on_plane(&mut v, &p, &v_copy);
        assert_approx_tight(v.z, 0.0);
    }
}

mod get_plane_coplanar_point {
    use super::*;

    #[test]
    fn point_on_the_plane_has_signed_distance_zero() {
        let p = create_plane(1.0, 0.0, 0.0, -5.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_plane_coplanar_point(&mut out, &p);
        assert_approx_tight(get_plane_signed_distance_to_point(&p, &out), 0.0);
    }
}

mod get_plane_signed_distance_to_point {
    use super::*;

    #[test]
    fn is_positive_on_the_normal_side_and_negative_behind() {
        let p = create_plane(1.0, 0.0, 0.0, 0.0);
        assert_approx_tight(
            get_plane_signed_distance_to_point(&p, &create_vector3(3.0, 0.0, 0.0)),
            3.0,
        );
        assert_approx_tight(
            get_plane_signed_distance_to_point(&p, &create_vector3(-2.0, 5.0, 9.0)),
            -2.0,
        );
    }

    #[test]
    fn accounts_for_the_plane_offset() {
        let p = create_plane(1.0, 0.0, 0.0, -4.0);
        assert_approx_tight(
            get_plane_signed_distance_to_point(&p, &create_vector3(4.0, 0.0, 0.0)),
            0.0,
        );
    }
}

mod initialize_plane {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_plane() {
        let mut p = create_plane(0.0, 0.0, 0.0, 0.0);
        initialize_plane(&mut p, 1.0, 2.0, 3.0, 4.0);
        assert_eq!(p.a, 1.0);
        assert_eq!(p.b, 2.0);
        assert_eq!(p.c, 3.0);
        assert_eq!(p.d, 4.0);
    }
}

mod normalize_plane {
    use super::*;

    #[test]
    fn normalizes_a_plane_with_non_unit_normal() {
        let p = create_plane(0.0, 2.0, 0.0, 4.0);
        let mut out = create_plane(0.0, 0.0, 0.0, 0.0);
        normalize_plane(&mut out, &p);
        assert_approx_tight(out.b, 1.0);
        assert_approx_tight(out.d, 2.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut p = create_plane(0.0, 3.0, 0.0, 6.0);
        let p_copy = clone_plane(&p);
        normalize_plane(&mut p, &p_copy);
        assert_approx_tight(p.b, 1.0);
        assert_approx_tight(p.d, 2.0);
    }

    #[test]
    fn leaves_a_degenerate_plane_unchanged() {
        let p = create_plane(0.0, 0.0, 0.0, 5.0);
        let mut out = create_plane(0.0, 0.0, 0.0, 0.0);
        normalize_plane(&mut out, &p);
        assert_eq!(out.d, 5.0);
    }
}

mod project_vector3_onto_plane {
    use super::*;

    #[test]
    fn projects_a_point_above_the_xz_plane_down_to_y_equals_zero() {
        let plane = create_plane(0.0, 1.0, 0.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        project_vector3_onto_plane(&mut out, &create_vector3(3.0, 5.0, 2.0), &plane);
        assert_approx_tight(out.x, 3.0);
        assert_approx_tight(out.y, 0.0);
        assert_approx_tight(out.z, 2.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let plane = create_plane(1.0, 0.0, 0.0, 0.0);
        let mut pt = create_vector3(4.0, 2.0, 1.0);
        let pt_copy = clone_vector3(&pt);
        project_vector3_onto_plane(&mut pt, &pt_copy, &plane);
        assert_approx_tight(pt.x, 0.0);
        assert_approx_tight(pt.y, 2.0);
        assert_approx_tight(pt.z, 1.0);
    }
}

mod set_plane {
    use super::*;

    #[test]
    fn sets_all_coefficients() {
        let mut p = create_plane(0.0, 0.0, 0.0, 0.0);
        set_plane(&mut p, 9.0, 8.0, 7.0, 6.0);
        assert_eq!(p.a, 9.0);
        assert_eq!(p.b, 8.0);
        assert_eq!(p.c, 7.0);
        assert_eq!(p.d, 6.0);
    }
}

mod set_plane_from_normal_and_point {
    use super::*;

    #[test]
    fn builds_a_plane_that_contains_the_given_point() {
        let normal = create_vector3(0.0, 1.0, 0.0);
        let point = create_vector3(0.0, 5.0, 0.0);
        let mut p = create_plane(0.0, 0.0, 0.0, 0.0);
        set_plane_from_normal_and_point(&mut p, &normal, &point);
        assert_approx_tight(get_plane_signed_distance_to_point(&p, &point), 0.0);
    }

    #[test]
    fn stores_the_normal_in_a_b_c() {
        let normal = create_vector3(1.0, 0.0, 0.0);
        let point = create_vector3(3.0, 0.0, 0.0);
        let mut p = create_plane(0.0, 0.0, 0.0, 0.0);
        set_plane_from_normal_and_point(&mut p, &normal, &point);
        assert_approx_tight(p.a, 1.0);
        assert_approx_tight(p.b, 0.0);
        assert_approx_tight(p.c, 0.0);
        assert_approx_tight(p.d, -3.0);
    }
}

mod set_plane_from_points {
    use super::*;

    #[test]
    fn builds_the_xz_plane_from_three_points_in_xz() {
        let mut p = create_plane(0.0, 0.0, 0.0, 0.0);
        set_plane_from_points(
            &mut p,
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(1.0, 0.0, 0.0),
            &create_vector3(0.0, 0.0, 1.0),
        );
        assert_approx(p.b.abs(), 1.0);
        assert_approx(p.a, 0.0);
        assert_approx(p.c, 0.0);
    }

    #[test]
    fn all_three_points_lie_on_the_resulting_plane() {
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(4.0, 0.0, 1.0);
        let c = create_vector3(-1.0, 3.0, 5.0);
        let mut p = create_plane(0.0, 0.0, 0.0, 0.0);
        set_plane_from_points(&mut p, &a, &b, &c);
        assert_approx(get_plane_signed_distance_to_point(&p, &a), 0.0);
        assert_approx(get_plane_signed_distance_to_point(&p, &b), 0.0);
        assert_approx(get_plane_signed_distance_to_point(&p, &c), 0.0);
    }

    #[test]
    fn writes_a_zero_plane_for_three_points_that_do_not_span_one() {
        let mut p = create_plane(1.0, 1.0, 1.0, 1.0);
        set_plane_from_points(
            &mut p,
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(1.0, 1.0, 1.0),
            &create_vector3(2.0, 2.0, 2.0),
        );
        assert_eq!(p.a, 0.0);
        assert_eq!(p.b, 0.0);
        assert_eq!(p.c, 0.0);
        assert_eq!(p.d, 0.0);

        let mut q = create_plane(1.0, 1.0, 1.0, 1.0);
        let same = create_vector3(4.0, 5.0, 6.0);
        set_plane_from_points(&mut q, &same, &same, &same);
        assert_eq!(q.a, 0.0);
        assert_eq!(q.b, 0.0);
        assert_eq!(q.c, 0.0);
        assert_eq!(q.d, 0.0);
    }
}
