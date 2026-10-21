use flight_geometry::*;
use std::f32::consts::PI;

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

mod add_vector3 {
    use super::*;

    #[test]
    fn adds_two_vectors() {
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(4.0, 5.0, 6.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        add_vector3(&mut result, &a, &b);
        assert_eq!(result.x, 5.0);
        assert_eq!(result.y, 7.0);
        assert_eq!(result.z, 9.0);
    }

    #[test]
    fn works_correctly_if_first_vector_is_out() {
        let mut a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(4.0, 5.0, 6.0);
        let a_clone = clone_vector3(&a);
        add_vector3(&mut a, &a_clone, &b);
        assert_eq!(a.x, 5.0);
        assert_eq!(a.y, 7.0);
        assert_eq!(a.z, 9.0);
    }

    #[test]
    fn works_correctly_if_second_vector_is_out() {
        let a = create_vector3(1.0, 2.0, 3.0);
        let mut b = create_vector3(4.0, 5.0, 6.0);
        let b_clone = clone_vector3(&b);
        add_vector3(&mut b, &a, &b_clone);
        assert_eq!(b.x, 5.0);
        assert_eq!(b.y, 7.0);
        assert_eq!(b.z, 9.0);
    }
}

mod clamp_vector3 {
    use super::*;

    #[test]
    fn clamps_each_component_to_its_own_bounds_below_above_and_not_at_all() {
        let min = create_vector3(-1.0, -2.0, -3.0);
        let max = create_vector3(10.0, 20.0, 30.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);

        clamp_vector3(&mut out, &create_vector3(-5.0, -6.0, -7.0), &min, &max);
        assert_eq!(out.x, -1.0);
        assert_eq!(out.y, -2.0);
        assert_eq!(out.z, -3.0);

        clamp_vector3(&mut out, &create_vector3(100.0, 200.0, 300.0), &min, &max);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.z, 30.0);

