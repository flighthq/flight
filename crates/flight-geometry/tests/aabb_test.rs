use flight_geometry::*;
use std::f32::consts::{FRAC_1_SQRT_2, SQRT_2};

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

mod clone_aabb {
    use super::*;

    #[test]
    fn creates_an_independent_copy() {
        let a = create_aabb(-1.0, -2.0, -3.0, 4.0, 5.0, 6.0);
        let c = clone_aabb(&a);
        assert_eq!(c.min.x, -1.0);
        assert_eq!(c.max.z, 6.0);
    }
}

mod contains_aabb_point {
    use super::*;

    #[test]
    fn returns_true_for_an_interior_point_and_on_the_boundary() {
        let a = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        assert!(contains_aabb_point(&a, &create_vector3(1.0, 1.0, 1.0)));
        assert!(contains_aabb_point(&a, &create_vector3(0.0, 2.0, 0.0)));
    }

    #[test]
    fn returns_false_for_a_point_outside() {
        let a = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        assert!(!contains_aabb_point(&a, &create_vector3(3.0, 1.0, 1.0)));
    }
}

mod copy_aabb {
    use super::*;

    #[test]
    fn copies_both_corners() {
        let src = create_aabb(-1.0, -2.0, -3.0, 4.0, 5.0, 6.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        copy_aabb(&mut out, &src);
        assert_eq!(out.min.x, -1.0);
        assert_eq!(out.max.y, 5.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut a = create_aabb(-1.0, -2.0, -3.0, 4.0, 5.0, 6.0);
        let a_clone = clone_aabb(&a);
        copy_aabb(&mut a, &a_clone);
        assert_eq!(a.min.x, -1.0);
        assert_eq!(a.max.z, 6.0);
    }
}

mod create_aabb {
    use super::*;

    #[test]
    fn creates_an_empty_box_with_infinity_values() {
        let a = create_aabb(
            f32::INFINITY, f32::INFINITY, f32::INFINITY,
            f32::NEG_INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY,
        );
        assert_eq!(a.min.x, f32::INFINITY);
        assert_eq!(a.max.x, f32::NEG_INFINITY);
    }

    #[test]
    fn uses_provided_corners() {
        let a = create_aabb(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!(a.min.x, 1.0);
        assert_eq!(a.max.z, 6.0);
    }
}

mod expand_aabb_by_point {
    use super::*;

    #[test]
    fn an_empty_box_snaps_exactly_to_the_first_point() {
        let a = create_aabb(
            f32::INFINITY, f32::INFINITY, f32::INFINITY,
            f32::NEG_INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY,
        );
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        expand_aabb_by_point(&mut out, &a, &create_vector3(2.0, 3.0, 4.0));
        assert_eq!(out.min.x, 2.0);
        assert_eq!(out.max.x, 2.0);
        assert_eq!(out.min.z, 4.0);
        assert_eq!(out.max.z, 4.0);
    }

    #[test]
    fn grows_to_include_a_point_outside_the_box() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        expand_aabb_by_point(&mut out, &a, &create_vector3(-5.0, 2.0, 0.5));
        assert_eq!(out.min.x, -5.0);
        assert_eq!(out.max.y, 2.0);
        assert_eq!(out.max.z, 1.0);
    }

    #[test]
    fn supports_out_equals_aabb() {
        let mut a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let a_clone = clone_aabb(&a);
        expand_aabb_by_point(&mut a, &a_clone, &create_vector3(3.0, -3.0, 3.0));
        assert_eq!(a.min.y, -3.0);
        assert_eq!(a.max.x, 3.0);
    }
}

mod expand_aabb_by_sphere {
    use super::*;

    #[test]
    fn grows_the_box_to_contain_the_sphere() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let s = create_bounding_sphere(0.0, 0.0, 0.0, 3.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        expand_aabb_by_sphere(&mut out, &a, &s);
        assert_eq!(out.min.x, -3.0);
        assert_eq!(out.max.x, 3.0);
        assert_eq!(out.min.y, -3.0);
        assert_eq!(out.max.y, 3.0);
    }

    #[test]
    fn an_empty_sphere_leaves_the_box_unchanged() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let s = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        expand_aabb_by_sphere(&mut out, &a, &s);
        assert_eq!(out.min.x, 0.0);
        assert_eq!(out.max.x, 1.0);
    }

    #[test]
    fn supports_out_equals_aabb() {
        let mut a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let s = create_bounding_sphere(5.0, 0.0, 0.0, 1.0);
        let a_clone = clone_aabb(&a);
        expand_aabb_by_sphere(&mut a, &a_clone, &s);
        assert_eq!(a.max.x, 6.0);
    }
}

mod get_aabb_center {
    use super::*;

