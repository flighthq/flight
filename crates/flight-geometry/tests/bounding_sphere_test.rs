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

mod clone_bounding_sphere {
    use super::*;

    #[test]
    fn creates_an_independent_copy_with_an_independent_center() {
        let s = create_bounding_sphere(1.0, 2.0, 3.0, 4.0);
        let c = clone_bounding_sphere(&s);
        assert_eq!(c.center.x, 1.0);
        assert_eq!(c.radius, 4.0);
    }
}

mod contains_bounding_sphere_point {
    use super::*;

    #[test]
    fn returns_true_inside_and_on_the_surface() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 2.0);
        assert!(contains_bounding_sphere_point(
            &s,
            &create_vector3(1.0, 0.0, 0.0)
        ));
        assert!(contains_bounding_sphere_point(
            &s,
            &create_vector3(2.0, 0.0, 0.0)
        ));
    }

    #[test]
    fn returns_false_outside() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 2.0);
        assert!(!contains_bounding_sphere_point(
            &s,
            &create_vector3(3.0, 0.0, 0.0)
        ));
    }

    #[test]
    fn an_empty_sphere_contains_no_points() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        assert!(!contains_bounding_sphere_point(
            &s,
            &create_vector3(0.0, 0.0, 0.0)
        ));
    }
}

mod copy_bounding_sphere {
    use super::*;

    #[test]
    fn copies_center_and_radius() {
        let src = create_bounding_sphere(1.0, 2.0, 3.0, 4.0);
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        copy_bounding_sphere(&mut out, &src);
        assert_eq!(out.center.x, 1.0);
        assert_eq!(out.radius, 4.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut s = create_bounding_sphere(1.0, 2.0, 3.0, 4.0);
        let s_clone = clone_bounding_sphere(&s);
        copy_bounding_sphere(&mut s, &s_clone);
        assert_eq!(s.center.y, 2.0);
        assert_eq!(s.radius, 4.0);
    }
}

mod create_bounding_sphere {
    use super::*;

    #[test]
    fn defaults_to_an_empty_sphere() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        assert_eq!(s.center.x, 0.0);
        assert_eq!(s.radius, -1.0);
    }

    #[test]
    fn uses_provided_center_and_radius() {
        let s = create_bounding_sphere(1.0, 2.0, 3.0, 5.0);
        assert_eq!(s.center.z, 3.0);
        assert_eq!(s.radius, 5.0);
    }
}

mod get_closest_point_on_bounding_sphere {
    use super::*;