        clamp_vector3(&mut out, &create_vector3(0.0, 1.0, 2.0), &min, &max);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 1.0);
        assert_eq!(out.z, 2.0);
    }

    #[test]
    fn clamps_each_component_independently() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        clamp_vector3(
            &mut out,
            &create_vector3(5.0, -2.0, 1.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(3.0, 3.0, 3.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 1.0);
    }

    #[test]
    fn supports_out_equals_value() {
        let mut v = create_vector3(5.0, -1.0, 7.0);
        let v_clone = clone_vector3(&v);
        clamp_vector3(
            &mut v,
            &v_clone,
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(3.0, 3.0, 3.0),
        );
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 0.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn supports_out_equals_min_or_max() {
        let mut min = create_vector3(0.0, 0.0, 0.0);
        let min_clone = clone_vector3(&min);
        clamp_vector3(
            &mut min,
            &create_vector3(5.0, -2.0, 1.0),
            &min_clone,
            &create_vector3(3.0, 3.0, 3.0),
        );
        assert_eq!(min.x, 3.0);
        assert_eq!(min.y, 0.0);
        assert_eq!(min.z, 1.0);

        let mut max = create_vector3(3.0, 3.0, 3.0);
        let max_clone = clone_vector3(&max);
        clamp_vector3(
            &mut max,
            &create_vector3(5.0, -2.0, 1.0),
            &create_vector3(0.0, 0.0, 0.0),
            &max_clone,
        );
        assert_eq!(max.x, 3.0);
        assert_eq!(max.y, 0.0);
        assert_eq!(max.z, 1.0);
    }

    #[test]
    fn covers_every_clamp_outcome_on_every_component() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        clamp_vector3(
            &mut out,
            &create_vector3(-1.0, 2.0, 5.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(3.0, 3.0, 3.0),
        );
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);

        clamp_vector3(
            &mut out,
            &create_vector3(2.0, 5.0, -1.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(3.0, 3.0, 3.0),
        );
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
        assert_eq!(out.z, 0.0);
    }
}

mod clone_vector3 {
    use super::*;

    #[test]
    fn creates_a_new_independent_vector() {
        let original = create_vector3(1.0, 2.0, 3.0);
        let cloned = clone_vector3(&original);
        assert_eq!(cloned.x, 1.0);
        assert_eq!(cloned.y, 2.0);
        assert_eq!(cloned.z, 3.0);
    }
}

mod copy_vector3 {
    use super::*;

    #[test]
    fn copies_values_from_source_to_target() {
        let source = create_vector3(1.0, 2.0, 3.0);
        let mut target = create_vector3(0.0, 0.0, 0.0);
        copy_vector3(&mut target, &source);
        assert_eq!(target.x, 1.0);
        assert_eq!(target.y, 2.0);
        assert_eq!(target.z, 3.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector3(1.0, 2.0, 3.0);
        let v_clone = clone_vector3(&v);
        copy_vector3(&mut v, &v_clone);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }
}

mod create_vector3 {
    use super::*;

    #[test]
    fn returns_a_vector3_with_default_coordinates() {
        let v = create_vector3(0.0, 0.0, 0.0);
        assert_eq!(v.x, 0.0);
        assert_eq!(v.y, 0.0);
        assert_eq!(v.z, 0.0);
    }

    #[test]
    fn sets_the_specified_x_y_and_z_coordinates() {
        let v = create_vector3(1.0, 2.0, 3.0);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn x_axis_constant() {
        assert_eq!(VECTOR3_X_AXIS.x, 1.0);
        assert_eq!(VECTOR3_X_AXIS.y, 0.0);
        assert_eq!(VECTOR3_X_AXIS.z, 0.0);
    }

    #[test]
    fn y_axis_constant() {
        assert_eq!(VECTOR3_Y_AXIS.x, 0.0);
        assert_eq!(VECTOR3_Y_AXIS.y, 1.0);
        assert_eq!(VECTOR3_Y_AXIS.z, 0.0);
    }

    #[test]
    fn z_axis_constant() {
        assert_eq!(VECTOR3_Z_AXIS.x, 0.0);
        assert_eq!(VECTOR3_Z_AXIS.y, 0.0);
        assert_eq!(VECTOR3_Z_AXIS.z, 1.0);
    }
}

mod create_vector3_from_spherical {
    use super::*;

    #[test]
    fn produces_the_correct_cartesian_point() {
        let v = create_vector3_from_spherical(1.0, PI / 2.0, 0.0);
        assert_approx_tight(v.x, 1.0);
        assert_approx_tight(v.y, 0.0);
        assert_approx_tight(v.z, 0.0);
    }

    #[test]
    fn round_trips_with_get_vector3_spherical() {
        let v = create_vector3_from_spherical(2.0, PI / 3.0, PI / 4.0);
        let mut sph = create_vector3(0.0, 0.0, 0.0);
        get_vector3_spherical(&mut sph, &v);
        assert_approx(sph.x, 2.0);
        assert_approx(sph.y, PI / 3.0);
        assert_approx(sph.z, PI / 4.0);
    }
}

mod cross_vector3 {
    use super::*;

    #[test]
    fn returns_the_cross_product_of_two_vectors() {
        let a = create_vector3(1.0, 0.0, 0.0);
        let b = create_vector3(0.0, 1.0, 0.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        cross_vector3(&mut result, &a, &b);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
        assert_eq!(result.z, 1.0);
    }

    #[test]
    fn works_correctly_if_source_is_out() {
        let mut a = create_vector3(1.0, 0.0, 0.0);
        let b = create_vector3(0.0, 1.0, 0.0);
        let a_clone = clone_vector3(&a);
        cross_vector3(&mut a, &a_clone, &b);
        assert_eq!(a.x, 0.0);
        assert_eq!(a.y, 0.0);
        assert_eq!(a.z, 1.0);
    }

    #[test]
    fn works_correctly_if_other_is_out() {
        let a = create_vector3(1.0, 0.0, 0.0);
        let mut b = create_vector3(0.0, 1.0, 0.0);
        let b_clone = clone_vector3(&b);
        cross_vector3(&mut b, &a, &b_clone);
        assert_eq!(b.x, 0.0);
        assert_eq!(b.y, 0.0);
        assert_eq!(b.z, 1.0);
    }
}

mod divide_vector3 {
    use super::*;

    #[test]
    fn gives_zero_for_a_zero_divisor_on_each_component_in_turn() {
        let source = create_vector3(6.0, 8.0, 9.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);

        divide_vector3(&mut out, &source, &create_vector3(0.0, 4.0, 3.0));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);

        divide_vector3(&mut out, &source, &create_vector3(2.0, 0.0, 3.0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 3.0);

        divide_vector3(&mut out, &source, &create_vector3(2.0, 4.0, 0.0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 0.0);
    }

    #[test]
    fn divides_component_wise() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        divide_vector3(
            &mut out,
            &create_vector3(6.0, 8.0, 9.0),
            &create_vector3(2.0, 4.0, 3.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn produces_zero_for_zero_divisor_components() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        divide_vector3(
            &mut out,
            &create_vector3(6.0, 8.0, 9.0),
            &create_vector3(0.0, 4.0, 0.0),
        );
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 0.0);
    }

    #[test]
    fn produces_zero_for_a_zero_y_divisor() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        divide_vector3(
            &mut out,
            &create_vector3(6.0, 8.0, 9.0),
            &create_vector3(2.0, 0.0, 3.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector3(6.0, 8.0, 9.0);
        let v_clone = clone_vector3(&v);
        divide_vector3(&mut v, &v_clone, &create_vector3(2.0, 4.0, 3.0));
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn supports_out_equals_divisor() {
        let mut divisor = create_vector3(2.0, 4.0, 3.0);
        let divisor_clone = clone_vector3(&divisor);
        divide_vector3(&mut divisor, &create_vector3(6.0, 8.0, 9.0), &divisor_clone);
        assert_eq!(divisor.x, 3.0);
        assert_eq!(divisor.y, 2.0);
        assert_eq!(divisor.z, 3.0);
    }
}

mod equals_vector3 {
    use super::*;

    #[test]
    fn returns_false_when_both_are_none() {
        assert!(!equals_vector3(None, None));
    }

    #[test]
    fn returns_false_when_either_vector_is_absent() {
        let v = create_vector3(1.0, 2.0, 3.0);
        assert!(!equals_vector3(Some(&v), None));
        assert!(!equals_vector3(None, Some(&v)));
    }

    #[test]
    fn returns_true_if_vectors_are_identical_false_otherwise() {
        let a = create_vector3(0.0, 0.0, 0.0);
        let b = create_vector3(0.0, 0.0, 0.0);
        assert!(equals_vector3(Some(&a), Some(&b)));

        let c = create_vector3(1.0, 0.0, 0.0);
        assert!(!equals_vector3(Some(&c), Some(&b)));

        let d = create_vector3(1.0, 0.0, 0.0);
        assert!(equals_vector3(Some(&c), Some(&d)));
    }

    #[test]
    fn compares_every_component_not_just_the_first() {
        let a = create_vector3(1.0, 2.0, 3.0);
        assert!(!equals_vector3(Some(&a), Some(&create_vector3(9.0, 2.0, 3.0))));
        assert!(!equals_vector3(Some(&a), Some(&create_vector3(1.0, 9.0, 3.0))));
        assert!(!equals_vector3(Some(&a), Some(&create_vector3(1.0, 2.0, 9.0))));
    }

    #[test]
    fn returns_true_for_same_reference() {
        let v = create_vector3(5.0, 10.0, 15.0);
        assert!(equals_vector3(Some(&v), Some(&v)));
    }

    #[test]
    fn holds_a_vector_equal_to_itself_even_with_a_nan_component() {
        let nan_vec = create_vector3(f32::NAN, 2.0, 3.0);
        assert!(equals_vector3(Some(&nan_vec), Some(&nan_vec)));
        assert!(!equals_vector3(
            Some(&nan_vec),
            Some(&create_vector3(f32::NAN, 2.0, 3.0))
        ));
    }
}

mod get_vector3_angle_between {
    use super::*;

    #[test]
    fn returns_zero_for_identical_vectors() {
        let a = create_vector3(1.0, 0.0, 0.0);
        assert_approx(get_vector3_angle_between(&a, &a), 0.0);
    }

    #[test]
    fn returns_pi_over_2_for_perpendicular_vectors() {
        let a = create_vector3(1.0, 0.0, 0.0);
        let b = create_vector3(0.0, 1.0, 0.0);
        assert_approx(get_vector3_angle_between(&a, &b), PI / 2.0);
    }

    #[test]
    fn returns_pi_for_opposite_vectors() {
        let a = create_vector3(1.0, 0.0, 0.0);
        let b = create_vector3(-1.0, 0.0, 0.0);
        assert_approx(get_vector3_angle_between(&a, &b), PI);
    }

    #[test]
    fn returns_nan_for_a_zero_length_vector() {
        let a = create_vector3(0.0, 0.0, 0.0);
        let b = create_vector3(1.0, 0.0, 0.0);
        assert!(get_vector3_angle_between(&a, &b).is_nan());
    }
}

mod get_vector3_distance {
    use super::*;

    #[test]
    fn returns_the_distance_between_two_vectors() {
        let a = create_vector3(1.0, 1.0, 1.0);
        let b = create_vector3(4.0, 5.0, 6.0);
        assert_approx(get_vector3_distance(&a, &b), 7.071068);
    }
}

mod get_vector3_distance_squared {
    use super::*;

    #[test]
    fn returns_the_squared_distance_between_two_vectors() {
        let a = create_vector3(1.0, 1.0, 1.0);
        let b = create_vector3(4.0, 5.0, 6.0);
        assert_eq!(get_vector3_distance_squared(&a, &b), 50.0);
    }
}

mod get_vector3_dot {
    use super::*;

    #[test]
    fn returns_the_dot_product_of_two_vectors() {
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(4.0, 5.0, 6.0);
        assert_eq!(get_vector3_dot(&a, &b), 32.0);
    }
}

mod get_vector3_length {
    use super::*;

    #[test]
    fn returns_the_length_of_the_vector() {
        let v = create_vector3(3.0, 4.0, 0.0);
        assert_eq!(get_vector3_length(&v), 5.0);
    }
}

mod get_vector3_length_squared {
    use super::*;

    #[test]
    fn returns_the_squared_length_of_the_vector() {
        let v = create_vector3(3.0, 4.0, 0.0);
        assert_eq!(get_vector3_length_squared(&v), 25.0);
    }
}

mod get_vector3_spherical {
    use super::*;

    #[test]
    fn returns_radius_theta_phi_for_a_known_point() {
        let v = create_vector3(1.0, 0.0, 0.0);
        let mut sph = create_vector3(0.0, 0.0, 0.0);
        get_vector3_spherical(&mut sph, &v);
        assert_approx_tight(sph.x, 1.0);
        assert_approx_tight(sph.y, PI / 2.0);
        assert_approx_tight(sph.z, 0.0);
    }

    #[test]
    fn handles_zero_vector() {
        let mut sph = create_vector3(0.0, 0.0, 0.0);
        get_vector3_spherical(&mut sph, &create_vector3(0.0, 0.0, 0.0));
        assert_eq!(sph.x, 0.0);
        assert_eq!(sph.y, 0.0);
        assert_eq!(sph.z, 0.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut vector = create_vector3(1.0, 0.0, 0.0);
        let vector_clone = clone_vector3(&vector);
        get_vector3_spherical(&mut vector, &vector_clone);
        assert_approx_tight(vector.x, 1.0);
        assert_approx_tight(vector.y, PI / 2.0);
        assert_approx_tight(vector.z, 0.0);
    }
}

mod initialize_vector3 {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_vector3() {
        let mut v = create_vector3(0.0, 0.0, 0.0);
        initialize_vector3(&mut v, 3.0, 7.0, 11.0);
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 7.0);
        assert_eq!(v.z, 11.0);
    }
}

mod interpolate_vector3 {
    use super::*;

    #[test]
    fn returns_a_at_t_zero() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(4.0, 5.0, 6.0);
        interpolate_vector3(&mut out, &a, &b, 0.0);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn returns_b_at_t_one() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(4.0, 5.0, 6.0);
        interpolate_vector3(&mut out, &a, &b, 1.0);
        assert_eq!(out.x, 4.0);
        assert_eq!(out.y, 5.0);
        assert_eq!(out.z, 6.0);
    }

    #[test]
    fn interpolates_midpoint_at_t_half() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        interpolate_vector3(
            &mut out,
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(2.0, 4.0, 6.0),
            0.5,
        );
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn works_correctly_if_out_is_the_first_vector() {
        let mut a = create_vector3(0.0, 0.0, 0.0);
        let b = create_vector3(2.0, 4.0, 6.0);
        let a_clone = clone_vector3(&a);
        interpolate_vector3(&mut a, &a_clone, &b, 0.5);
        assert_eq!(a.x, 1.0);
        assert_eq!(a.y, 2.0);
        assert_eq!(a.z, 3.0);
    }

    #[test]
    fn works_correctly_if_out_is_the_second_vector() {
        let a = create_vector3(0.0, 0.0, 0.0);
        let mut b = create_vector3(2.0, 4.0, 6.0);
        let b_clone = clone_vector3(&b);
        interpolate_vector3(&mut b, &a, &b_clone, 0.5);
        assert_eq!(b.x, 1.0);
        assert_eq!(b.y, 2.0);
        assert_eq!(b.z, 3.0);
    }
}

mod max_vector3 {
    use super::*;

    #[test]
    fn takes_each_component_from_whichever_side_wins_and_gives_the_same_answer_either_way_round() {
        let a = create_vector3(1.0, 5.0, 2.0);
        let b = create_vector3(3.0, 0.0, 7.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);

        max_vector3(&mut out, &a, &b);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 5.0);
        assert_eq!(out.z, 7.0);

        max_vector3(&mut out, &b, &a);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 5.0);
        assert_eq!(out.z, 7.0);
    }

    #[test]
    fn returns_the_component_wise_maximum() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        max_vector3(
            &mut out,
            &create_vector3(1.0, 5.0, 2.0),
            &create_vector3(3.0, 2.0, 7.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 5.0);
        assert_eq!(out.z, 7.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_vector3(1.0, 5.0, 2.0);
        let a_clone = clone_vector3(&a);
        max_vector3(&mut a, &a_clone, &create_vector3(3.0, 2.0, 7.0));
        assert_eq!(a.x, 3.0);
        assert_eq!(a.y, 5.0);
        assert_eq!(a.z, 7.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let mut b = create_vector3(3.0, 2.0, 7.0);
        let b_clone = clone_vector3(&b);
        max_vector3(&mut b, &create_vector3(1.0, 5.0, 2.0), &b_clone);
        assert_eq!(b.x, 3.0);
        assert_eq!(b.y, 5.0);
        assert_eq!(b.z, 7.0);
    }

    #[test]
    fn selects_the_complementary_component_outcomes() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        max_vector3(
            &mut out,
            &create_vector3(5.0, 1.0, 7.0),
            &create_vector3(2.0, 3.0, 4.0),
        );
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 3.0);
        assert_eq!(out.z, 7.0);
    }
}

mod min_vector3 {
    use super::*;

    #[test]
    fn takes_each_component_from_whichever_side_wins_and_gives_the_same_answer_either_way_round() {
        let a = create_vector3(1.0, 5.0, 2.0);
        let b = create_vector3(3.0, 0.0, 7.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);

        min_vector3(&mut out, &a, &b);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 2.0);

        min_vector3(&mut out, &b, &a);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 2.0);
    }

    #[test]
    fn returns_the_component_wise_minimum() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        min_vector3(
            &mut out,
            &create_vector3(1.0, 5.0, 2.0),
            &create_vector3(3.0, 2.0, 7.0),
        );
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 2.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_vector3(1.0, 5.0, 2.0);
        let a_clone = clone_vector3(&a);
        min_vector3(&mut a, &a_clone, &create_vector3(3.0, 2.0, 7.0));
        assert_eq!(a.x, 1.0);
        assert_eq!(a.y, 2.0);
        assert_eq!(a.z, 2.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let mut b = create_vector3(3.0, 2.0, 7.0);
        let b_clone = clone_vector3(&b);
        min_vector3(&mut b, &create_vector3(1.0, 5.0, 2.0), &b_clone);
        assert_eq!(b.x, 1.0);
        assert_eq!(b.y, 2.0);
        assert_eq!(b.z, 2.0);
    }

    #[test]
    fn selects_the_complementary_component_outcomes() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        min_vector3(
            &mut out,
            &create_vector3(5.0, 1.0, 7.0),
            &create_vector3(2.0, 3.0, 4.0),
        );
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 1.0);
        assert_eq!(out.z, 4.0);
    }
}