    #[test]
    fn writes_the_midpoint_of_the_corners() {
        let a = create_aabb(-2.0, -4.0, -6.0, 2.0, 4.0, 6.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_aabb_center(&mut out, &a);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 0.0);
    }
}

mod get_aabb_extents {
    use super::*;

    #[test]
    fn writes_half_widths_of_the_box() {
        let a = create_aabb(-2.0, -4.0, -6.0, 2.0, 4.0, 6.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_aabb_extents(&mut out, &a);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 4.0);
        assert_eq!(out.z, 6.0);
    }
}

mod get_aabb_size {
    use super::*;

    #[test]
    fn writes_the_full_width_height_depth() {
        let a = create_aabb(-1.0, -2.0, -3.0, 3.0, 6.0, 9.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_aabb_size(&mut out, &a);
        assert_eq!(out.x, 4.0);
        assert_eq!(out.y, 8.0);
        assert_eq!(out.z, 12.0);
    }
}

mod get_closest_point_on_aabb {
    use super::*;

    #[test]
    fn clamps_an_outside_point_to_the_nearest_face() {
        let a = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_aabb(&mut out, &a, &create_vector3(5.0, -1.0, 1.0));
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 1.0);
    }

    #[test]
    fn returns_the_point_unchanged_when_it_is_inside_the_box() {
        let a = create_aabb(0.0, 0.0, 0.0, 4.0, 4.0, 4.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_aabb(&mut out, &a, &create_vector3(1.0, 2.0, 3.0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let a = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let mut p = create_vector3(-3.0, 5.0, 1.0);
        let p_clone = clone_vector3(&p);
        get_closest_point_on_aabb(&mut p, &a, &p_clone);
        assert_eq!(p.x, 0.0);
        assert_eq!(p.y, 2.0);
        assert_eq!(p.z, 1.0);
    }
}

mod initialize_aabb {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_aabb() {
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        initialize_aabb(
            &mut out,
            &create_vector3(-1.0, -2.0, -3.0),
            &create_vector3(4.0, 5.0, 6.0),
        );
        assert_eq!(out.min.x, -1.0);
        assert_eq!(out.min.y, -2.0);
        assert_eq!(out.min.z, -3.0);
        assert_eq!(out.max.x, 4.0);
        assert_eq!(out.max.y, 5.0);
        assert_eq!(out.max.z, 6.0);
    }
}

mod intersect_aabb {
    use super::*;

    #[test]
    fn produces_the_overlapping_sub_box_for_two_overlapping_boxes() {
        let a = create_aabb(0.0, 0.0, 0.0, 4.0, 4.0, 4.0);
        let b = create_aabb(2.0, 2.0, 2.0, 6.0, 6.0, 6.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        intersect_aabb(&mut out, &a, &b);
        assert_eq!(out.min.x, 2.0);
        assert_eq!(out.max.x, 4.0);
        assert_eq!(out.min.y, 2.0);
        assert_eq!(out.max.y, 4.0);
    }

    #[test]
    fn produces_an_empty_box_for_non_overlapping_boxes() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = create_aabb(5.0, 5.0, 5.0, 6.0, 6.0, 6.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        intersect_aabb(&mut out, &a, &b);
        assert!(out.min.x > out.max.x);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_aabb(0.0, 0.0, 0.0, 4.0, 4.0, 4.0);
        let b = create_aabb(2.0, 2.0, 2.0, 6.0, 6.0, 6.0);
        let a_clone = clone_aabb(&a);
        intersect_aabb(&mut a, &a_clone, &b);
        assert_eq!(a.min.x, 2.0);
        assert_eq!(a.max.x, 4.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_aabb(0.0, 0.0, 0.0, 4.0, 4.0, 4.0);
        let mut b = create_aabb(2.0, 2.0, 2.0, 6.0, 6.0, 6.0);
        let b_clone = clone_aabb(&b);
        intersect_aabb(&mut b, &a, &b_clone);
        assert_eq!(b.min.x, 2.0);
        assert_eq!(b.min.y, 2.0);
        assert_eq!(b.min.z, 2.0);
        assert_eq!(b.max.x, 4.0);
        assert_eq!(b.max.y, 4.0);
        assert_eq!(b.max.z, 4.0);
    }
}

mod is_aabb_intersecting_aabb {
    use super::*;

    #[test]
    fn returns_true_for_overlapping_boxes() {
        let a = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let b = create_aabb(1.0, 1.0, 1.0, 3.0, 3.0, 3.0);
        assert!(is_aabb_intersecting_aabb(&a, &b));
    }

    #[test]
    fn returns_true_for_touching_boxes() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = create_aabb(1.0, 0.0, 0.0, 2.0, 1.0, 1.0);
        assert!(is_aabb_intersecting_aabb(&a, &b));
    }

    #[test]
    fn returns_false_for_separated_boxes() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = create_aabb(5.0, 5.0, 5.0, 6.0, 6.0, 6.0);
        assert!(!is_aabb_intersecting_aabb(&a, &b));
    }

    #[test]
    fn returns_false_when_either_box_is_empty_on_x() {
        let empty = create_aabb(1.0, 0.0, 0.0, 0.0, 1.0, 1.0);
        let full = create_aabb(-10.0, -10.0, -10.0, 10.0, 10.0, 10.0);
        assert!(!is_aabb_intersecting_aabb(&empty, &full));
        assert!(!is_aabb_intersecting_aabb(&full, &empty));
    }

    #[test]
    fn returns_false_when_either_box_is_empty_on_y() {
        let empty = create_aabb(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
        let full = create_aabb(-10.0, -10.0, -10.0, 10.0, 10.0, 10.0);
        assert!(!is_aabb_intersecting_aabb(&empty, &full));
        assert!(!is_aabb_intersecting_aabb(&full, &empty));
    }

    #[test]
    fn returns_false_when_either_box_is_empty_on_z() {
        let empty = create_aabb(0.0, 0.0, 1.0, 1.0, 1.0, 0.0);
        let full = create_aabb(-10.0, -10.0, -10.0, 10.0, 10.0, 10.0);
        assert!(!is_aabb_intersecting_aabb(&empty, &full));
        assert!(!is_aabb_intersecting_aabb(&full, &empty));
    }
}

mod is_aabb_intersecting_sphere {
    use super::*;

    #[test]
    fn returns_true_when_sphere_center_is_inside_the_box() {
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 0.5);
        assert!(is_aabb_intersecting_sphere(&aabb, &sphere));
    }

    #[test]
    fn returns_true_when_sphere_overlaps_a_face() {
        let aabb = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let sphere = create_bounding_sphere(3.0, 1.0, 1.0, 1.5);
        assert!(is_aabb_intersecting_sphere(&aabb, &sphere));
    }

    #[test]
    fn returns_false_when_sphere_is_fully_outside() {
        let aabb = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let sphere = create_bounding_sphere(5.0, 5.0, 5.0, 1.0);
        assert!(!is_aabb_intersecting_sphere(&aabb, &sphere));
    }

    #[test]
    fn returns_false_for_an_empty_aabb() {
        let aabb = create_aabb(1.0, 0.0, 0.0, 0.0, 1.0, 1.0);
        let sphere = create_bounding_sphere(0.5, 0.5, 0.5, 10.0);
        assert!(!is_aabb_intersecting_sphere(&aabb, &sphere));
    }

    #[test]
    fn returns_false_for_a_negative_radius_sphere() {
        let aabb = create_aabb(-10.0, -10.0, -10.0, 10.0, 10.0, 10.0);
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        assert!(!is_aabb_intersecting_sphere(&aabb, &sphere));
    }
}

mod set_aabb {
    use super::*;

    #[test]
    fn sets_both_corners() {
        let mut a = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_aabb(&mut a, -1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(a.min.x, -1.0);
        assert_eq!(a.max.z, 1.0);
    }
}

mod set_aabb_from_points {
    use super::*;

    #[test]
    fn computes_the_tight_box_over_a_set_of_points() {
        let mut a = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let points = [
            create_vector3(1.0, 5.0, -2.0),
            create_vector3(-3.0, 0.0, 4.0),
            create_vector3(2.0, 2.0, 2.0),
        ];
        set_aabb_from_points(&mut a, &points);
        assert_eq!(a.min.x, -3.0);
        assert_eq!(a.min.y, 0.0);
        assert_eq!(a.min.z, -2.0);
        assert_eq!(a.max.x, 2.0);
        assert_eq!(a.max.y, 5.0);
        assert_eq!(a.max.z, 4.0);
    }

    #[test]
    fn empty_list_yields_an_empty_box() {
        let mut a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        set_aabb_from_points(&mut a, &[]);
        assert_eq!(a.min.x, f32::INFINITY);
        assert_eq!(a.max.x, f32::NEG_INFINITY);
    }
}

mod transform_aabb_by_matrix4 {
    use super::*;

    #[test]
    fn translates_the_box() {
        let a = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let mut m = create_matrix4();
        m.m[12] = 10.0;
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        transform_aabb_by_matrix4(&mut out, &a, &m);
        assert_approx_tight(out.min.x, 9.0);
        assert_approx_tight(out.max.x, 11.0);
        assert_approx_tight(out.min.y, -1.0);
    }

    #[test]
    fn grows_the_box_under_a_45_degree_rotation_about_z() {
        let a = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let c = FRAC_1_SQRT_2;
        let m = create_matrix4_from_values(
            c, c, 0.0, 0.0, -c, c, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        transform_aabb_by_matrix4(&mut out, &a, &m);
        assert_approx(out.max.x, SQRT_2);
        assert_approx(out.min.x, -SQRT_2);
        assert_approx_tight(out.max.z, 1.0);
    }

    #[test]
    fn supports_out_equals_aabb() {
        let mut a = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let mut m = create_matrix4();
        m.m[12] = 5.0;
        m.m[13] = 5.0;
        m.m[14] = 5.0;
        let a_clone = clone_aabb(&a);
        transform_aabb_by_matrix4(&mut a, &a_clone, &m);
        assert_approx_tight(a.min.x, 4.0);
        assert_approx_tight(a.max.z, 6.0);
    }
}

mod union_aabb {
    use super::*;

    #[test]
    fn encloses_both_boxes() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = create_aabb(-2.0, 3.0, -1.0, -1.0, 5.0, 0.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        union_aabb(&mut out, &a, &b);
        assert_eq!(out.min.x, -2.0);
        assert_eq!(out.min.z, -1.0);
        assert_eq!(out.max.y, 5.0);
        assert_eq!(out.max.x, 1.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = create_aabb(-2.0, 0.0, 0.0, 0.0, 4.0, 0.0);
        let a_clone = clone_aabb(&a);
        union_aabb(&mut a, &a_clone, &b);
        assert_eq!(a.min.x, -2.0);
        assert_eq!(a.max.y, 4.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let mut b = create_aabb(-2.0, 0.0, 0.0, 0.0, 4.0, 0.0);
        let b_clone = clone_aabb(&b);
        union_aabb(&mut b, &a, &b_clone);
        assert_eq!(b.min.x, -2.0);
        assert_eq!(b.max.y, 4.0);
    }
}