    #[test]
    fn projects_an_outside_point_onto_the_surface() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 2.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_bounding_sphere(&mut out, &s, &create_vector3(10.0, 0.0, 0.0));
        assert_approx_tight(out.x, 2.0);
        assert_approx_tight(out.y, 0.0);
        assert_approx_tight(out.z, 0.0);
    }

    #[test]
    fn pulls_an_inside_point_out_to_the_surface() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 5.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_bounding_sphere(&mut out, &s, &create_vector3(0.0, 1.0, 0.0));
        assert_approx_tight(out.x, 0.0);
        assert_approx_tight(out.y, 5.0);
        assert_approx_tight(out.z, 0.0);
    }

    #[test]
    fn uses_the_positive_x_fallback_when_the_point_is_at_the_center() {
        let s = create_bounding_sphere(1.0, 2.0, 3.0, 4.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_bounding_sphere(&mut out, &s, &create_vector3(1.0, 2.0, 3.0));
        assert_approx_tight(out.x, 5.0);
        assert_approx_tight(out.y, 2.0);
        assert_approx_tight(out.z, 3.0);
    }

    #[test]
    fn writes_the_center_for_an_empty_sphere() {
        let s = create_bounding_sphere(1.0, 2.0, 3.0, -1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_bounding_sphere(&mut out, &s, &create_vector3(9.0, 9.0, 9.0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 3.0);
        let mut p = create_vector3(6.0, 0.0, 0.0);
        let p_clone = clone_vector3(&p);
        get_closest_point_on_bounding_sphere(&mut p, &s, &p_clone);
        assert_approx_tight(p.x, 3.0);
    }
}

mod initialize_bounding_sphere {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_bounding_sphere() {
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        initialize_bounding_sphere(&mut out, &create_vector3(1.0, 2.0, 3.0), 4.0);
        assert_eq!(out.center.x, 1.0);
        assert_eq!(out.center.y, 2.0);
        assert_eq!(out.center.z, 3.0);
        assert_eq!(out.radius, 4.0);
    }
}

mod is_bounding_sphere_intersecting_bounding_sphere {
    use super::*;

    #[test]
    fn returns_true_for_overlapping_spheres() {
        let a = create_bounding_sphere(0.0, 0.0, 0.0, 2.0);
        let b = create_bounding_sphere(3.0, 0.0, 0.0, 2.0);
        assert!(is_bounding_sphere_intersecting_bounding_sphere(&a, &b));
    }

    #[test]
    fn returns_true_for_touching_spheres() {
        let a = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        let b = create_bounding_sphere(2.0, 0.0, 0.0, 1.0);
        assert!(is_bounding_sphere_intersecting_bounding_sphere(&a, &b));
    }

    #[test]
    fn returns_false_for_separated_spheres() {
        let a = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        let b = create_bounding_sphere(5.0, 0.0, 0.0, 1.0);
        assert!(!is_bounding_sphere_intersecting_bounding_sphere(&a, &b));
    }

    #[test]
    fn returns_false_if_either_sphere_is_empty() {
        let a = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        let empty = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        assert!(!is_bounding_sphere_intersecting_bounding_sphere(&a, &empty));
        assert!(!is_bounding_sphere_intersecting_bounding_sphere(&empty, &a));
    }
}

mod merge_bounding_sphere {
    use super::*;

    #[test]
    fn merges_two_overlapping_spheres_into_a_containing_sphere() {
        let a = create_bounding_sphere(-1.0, 0.0, 0.0, 1.0);
        let b = create_bounding_sphere(1.0, 0.0, 0.0, 1.0);
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        merge_bounding_sphere(&mut out, &a, &b);
        assert!(contains_bounding_sphere_point(
            &out,
            &create_vector3(-2.0, 0.0, 0.0)
        ));
        assert!(contains_bounding_sphere_point(
            &out,
            &create_vector3(2.0, 0.0, 0.0)
        ));
    }

    #[test]
    fn if_a_contains_b_result_equals_a() {
        let a = create_bounding_sphere(0.0, 0.0, 0.0, 10.0);
        let b = create_bounding_sphere(1.0, 0.0, 0.0, 1.0);
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        merge_bounding_sphere(&mut out, &a, &b);
        assert_approx(out.center.x, 0.0);
        assert_approx(out.radius, 10.0);
    }

    #[test]
    fn empty_source_returns_the_other_sphere() {
        let a = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        let b = create_bounding_sphere(3.0, 0.0, 0.0, 2.0);
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        merge_bounding_sphere(&mut out, &a, &b);
        assert_approx(out.center.x, 3.0);
        assert_approx(out.radius, 2.0);
    }

    #[test]
    fn if_b_contains_a_result_equals_b() {
        let a = create_bounding_sphere(1.0, 0.0, 0.0, 1.0);
        let b = create_bounding_sphere(0.0, 0.0, 0.0, 10.0);
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        merge_bounding_sphere(&mut out, &a, &b);
        assert_approx(out.center.x, 0.0);
        assert_approx(out.radius, 10.0);
    }

    #[test]
    fn an_empty_second_sphere_returns_the_first() {
        let a = create_bounding_sphere(3.0, 0.0, 0.0, 2.0);
        let b = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        merge_bounding_sphere(&mut out, &a, &b);
        assert_approx(out.center.x, 3.0);
        assert_approx(out.radius, 2.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_bounding_sphere(-1.0, 0.0, 0.0, 1.0);
        let b = create_bounding_sphere(1.0, 0.0, 0.0, 1.0);
        let a_clone = clone_bounding_sphere(&a);
        merge_bounding_sphere(&mut a, &a_clone, &b);
        assert!(contains_bounding_sphere_point(
            &a,
            &create_vector3(-2.0, 0.0, 0.0)
        ));
        assert!(contains_bounding_sphere_point(
            &a,
            &create_vector3(2.0, 0.0, 0.0)
        ));
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_bounding_sphere(-1.0, 0.0, 0.0, 1.0);
        let mut b = create_bounding_sphere(1.0, 0.0, 0.0, 1.0);
        let b_clone = clone_bounding_sphere(&b);
        merge_bounding_sphere(&mut b, &a, &b_clone);
        assert!(contains_bounding_sphere_point(
            &b,
            &create_vector3(-2.0, 0.0, 0.0)
        ));
        assert!(contains_bounding_sphere_point(
            &b,
            &create_vector3(2.0, 0.0, 0.0)
        ));
    }
}

mod set_bounding_sphere {
    use super::*;

    #[test]
    fn sets_center_and_radius() {
        let mut s = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        set_bounding_sphere(&mut s, 5.0, 6.0, 7.0, 8.0);
        assert_eq!(s.center.x, 5.0);
        assert_eq!(s.radius, 8.0);
    }
}

mod set_bounding_sphere_from_aabb {
    use super::*;

    #[test]
    fn centers_on_the_box_and_reaches_its_corners() {
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let mut s = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        set_bounding_sphere_from_aabb(&mut s, &aabb);
        assert_eq!(s.center.x, 0.0);
        assert_eq!(s.center.y, 0.0);
        assert_eq!(s.center.z, 0.0);
        assert_approx_tight(s.radius, 3.0_f32.sqrt());
    }

    #[test]
    fn an_empty_box_yields_an_empty_sphere() {
        let aabb = create_aabb(
            f32::INFINITY,
            f32::INFINITY,
            f32::INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
        );
        let mut s = create_bounding_sphere(0.0, 0.0, 0.0, 5.0);
        set_bounding_sphere_from_aabb(&mut s, &aabb);
        assert_eq!(s.radius, -1.0);
    }
}

mod transform_bounding_sphere_by_matrix4 {
    use super::*;

    #[test]
    fn translates_the_center_and_preserves_the_radius() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 2.0);
        let mut m = create_matrix4();
        m.m[12] = 10.0;
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        transform_bounding_sphere_by_matrix4(&mut out, &s, &m);
        assert_approx_tight(out.center.x, 10.0);
        assert_approx_tight(out.radius, 2.0);
    }

    #[test]
    fn scales_the_radius_by_the_largest_axis_scale() {
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        let m = create_matrix4_from_values(
            2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        transform_bounding_sphere_by_matrix4(&mut out, &s, &m);
        assert_approx_tight(out.radius, 4.0);
    }

    #[test]
    fn supports_out_equals_sphere() {
        let mut s = create_bounding_sphere(1.0, 0.0, 0.0, 2.0);
        let mut m = create_matrix4();
        m.m[13] = 5.0;
        let s_clone = clone_bounding_sphere(&s);
        transform_bounding_sphere_by_matrix4(&mut s, &s_clone, &m);
        assert_approx_tight(s.center.x, 1.0);
        assert_approx_tight(s.center.y, 5.0);
        assert_approx_tight(s.radius, 2.0);
    }

    #[test]
    fn leaves_an_empty_sphere_empty_instead_of_scaling_its_negative_radius() {
        let empty = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        let m = create_matrix4_from_values(
            3.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut out = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        transform_bounding_sphere_by_matrix4(&mut out, &empty, &m);
        assert_eq!(out.radius, -1.0);
    }
}