mod multiply_vector3 {
    use super::*;

    #[test]
    fn multiplies_component_wise_hadamard() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        multiply_vector3(
            &mut out,
            &create_vector3(2.0, 3.0, 4.0),
            &create_vector3(5.0, 6.0, 7.0),
        );
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 18.0);
        assert_eq!(out.z, 28.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_vector3(2.0, 3.0, 4.0);
        let a_clone = clone_vector3(&a);
        multiply_vector3(&mut a, &a_clone, &create_vector3(5.0, 6.0, 7.0));
        assert_eq!(a.x, 10.0);
        assert_eq!(a.y, 18.0);
        assert_eq!(a.z, 28.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let mut b = create_vector3(5.0, 6.0, 7.0);
        let b_clone = clone_vector3(&b);
        multiply_vector3(&mut b, &create_vector3(2.0, 3.0, 4.0), &b_clone);
        assert_eq!(b.x, 10.0);
        assert_eq!(b.y, 18.0);
        assert_eq!(b.z, 28.0);
    }
}

mod near_equals_vector3 {
    use super::*;

    #[test]
    fn returns_true_for_identical_vectors() {
        let a = create_vector3(1.0, 2.0, 3.0);
        assert!(near_equals_vector3(&a, &a, 1e-6));
    }

    #[test]
    fn returns_true_when_difference_is_within_default_tolerance() {
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(1.0 + 1e-7, 2.0, 3.0);
        assert!(near_equals_vector3(&a, &b, 1e-6));
    }

    #[test]
    fn returns_false_when_difference_exceeds_default_tolerance() {
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(1.0 + 1e-5, 2.0, 3.0);
        assert!(!near_equals_vector3(&a, &b, 1e-6));
    }

    #[test]
    fn respects_a_custom_tolerance() {
        let a = create_vector3(1.0, 2.0, 3.0);
        let b = create_vector3(1.05, 2.0, 3.0);
        assert!(near_equals_vector3(&a, &b, 0.1));
        assert!(!near_equals_vector3(&a, &b, 0.01));
    }
}

mod negate_vector3 {
    use super::*;

    #[test]
    fn inverts_the_values_of_the_vector_components() {
        let v = create_vector3(1.0, -2.0, 3.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        negate_vector3(&mut result, &v);
        assert_eq!(result.x, -1.0);
        assert_eq!(result.y, 2.0);
        assert_eq!(result.z, -3.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector3(1.0, -2.0, 3.0);
        let v_clone = clone_vector3(&v);
        negate_vector3(&mut v, &v_clone);
        assert_eq!(v.x, -1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, -3.0);
    }
}

mod normalize_vector3 {
    use super::*;

    #[test]
    fn normalizes_the_vector() {
        let v = create_vector3(3.0, 4.0, 0.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        let length = normalize_vector3(&mut result, &v);
        assert_approx(result.x, 0.6);
        assert_approx(result.y, 0.8);
        assert_eq!(result.z, 0.0);
        assert_eq!(length, 5.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector3(3.0, 4.0, 0.0);
        let v_clone = clone_vector3(&v);
        let length = normalize_vector3(&mut v, &v_clone);
        assert_approx(v.x, 0.6);
        assert_approx(v.y, 0.8);
        assert_eq!(v.z, 0.0);
        assert_eq!(length, 5.0);
    }

    #[test]
    fn writes_zero_to_out_for_a_zero_length_source() {
        let v = create_vector3(0.0, 0.0, 0.0);
        let mut result = create_vector3(1.0, 2.0, 3.0);
        let length = normalize_vector3(&mut result, &v);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
        assert_eq!(result.z, 0.0);
        assert_eq!(length, 0.0);
    }
}

mod offset_vector3 {
    use super::*;

    #[test]
    fn offsets_each_component_by_a_scalar_per_axis() {
        let v = create_vector3(1.0, 2.0, 3.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        offset_vector3(&mut result, &v, 10.0, 20.0, 30.0);
        assert_eq!(result.x, 11.0);
        assert_eq!(result.y, 22.0);
        assert_eq!(result.z, 33.0);
    }

    #[test]
    fn works_with_negative_deltas() {
        let v = create_vector3(1.0, 2.0, 3.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        offset_vector3(&mut result, &v, -5.0, -10.0, -15.0);
        assert_eq!(result.x, -4.0);
        assert_eq!(result.y, -8.0);
        assert_eq!(result.z, -12.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector3(1.0, 2.0, 3.0);
        let v_clone = clone_vector3(&v);
        offset_vector3(&mut v, &v_clone, 3.0, 4.0, 5.0);
        assert_eq!(v.x, 4.0);
        assert_eq!(v.y, 6.0);
        assert_eq!(v.z, 8.0);
    }
}

mod project_vector3 {
    use super::*;

    #[test]
    fn divides_x_and_y_by_z_to_produce_a_2d_point() {
        let v = create_vector3(4.0, 6.0, 2.0);
        let mut out = create_vector2(0.0, 0.0);
        project_vector3(&mut out, &v);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn returns_the_original_xy_when_z_is_one() {
        let v = create_vector3(5.0, 7.0, 1.0);
        let mut out = create_vector2(0.0, 0.0);
        project_vector3(&mut out, &v);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 7.0);
    }
}

mod reflect_vector3 {
    use super::*;

    #[test]
    fn reflects_incident_vector_about_the_x_axis_normal() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        reflect_vector3(
            &mut out,
            &create_vector3(1.0, -1.0, 0.0),
            &create_vector3(1.0, 0.0, 0.0),
        );
        assert_approx_tight(out.x, -1.0);
        assert_approx_tight(out.y, -1.0);
        assert_approx_tight(out.z, 0.0);
    }

    #[test]
    fn reflecting_a_downward_vector_about_upward_normal_gives_upward() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        reflect_vector3(
            &mut out,
            &create_vector3(0.0, -1.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        assert_approx_tight(out.x, 0.0);
        assert_approx_tight(out.y, 1.0);
        assert_approx_tight(out.z, 0.0);
    }

    #[test]
    fn supports_out_equals_incident() {
        let mut v = create_vector3(1.0, -1.0, 0.0);
        let v_clone = clone_vector3(&v);
        reflect_vector3(&mut v, &v_clone, &create_vector3(1.0, 0.0, 0.0));
        assert_approx_tight(v.x, -1.0);
        assert_approx_tight(v.y, -1.0);
    }

    #[test]
    fn supports_out_equals_normal() {
        let mut normal = create_vector3(1.0, 0.0, 0.0);
        let normal_clone = clone_vector3(&normal);
        reflect_vector3(&mut normal, &create_vector3(1.0, -1.0, 0.0), &normal_clone);
        assert_approx_tight(normal.x, -1.0);
        assert_approx_tight(normal.y, -1.0);
        assert_approx_tight(normal.z, 0.0);
    }
}

mod scale_vector3 {
    use super::*;

    #[test]
    fn scales_the_vector_by_a_scalar() {
        let v = create_vector3(1.0, 1.0, 1.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        scale_vector3(&mut result, &v, 2.0);
        assert_eq!(result.x, 2.0);
        assert_eq!(result.y, 2.0);
        assert_eq!(result.z, 2.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector3(1.0, 1.0, 1.0);
        let v_clone = clone_vector3(&v);
        scale_vector3(&mut v, &v_clone, 2.0);
        assert_eq!(v.x, 2.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 2.0);
    }
}

mod set_vector3 {
    use super::*;

    #[test]
    fn sets_the_values_of_the_vector() {
        let mut v = create_vector3(0.0, 0.0, 0.0);
        set_vector3(&mut v, 5.0, 10.0, 15.0);
        assert_eq!(v.x, 5.0);
        assert_eq!(v.y, 10.0);
        assert_eq!(v.z, 15.0);
    }

    #[test]
    fn overwrites_existing_values() {
        let mut v = create_vector3(1.0, 2.0, 3.0);
        set_vector3(&mut v, 5.0, 10.0, 15.0);
        assert_eq!(v.x, 5.0);
        assert_eq!(v.y, 10.0);
        assert_eq!(v.z, 15.0);
    }
}

mod set_vector3_from_float32_array {
    use super::*;

    #[test]
    fn reads_x_y_z_from_the_array_at_offset() {
        let data: [f32; 5] = [0.0, 1.0, 2.0, 3.0, 4.0];
        let mut out = create_vector3(0.0, 0.0, 0.0);
        set_vector3_from_float32_array(&mut out, 1, &data);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }
}

mod set_vector3_from_spherical {
    use super::*;

    #[test]
    fn produces_the_north_pole_at_theta_zero() {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        set_vector3_from_spherical(&mut out, 5.0, 0.0, 0.0);
        assert_approx_tight(out.x, 0.0);
        assert_approx_tight(out.y, 5.0);
        assert_approx_tight(out.z, 0.0);
    }
}

mod set_vector3_from_vector4 {
    use super::*;

    #[test]
    fn copies_x_y_z_and_drops_w() {
        let src = create_vector4(1.0, 2.0, 3.0, 99.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        set_vector3_from_vector4(&mut out, &src);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn does_not_perform_a_perspective_divide() {
        let src = create_vector4(2.0, 4.0, 6.0, 2.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        set_vector3_from_vector4(&mut out, &src);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 4.0);
        assert_eq!(out.z, 6.0);
    }
}

mod subtract_vector3 {
    use super::*;

    #[test]
    fn subtracts_the_coordinates_of_two_vectors() {
        let a = create_vector3(4.0, 5.0, 6.0);
        let b = create_vector3(1.0, 2.0, 3.0);
        let mut result = create_vector3(0.0, 0.0, 0.0);
        subtract_vector3(&mut result, &a, &b);
        assert_eq!(result.x, 3.0);
        assert_eq!(result.y, 3.0);
        assert_eq!(result.z, 3.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut a = create_vector3(4.0, 5.0, 6.0);
        let b = create_vector3(1.0, 2.0, 3.0);
        let a_clone = clone_vector3(&a);
        subtract_vector3(&mut a, &a_clone, &b);
        assert_eq!(a.x, 3.0);
        assert_eq!(a.y, 3.0);
        assert_eq!(a.z, 3.0);
    }

    #[test]
    fn supports_out_equals_other() {
        let a = create_vector3(4.0, 5.0, 6.0);
        let mut b = create_vector3(1.0, 2.0, 3.0);
        let b_clone = clone_vector3(&b);
        subtract_vector3(&mut b, &a, &b_clone);
        assert_eq!(b.x, 3.0);
        assert_eq!(b.y, 3.0);
        assert_eq!(b.z, 3.0);
    }
}

mod transform_vector3_by_matrix3 {
    use super::*;

    #[test]
    fn transforms_by_an_identity_matrix() {
        let identity = create_matrix3(None, None, None, None, None, None, None, None, None);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        transform_vector3_by_matrix3(&mut out, &create_vector3(1.0, 2.0, 3.0), &identity);
        assert_approx_tight(out.x, 1.0);
        assert_approx_tight(out.y, 2.0);
        assert_approx_tight(out.z, 3.0);
    }

    #[test]
    fn transforms_by_a_scale_matrix() {
        let scale = create_matrix3_from_values(
            2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 4.0,
        );
        let mut out = create_vector3(0.0, 0.0, 0.0);
        transform_vector3_by_matrix3(&mut out, &create_vector3(1.0, 1.0, 1.0), &scale);
        assert_approx_tight(out.x, 2.0);
        assert_approx_tight(out.y, 3.0);
        assert_approx_tight(out.z, 4.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let identity = create_matrix3(None, None, None, None, None, None, None, None, None);
        let mut v = create_vector3(1.0, 2.0, 3.0);
        let v_clone = clone_vector3(&v);
        transform_vector3_by_matrix3(&mut v, &v_clone, &identity);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }
}

mod write_vector3_to_float32_array {
    use super::*;

    #[test]
    fn writes_x_y_z_to_the_array_at_offset() {
        let mut data = [0.0_f32; 5];
        let v = create_vector3(1.0, 2.0, 3.0);
        write_vector3_to_float32_array(&mut data, 1, &v);
        assert_eq!(data[0], 0.0);
        assert_eq!(data[1], 1.0);
        assert_eq!(data[2], 2.0);
        assert_eq!(data[3], 3.0);
    }
}
