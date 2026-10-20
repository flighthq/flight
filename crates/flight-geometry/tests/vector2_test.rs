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

mod add_vector2 {
    use super::*;

    #[test]
    fn adds_two_coordinates() {
        let a = create_vector2(2.0, 10.0);
        let b = create_vector2(4.0, 20.0);
        let mut result = create_vector2(0.0, 0.0);
        add_vector2(&mut result, &a, &b);
        assert_eq!(result.x, 6.0);
        assert_eq!(result.y, 30.0);
    }

    #[test]
    fn works_correctly_if_first_vector_is_out() {
        let mut a = create_vector2(3.0, 7.0);
        let b = create_vector2(5.0, 10.0);
        let a_clone = clone_vector2(&a);
        add_vector2(&mut a, &a_clone, &b);
        assert_eq!(a.x, 8.0);
        assert_eq!(a.y, 17.0);
        assert_eq!(b.x, 5.0);
        assert_eq!(b.y, 10.0);
    }

    #[test]
    fn works_correctly_if_second_vector_is_out() {
        let a = create_vector2(2.0, 10.0);
        let mut b = create_vector2(4.0, 20.0);
        let b_clone = clone_vector2(&b);
        add_vector2(&mut b, &a, &b_clone);
        assert_eq!(a.x, 2.0);
        assert_eq!(a.y, 10.0);
        assert_eq!(b.x, 6.0);
        assert_eq!(b.y, 30.0);
    }
}

mod clamp_vector2 {
    use super::*;

    #[test]
    fn clamps_each_component_to_its_own_bounds_below_above_and_not_at_all() {
        let min = create_vector2(-1.0, -2.0);
        let max = create_vector2(10.0, 20.0);
        let mut out = create_vector2(0.0, 0.0);

        clamp_vector2(&mut out, &create_vector2(-5.0, -6.0), &min, &max);
        assert_eq!(out.x, -1.0);
        assert_eq!(out.y, -2.0);

        clamp_vector2(&mut out, &create_vector2(100.0, 200.0), &min, &max);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);

        clamp_vector2(&mut out, &create_vector2(0.0, 1.0), &min, &max);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn clamps_each_component_independently() {
        let mut out = create_vector2(0.0, 0.0);
        let value = create_vector2(5.0, -2.0);
        let min = create_vector2(0.0, 0.0);
        let max = create_vector2(3.0, 3.0);
        clamp_vector2(&mut out, &value, &min, &max);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn leaves_values_within_range_unchanged() {
        let mut out = create_vector2(0.0, 0.0);
        let value = create_vector2(1.0, 2.0);
        let min = create_vector2(0.0, 0.0);
        let max = create_vector2(3.0, 3.0);
        clamp_vector2(&mut out, &value, &min, &max);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn clamps_x_low_and_y_high() {
        let mut out = create_vector2(0.0, 0.0);
        clamp_vector2(
            &mut out,
            &create_vector2(-2.0, 5.0),
            &create_vector2(0.0, 0.0),
            &create_vector2(3.0, 3.0),
        );
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn supports_out_equals_value() {
        let mut v = create_vector2(5.0, -1.0);
        let v_clone = clone_vector2(&v);
        clamp_vector2(
            &mut v,
            &v_clone,
            &create_vector2(0.0, 0.0),
            &create_vector2(3.0, 3.0),
        );
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 0.0);
    }

    #[test]
    fn supports_out_equals_min_or_max() {
        let mut min = create_vector2(0.0, 0.0);
        let min_clone = clone_vector2(&min);
        clamp_vector2(
            &mut min,
            &create_vector2(5.0, -2.0),
            &min_clone,
            &create_vector2(3.0, 3.0),
        );
        assert_eq!(min.x, 3.0);
        assert_eq!(min.y, 0.0);

        let mut max = create_vector2(3.0, 3.0);
        let max_clone = clone_vector2(&max);
        clamp_vector2(
            &mut max,
            &create_vector2(5.0, -2.0),
            &create_vector2(0.0, 0.0),
            &max_clone,
        );
        assert_eq!(max.x, 3.0);
        assert_eq!(max.y, 0.0);
    }
}

mod clone_vector2 {
    use super::*;

    #[test]
    fn creates_a_copy_of_a_vector() {
        let pt = create_vector2(1.0, 2.0);
        let result = clone_vector2(&pt);
        assert_eq!(result.x, pt.x);
        assert_eq!(result.y, pt.y);
    }
}

mod copy_vector2 {
    use super::*;

    #[test]
    fn copies_coordinates_from_one_vector_to_another() {
        let source = create_vector2(1.0, 2.0);
        let mut out = create_vector2(0.0, 0.0);
        copy_vector2(&mut out, &source);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut pt = create_vector2(1.0, 2.0);
        let pt_clone = clone_vector2(&pt);
        copy_vector2(&mut pt, &pt_clone);
        assert_eq!(pt.x, 1.0);
        assert_eq!(pt.y, 2.0);
    }
}

mod create_vector2 {
    use super::*;

    #[test]
    fn returns_a_vector2_with_default_coordinates() {
        let p = create_vector2(0.0, 0.0);
        assert_eq!(p.x, 0.0);
        assert_eq!(p.y, 0.0);
    }

    #[test]
    fn sets_the_specified_x_and_y_coordinates() {
        let p = create_vector2(2.0, 4.0);
        assert_eq!(p.x, 2.0);
        assert_eq!(p.y, 4.0);
    }

    #[test]
    fn x_axis_constant() {
        assert_eq!(VECTOR2_X_AXIS.x, 1.0);
        assert_eq!(VECTOR2_X_AXIS.y, 0.0);
    }

    #[test]
    fn y_axis_constant() {
        assert_eq!(VECTOR2_Y_AXIS.x, 0.0);
        assert_eq!(VECTOR2_Y_AXIS.y, 1.0);
    }
}

mod create_vector2_from_polar {
    use super::*;

    #[test]
    fn makes_a_create_vector2_and_calls_polar() {
        let pt = create_vector2_from_polar(5.0, 0.0);
        let mut pt2 = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut pt2, 5.0, 0.0);
        assert!(equals_vector2(Some(&pt), Some(&pt2)));
    }
}

mod cross_vector2 {
    use super::*;

    #[test]
    fn returns_positive_when_b_is_counter_clockwise_from_a() {
        assert_eq!(
            cross_vector2(&create_vector2(1.0, 0.0), &create_vector2(0.0, 1.0)),
            1.0
        );
    }

    #[test]
    fn returns_negative_when_b_is_clockwise_from_a() {
        assert_eq!(
            cross_vector2(&create_vector2(0.0, 1.0), &create_vector2(1.0, 0.0)),
            -1.0
        );
    }

    #[test]
    fn returns_zero_for_parallel_vectors() {
        assert_eq!(
            cross_vector2(&create_vector2(3.0, 0.0), &create_vector2(7.0, 0.0)),
            0.0
        );
    }

    #[test]
    fn computes_the_general_case() {
        assert_eq!(
            cross_vector2(&create_vector2(2.0, 3.0), &create_vector2(5.0, 7.0)),
            2.0 * 7.0 - 3.0 * 5.0
        );
    }
}

mod divide_vector2 {
    use super::*;

    #[test]
    fn gives_zero_for_a_zero_divisor_on_each_component_in_turn() {
        let source = create_vector2(6.0, 8.0);
        let mut out = create_vector2(0.0, 0.0);

        divide_vector2(&mut out, &source, &create_vector2(0.0, 4.0));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 2.0);

        divide_vector2(&mut out, &source, &create_vector2(2.0, 0.0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn divides_component_wise() {
        let mut out = create_vector2(0.0, 0.0);
        divide_vector2(
            &mut out,
            &create_vector2(6.0, 8.0),
            &create_vector2(2.0, 4.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn produces_zero_for_zero_divisor_components() {
        let mut out = create_vector2(0.0, 0.0);
        divide_vector2(
            &mut out,
            &create_vector2(6.0, 8.0),
            &create_vector2(0.0, 4.0),
        );
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn produces_zero_for_a_zero_y_divisor() {
        let mut out = create_vector2(0.0, 0.0);
        divide_vector2(
            &mut out,
            &create_vector2(6.0, 8.0),
            &create_vector2(2.0, 0.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector2(6.0, 8.0);
        let v_clone = clone_vector2(&v);
        divide_vector2(&mut v, &v_clone, &create_vector2(2.0, 4.0));
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 2.0);
    }

    #[test]
    fn supports_out_equals_divisor() {
        let mut divisor = create_vector2(2.0, 4.0);
        let divisor_clone = clone_vector2(&divisor);
        divide_vector2(&mut divisor, &create_vector2(6.0, 8.0), &divisor_clone);
        assert_eq!(divisor.x, 3.0);
        assert_eq!(divisor.y, 2.0);
    }
}

mod equals_vector2 {
    use super::*;

    #[test]
    fn returns_false_when_both_are_none() {
        assert!(!equals_vector2(None, None));
    }

    #[test]
    fn returns_false_when_either_vector_is_absent() {
        let v = create_vector2(1.0, 2.0);
        assert!(!equals_vector2(Some(&v), None));
        assert!(!equals_vector2(None, Some(&v)));
    }

    #[test]
    fn returns_true_if_vectors_are_identical_false_otherwise() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(0.0, 0.0);
        assert!(equals_vector2(Some(&a), Some(&b)));

        let c = create_vector2(1.0, 0.0);
        assert!(!equals_vector2(Some(&c), Some(&b)));

        let d = create_vector2(1.0, 0.0);
        assert!(equals_vector2(Some(&c), Some(&d)));
    }

    #[test]
    fn compares_every_component_not_just_the_first() {
        let a = create_vector2(1.0, 2.0);
        assert!(!equals_vector2(Some(&a), Some(&create_vector2(9.0, 2.0))));
        assert!(!equals_vector2(Some(&a), Some(&create_vector2(1.0, 9.0))));
    }

    #[test]
    fn returns_true_for_same_reference() {
        let v = create_vector2(5.0, 10.0);
        assert!(equals_vector2(Some(&v), Some(&v)));
    }

    #[test]
    fn holds_a_vector_equal_to_itself_even_with_a_nan_component() {
        let nan_vec = create_vector2(f32::NAN, 2.0);
        assert!(equals_vector2(Some(&nan_vec), Some(&nan_vec)));
        assert!(!equals_vector2(
            Some(&nan_vec),
            Some(&create_vector2(f32::NAN, 2.0))
        ));
    }
}

mod get_vector2_angle {
    use super::*;

    #[test]
    fn returns_zero_for_a_vector_along_positive_x() {
        assert_eq!(get_vector2_angle(&create_vector2(5.0, 0.0)), 0.0);
    }

    #[test]
    fn returns_pi_over_2_for_a_vector_along_positive_y() {
        assert_approx(get_vector2_angle(&create_vector2(0.0, 3.0)), PI / 2.0);
    }

    #[test]
    fn returns_negative_pi_over_2_for_a_vector_along_negative_y() {
        assert_approx(get_vector2_angle(&create_vector2(0.0, -1.0)), -PI / 2.0);
    }

    #[test]
    fn returns_pi_for_a_vector_along_negative_x() {
        assert_approx(get_vector2_angle(&create_vector2(-2.0, 0.0)), PI);
    }

    #[test]
    fn returns_zero_for_the_zero_vector() {
        assert_eq!(get_vector2_angle(&create_vector2(0.0, 0.0)), 0.0);
    }
}

mod get_vector2_angle_between {
    use super::*;

    #[test]
    fn returns_zero_for_identical_vectors() {
        let a = create_vector2(1.0, 0.0);
        assert_approx(get_vector2_angle_between(&a, &a), 0.0);
    }

    #[test]
    fn returns_pi_over_2_for_perpendicular_vectors() {
        let a = create_vector2(1.0, 0.0);
        let b = create_vector2(0.0, 1.0);
        assert_approx(get_vector2_angle_between(&a, &b), PI / 2.0);
    }

    #[test]
    fn returns_pi_for_opposite_vectors() {
        let a = create_vector2(1.0, 0.0);
        let b = create_vector2(-1.0, 0.0);
        assert_approx(get_vector2_angle_between(&a, &b), PI);
    }

    #[test]
    fn returns_nan_for_a_zero_length_vector() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(1.0, 0.0);
        assert!(get_vector2_angle_between(&a, &b).is_nan());
    }
}

mod get_vector2_distance {
    use super::*;

    #[test]
    fn calculates_euclidean_distance_between_vectors() {
        let cases: &[([f32; 2], [f32; 2], f32)] = &[
            ([100.0, 0.0], [0.0, 0.0], 100.0),
            ([0.0, 100.0], [0.0, 0.0], 100.0),
            ([3.0, 4.0], [0.0, 0.0], 5.0),
            ([5.0, 12.0], [0.0, 0.0], 13.0),
            ([8.0, 15.0], [0.0, 0.0], 17.0),
        ];
        for &(a, b, expected) in cases {
            let va = create_vector2(a[0], a[1]);
            let vb = create_vector2(b[0], b[1]);
            assert_eq!(get_vector2_distance(&va, &vb), expected);
        }
    }
}

mod get_vector2_distance_squared {
    use super::*;

    #[test]
    fn returns_the_squared_distance_between_two_vectors() {
        let a = create_vector2(1.0, 1.0);
        let b = create_vector2(4.0, 5.0);
        assert_eq!(get_vector2_distance_squared(&a, &b), 25.0);
    }
}

mod get_vector2_dot {
    use super::*;

    #[test]
    fn returns_the_dot_product_of_two_vectors() {
        let a = create_vector2(1.0, 2.0);
        let b = create_vector2(4.0, 5.0);
        assert_eq!(get_vector2_dot(&a, &b), 14.0);
    }
}

mod get_vector2_length {
    use super::*;

    #[test]
    fn returns_the_length_of_the_vector() {
        let cases: &[(f32, f32, f32)] = &[
            (100.0, 0.0, 100.0),
            (0.0, 100.0, 100.0),
            (3.0, 4.0, 5.0),
            (5.0, 12.0, 13.0),
            (8.0, 15.0, 17.0),
        ];
        for &(x, y, expected) in cases {
            let v = create_vector2(x, y);
            assert_eq!(get_vector2_length(&v), expected);
        }
    }
}

mod get_vector2_length_squared {
    use super::*;

    #[test]
    fn returns_the_square_of_the_length() {
        let v = create_vector2(3.0, 4.0);
        assert_eq!(get_vector2_length_squared(&v), 25.0);
    }

    #[test]
    fn returns_zero_for_the_origin() {
        let v = create_vector2(0.0, 0.0);
        assert_eq!(get_vector2_length_squared(&v), 0.0);
    }

    #[test]
    fn handles_negative_values_correctly() {
        let v = create_vector2(-3.0, -4.0);
        assert_eq!(get_vector2_length_squared(&v), 25.0);
    }

    #[test]
    fn handles_non_integer_values() {
        let v = create_vector2(2.5, 4.5);
        assert_eq!(get_vector2_length_squared(&v), 2.5 * 2.5 + 4.5 * 4.5);
    }
}

mod initialize_vector2 {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_vector2() {
        let mut v = create_vector2(0.0, 0.0);
        initialize_vector2(&mut v, 3.0, 7.0);
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 7.0);
    }
}

mod interpolate_vector2 {
    use super::*;

    #[test]
    fn returns_a_at_t_zero() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(100.0, 100.0);
        let mut out = create_vector2(0.0, 0.0);
        interpolate_vector2(&mut out, &a, &b, 0.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn returns_b_at_t_one() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(100.0, 100.0);
        let mut out = create_vector2(0.0, 0.0);
        interpolate_vector2(&mut out, &a, &b, 1.0);
        assert_eq!(out.x, 100.0);
        assert_eq!(out.y, 100.0);
    }

    #[test]
    fn returns_midpoint_at_t_half() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(100.0, 100.0);
        let mut out = create_vector2(0.0, 0.0);
        interpolate_vector2(&mut out, &a, &b, 0.5);
        assert_eq!(out.x, 50.0);
        assert_eq!(out.y, 50.0);
    }

    #[test]
    fn extrapolates_beyond_t_one() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(100.0, 100.0);
        let mut out = create_vector2(0.0, 0.0);
        interpolate_vector2(&mut out, &a, &b, 10.0);
        assert_eq!(out.x, 1000.0);
        assert_eq!(out.y, 1000.0);
    }

    #[test]
    fn extrapolates_with_negative_t() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(100.0, 100.0);
        let mut out = create_vector2(0.0, 0.0);
        interpolate_vector2(&mut out, &a, &b, -1.0);
        assert_eq!(out.x, -100.0);
        assert_eq!(out.y, -100.0);
    }

    #[test]
    fn works_correctly_if_out_is_the_first_vector() {
        let mut a = create_vector2(10.0, 20.0);
        let b = create_vector2(30.0, 40.0);
        let a_clone = clone_vector2(&a);
        interpolate_vector2(&mut a, &a_clone, &b, 0.5);
        assert_eq!(a.x, 20.0);
        assert_eq!(a.y, 30.0);
        assert_eq!(b.x, 30.0);
        assert_eq!(b.y, 40.0);
    }

    #[test]
    fn works_correctly_if_out_is_the_second_vector() {
        let a = create_vector2(10.0, 20.0);
        let mut b = create_vector2(30.0, 40.0);
        let b_clone = clone_vector2(&b);
        interpolate_vector2(&mut b, &a, &b_clone, 0.5);
        assert_eq!(a.x, 10.0);
        assert_eq!(a.y, 20.0);
        assert_eq!(b.x, 20.0);
        assert_eq!(b.y, 30.0);
    }

    #[test]
    fn handles_extreme_extrapolation_values_for_t() {
        let a = create_vector2(0.0, 0.0);
        let b = create_vector2(100.0, 100.0);
        let mut out = create_vector2(0.0, 0.0);
        interpolate_vector2(&mut out, &a, &b, 1000.0);
        assert_eq!(out.x, 100000.0);
        assert_eq!(out.y, 100000.0);
    }
}

mod max_vector2 {
    use super::*;

    #[test]
    fn takes_each_component_from_whichever_side_wins_and_gives_the_same_answer_either_way_round() {
        let a = create_vector2(1.0, 5.0);
        let b = create_vector2(3.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);

        max_vector2(&mut out, &a, &b);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 5.0);

        max_vector2(&mut out, &b, &a);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 5.0);
    }

    #[test]
    fn returns_the_component_wise_maximum() {
        let mut out = create_vector2(0.0, 0.0);
        max_vector2(
            &mut out,
            &create_vector2(1.0, 5.0),
            &create_vector2(3.0, 2.0),
        );
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 5.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_vector2(1.0, 5.0);
        let b = create_vector2(3.0, 2.0);
        let a_clone = clone_vector2(&a);
        max_vector2(&mut a, &a_clone, &b);
        assert_eq!(a.x, 3.0);
        assert_eq!(a.y, 5.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_vector2(1.0, 5.0);
        let mut b = create_vector2(3.0, 2.0);
        let b_clone = clone_vector2(&b);
        max_vector2(&mut b, &a, &b_clone);
        assert_eq!(b.x, 3.0);
        assert_eq!(b.y, 5.0);
    }

    #[test]
    fn selects_a_for_x_and_b_for_y() {
        let mut out = create_vector2(0.0, 0.0);
        max_vector2(
            &mut out,
            &create_vector2(5.0, 1.0),
            &create_vector2(2.0, 3.0),
        );
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 3.0);
    }
}

mod min_vector2 {
    use super::*;

    #[test]
    fn takes_each_component_from_whichever_side_wins_and_gives_the_same_answer_either_way_round() {
        let a = create_vector2(1.0, 5.0);
        let b = create_vector2(3.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);

        min_vector2(&mut out, &a, &b);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 0.0);

        min_vector2(&mut out, &b, &a);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn returns_the_component_wise_minimum() {
        let mut out = create_vector2(0.0, 0.0);
        min_vector2(
            &mut out,
            &create_vector2(1.0, 5.0),
            &create_vector2(3.0, 2.0),
        );
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_vector2(1.0, 5.0);
        let b = create_vector2(3.0, 2.0);
        let a_clone = clone_vector2(&a);
        min_vector2(&mut a, &a_clone, &b);
        assert_eq!(a.x, 1.0);
        assert_eq!(a.y, 2.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_vector2(1.0, 5.0);
        let mut b = create_vector2(3.0, 2.0);
        let b_clone = clone_vector2(&b);
        min_vector2(&mut b, &a, &b_clone);
        assert_eq!(b.x, 1.0);
        assert_eq!(b.y, 2.0);
    }

    #[test]
    fn selects_b_for_x_and_a_for_y() {
        let mut out = create_vector2(0.0, 0.0);
        min_vector2(
            &mut out,
            &create_vector2(5.0, 1.0),
            &create_vector2(2.0, 3.0),
        );
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 1.0);
    }
}

mod multiply_vector2 {
    use super::*;

    #[test]
    fn multiplies_component_wise_hadamard() {
        let mut out = create_vector2(0.0, 0.0);
        multiply_vector2(
            &mut out,
            &create_vector2(2.0, 3.0),
            &create_vector2(4.0, 5.0),
        );
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 15.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_vector2(2.0, 3.0);
        let a_clone = clone_vector2(&a);
        multiply_vector2(&mut a, &a_clone, &create_vector2(4.0, 5.0));
        assert_eq!(a.x, 8.0);
        assert_eq!(a.y, 15.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let mut b = create_vector2(4.0, 5.0);
        let b_clone = clone_vector2(&b);
        multiply_vector2(&mut b, &create_vector2(2.0, 3.0), &b_clone);
        assert_eq!(b.x, 8.0);
        assert_eq!(b.y, 15.0);
    }
}

mod near_equals_vector2 {
    use super::*;

    #[test]
    fn returns_true_for_identical_vectors() {
        let a = create_vector2(1.0, 2.0);
        assert!(near_equals_vector2(&a, &a, 1e-6));
    }

    #[test]
    fn returns_true_when_difference_is_within_default_tolerance() {
        let a = create_vector2(1.0, 2.0);
        let b = create_vector2(1.0 + 1e-7, 2.0);
        assert!(near_equals_vector2(&a, &b, 1e-6));
    }

    #[test]
    fn returns_false_when_difference_exceeds_default_tolerance() {
        let a = create_vector2(1.0, 2.0);
        let b = create_vector2(1.0 + 1e-5, 2.0);
        assert!(!near_equals_vector2(&a, &b, 1e-6));
    }

    #[test]
    fn respects_a_custom_tolerance() {
        let a = create_vector2(1.0, 2.0);
        let b = create_vector2(1.05, 2.0);
        assert!(near_equals_vector2(&a, &b, 0.1));
        assert!(!near_equals_vector2(&a, &b, 0.01));
    }
}

mod negate_vector2 {
    use super::*;

    #[test]
    fn inverts_the_values_of_the_vector_components() {
        let v = create_vector2(1.0, -2.0);
        let mut result = create_vector2(0.0, 0.0);
        negate_vector2(&mut result, &v);
        assert_eq!(result.x, -1.0);
        assert_eq!(result.y, 2.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector2(1.0, -2.0);
        let v_clone = clone_vector2(&v);
        negate_vector2(&mut v, &v_clone);
        assert_eq!(v.x, -1.0);
        assert_eq!(v.y, 2.0);
    }
}

mod normalize_vector2 {
    use super::*;

    #[test]
    fn produces_a_unit_vector() {
        let pt = create_vector2(3.0, 4.0);
        let mut result = create_vector2(0.0, 0.0);
        normalize_vector2(&mut result, &pt);
        assert_approx(result.x, 0.6);
        assert_approx(result.y, 0.8);
        assert_approx(get_vector2_length(&result), 1.0);
    }

    #[test]
    fn returns_the_original_length() {
        let pt = create_vector2(3.0, 4.0);
        let mut result = create_vector2(0.0, 0.0);
        let length = normalize_vector2(&mut result, &pt);
        assert_approx(length, 5.0);
    }

    #[test]
    fn returns_zero_for_a_zero_length_vector() {
        let pt = create_vector2(0.0, 0.0);
        let mut result = create_vector2(0.0, 0.0);
        let length = normalize_vector2(&mut result, &pt);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
        assert_eq!(length, 0.0);
    }

    #[test]
    fn handles_very_small_vectors_correctly() {
        let pt = create_vector2(0.0001, 0.0001);
        let mut result = create_vector2(0.0, 0.0);
        normalize_vector2(&mut result, &pt);
        assert_approx(result.x, 0.7071);
        assert_approx(result.y, 0.7071);
        assert_approx(get_vector2_length(&result), 1.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut pt = create_vector2(3.0, 4.0);
        let pt_clone = clone_vector2(&pt);
        let length = normalize_vector2(&mut pt, &pt_clone);
        assert_approx(pt.x, 0.6);
        assert_approx(pt.y, 0.8);
        assert_approx(length, 5.0);
    }
}

mod offset_vector2 {
    use super::*;

    #[test]
    fn adjusts_the_value_of_a_vector() {
        let pt = create_vector2(0.0, 0.0);
        let mut result = create_vector2(0.0, 0.0);
        offset_vector2(&mut result, &pt, 10.0, 100.0);
        assert_eq!(result.x, 10.0);
        assert_eq!(result.y, 100.0);
    }

    #[test]
    fn works_with_negative_deltas() {
        let pt = create_vector2(0.0, 0.0);
        let mut result = create_vector2(0.0, 0.0);
        offset_vector2(&mut result, &pt, -5.0, -10.0);
        assert_eq!(result.x, -5.0);
        assert_eq!(result.y, -10.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut pt = create_vector2(1.0, 2.0);
        let pt_clone = clone_vector2(&pt);
        offset_vector2(&mut pt, &pt_clone, 3.0, 4.0);
        assert_eq!(pt.x, 4.0);
        assert_eq!(pt.y, 6.0);
    }
}

mod reflect_vector2 {
    use super::*;

    #[test]
    fn reflects_incident_vector_about_a_normal() {
        let mut out = create_vector2(0.0, 0.0);
        reflect_vector2(
            &mut out,
            &create_vector2(1.0, -1.0),
            &create_vector2(1.0, 0.0),
        );
        assert_approx_tight(out.x, -1.0);
        assert_approx_tight(out.y, -1.0);
    }

    #[test]
    fn reflects_straight_down_about_horizontal_normal_gives_straight_up() {
        let mut out = create_vector2(0.0, 0.0);
        reflect_vector2(
            &mut out,
            &create_vector2(0.0, -1.0),
            &create_vector2(0.0, 1.0),
        );
        assert_approx_tight(out.x, 0.0);
        assert_approx_tight(out.y, 1.0);
    }

    #[test]
    fn supports_out_equals_incident() {
        let mut v = create_vector2(1.0, -1.0);
        let v_clone = clone_vector2(&v);
        reflect_vector2(&mut v, &v_clone, &create_vector2(1.0, 0.0));
        assert_approx_tight(v.x, -1.0);
        assert_approx_tight(v.y, -1.0);
    }

    #[test]
    fn supports_out_equals_normal() {
        let mut normal = create_vector2(1.0, 0.0);
        let normal_clone = clone_vector2(&normal);
        reflect_vector2(&mut normal, &create_vector2(1.0, -1.0), &normal_clone);
        assert_approx_tight(normal.x, -1.0);
        assert_approx_tight(normal.y, -1.0);
    }
}

mod rotate_vector2 {
    use super::*;

    #[test]
    fn rotates_positive_x_by_pi_over_2_to_positive_y() {
        let mut out = create_vector2(0.0, 0.0);
        rotate_vector2(&mut out, &create_vector2(1.0, 0.0), PI / 2.0);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 1.0);
    }

    #[test]
    fn rotates_by_a_full_turn_and_returns_to_the_original() {
        let mut out = create_vector2(0.0, 0.0);
        rotate_vector2(&mut out, &create_vector2(3.0, 4.0), PI * 2.0);
        assert_approx(out.x, 3.0);
        assert_approx(out.y, 4.0);
    }

    #[test]
    fn is_alias_safe_when_out_equals_source() {
        let mut v = create_vector2(1.0, 0.0);
        let v_clone = clone_vector2(&v);
        rotate_vector2(&mut v, &v_clone, PI / 2.0);
        assert_approx(v.x, 0.0);
        assert_approx(v.y, 1.0);
    }
}

mod scale_vector2 {
    use super::*;

    #[test]
    fn scales_the_vector_by_a_scalar() {
        let v = create_vector2(1.0, 2.0);
        let mut result = create_vector2(0.0, 0.0);
        scale_vector2(&mut result, &v, 3.0);
        assert_eq!(result.x, 3.0);
        assert_eq!(result.y, 6.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut v = create_vector2(1.0, 2.0);
        let v_clone = clone_vector2(&v);
        scale_vector2(&mut v, &v_clone, 3.0);
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 6.0);
    }
}

mod scale_vector2_to_length {
    use super::*;

    #[test]
    fn scales_a_vector_to_the_specified_length() {
        let pt = create_vector2(3.0, 4.0);
        let mut result = create_vector2(0.0, 0.0);
        scale_vector2_to_length(&mut result, &pt, 10.0);
        assert_approx(result.x, 6.0);
        assert_approx(result.y, 8.0);
        assert_approx(get_vector2_length(&result), 10.0);
    }

    #[test]
    fn returns_zero_for_a_zero_length_vector() {
        let pt = create_vector2(0.0, 0.0);
        let mut result = create_vector2(0.0, 0.0);
        scale_vector2_to_length(&mut result, &pt, 5.0);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
        assert_eq!(get_vector2_length(&result), 0.0);
    }

    #[test]
    fn scales_vector_to_zero_length() {
        let pt = create_vector2(3.0, 4.0);
        let mut result = create_vector2(0.0, 0.0);
        scale_vector2_to_length(&mut result, &pt, 0.0);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
        assert_eq!(get_vector2_length(&result), 0.0);
    }

    #[test]
    fn scales_vector_to_negative_length() {
        let pt = create_vector2(3.0, 4.0);
        let mut result = create_vector2(0.0, 0.0);
        scale_vector2_to_length(&mut result, &pt, -10.0);
        assert_approx(result.x, -6.0);
        assert_approx(result.y, -8.0);
        assert_approx(get_vector2_length(&result), 10.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut pt = create_vector2(3.0, 4.0);
        let pt_clone = clone_vector2(&pt);
        scale_vector2_to_length(&mut pt, &pt_clone, 10.0);
        assert_approx(pt.x, 6.0);
        assert_approx(pt.y, 8.0);
        assert_approx(get_vector2_length(&pt), 10.0);
    }
}

mod set_vector2 {
    use super::*;

    #[test]
    fn updates_coordinates_of_a_vector() {
        let mut pt = create_vector2(0.0, 0.0);
        set_vector2(&mut pt, 2.0, 10.0);
        assert_eq!(pt.x, 2.0);
        assert_eq!(pt.y, 10.0);
    }

    #[test]
    fn sets_both_coordinates_to_zero_correctly() {
        let mut pt = create_vector2(1.0, 2.0);
        set_vector2(&mut pt, 0.0, 0.0);
        assert_eq!(pt.x, 0.0);
        assert_eq!(pt.y, 0.0);
    }
}

mod set_vector2_from_float32_array {
    use super::*;

    #[test]
    fn writes_the_vector_from_2_values_at_the_offset() {
        let data: [f32; 2] = [1.0, 2.0];
        let mut v = create_vector2(100.0, 100.0);
        set_vector2_from_float32_array(&mut v, 0, &data);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
    }
}

mod set_vector2_from_polar {
    use super::*;

    #[test]
    fn returns_a_vector_at_the_given_length_along_the_x_axis_when_angle_is_zero() {
        let mut p = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut p, 5.0, 0.0);
        assert_approx(p.x, 5.0);
        assert_approx(p.y, 0.0);
        assert_approx(get_vector2_length(&p), 5.0);
    }

    #[test]
    fn returns_a_vector_at_the_given_length_along_the_y_axis_when_angle_is_pi_over_2() {
        let mut p = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut p, 3.0, PI / 2.0);
        assert_approx(p.x, 0.0);
        assert_approx(p.y, 3.0);
        assert_approx(get_vector2_length(&p), 3.0);
    }

    #[test]
    fn returns_a_vector_in_the_correct_quadrant_for_angle_pi() {
        let mut p = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut p, 4.0, PI);
        assert_approx(p.x, -4.0);
        assert_approx(p.y, 0.0);
        assert_approx(get_vector2_length(&p), 4.0);
    }

    #[test]
    fn returns_a_vector_in_the_correct_quadrant_for_angle_3_pi_over_2() {
        let mut p = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut p, 2.0, 3.0 * PI / 2.0);
        assert_approx(p.x, 0.0);
        assert_approx(p.y, -2.0);
        assert_approx(get_vector2_length(&p), 2.0);
    }

    #[test]
    fn handles_zero_length() {
        let mut p = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut p, 0.0, PI / 4.0);
        assert_approx(p.x, 0.0);
        assert_approx(p.y, 0.0);
        assert_approx(get_vector2_length(&p), 0.0);
    }

    #[test]
    fn handles_negative_length() {
        let mut p = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut p, -5.0, 0.0);
        assert_approx(p.x, -5.0);
        assert_approx(p.y, 0.0);
        assert_approx(get_vector2_length(&p), 5.0);
    }

    #[test]
    fn handles_arbitrary_angles() {
        let angle = PI / 4.0;
        let len = 2.0_f32.sqrt();
        let mut p = create_vector2(0.0, 0.0);
        set_vector2_from_polar(&mut p, len, angle);
        assert_approx(p.x, 1.0);
        assert_approx(p.y, 1.0);
        assert_approx(get_vector2_length(&p), len);
    }
}

mod set_vector2_from_vector3 {
    use super::*;

    #[test]
    fn copies_x_and_y_from_a_vector3_dropping_z() {
        let src = create_vector3(3.0, 7.0, 99.0);
        let mut out = create_vector2(0.0, 0.0);
        set_vector2_from_vector3(&mut out, &src);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 7.0);
    }
}

mod subtract_vector2 {
    use super::*;

    #[test]
    fn subtracts_the_coordinates_of_two_vectors_into_a_new_vector() {
        let a = create_vector2(5.0, 10.0);
        let b = create_vector2(2.0, 4.0);
        let mut result = create_vector2(0.0, 0.0);
        subtract_vector2(&mut result, &a, &b);
        assert_eq!(result.x, 3.0);
        assert_eq!(result.y, 6.0);
    }

    #[test]
    fn handles_negative_results_correctly() {
        let a = create_vector2(2.0, 3.0);
        let b = create_vector2(5.0, 10.0);
        let mut result = create_vector2(0.0, 0.0);
        subtract_vector2(&mut result, &a, &b);
        assert_eq!(result.x, -3.0);
        assert_eq!(result.y, -7.0);
    }

    #[test]
    fn returns_zero_when_subtracting_a_vector_from_itself() {
        let v = create_vector2(7.0, -3.0);
        let mut result = create_vector2(0.0, 0.0);
        subtract_vector2(&mut result, &v, &v);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut a = create_vector2(5.0, 10.0);
        let b = create_vector2(2.0, 4.0);
        let a_clone = clone_vector2(&a);
        subtract_vector2(&mut a, &a_clone, &b);
        assert_eq!(a.x, 3.0);
        assert_eq!(a.y, 6.0);
    }

    #[test]
    fn supports_out_equals_other() {
        let a = create_vector2(5.0, 10.0);
        let mut b = create_vector2(2.0, 4.0);
        let b_clone = clone_vector2(&b);
        subtract_vector2(&mut b, &a, &b_clone);
        assert_eq!(b.x, 3.0);
        assert_eq!(b.y, 6.0);
    }

    #[test]
    fn works_when_source_or_target_vectors_are_at_the_origin() {
        let origin = create_vector2(0.0, 0.0);
        let b = create_vector2(5.0, 10.0);
        let mut result = create_vector2(0.0, 0.0);
        subtract_vector2(&mut result, &origin, &b);
        assert_eq!(result.x, -5.0);
        assert_eq!(result.y, -10.0);

        let mut result2 = create_vector2(0.0, 0.0);
        subtract_vector2(&mut result2, &b, &origin);
        assert_eq!(result2.x, 5.0);
        assert_eq!(result2.y, 10.0);
    }

    #[test]
    fn works_with_very_small_values_and_results_near_zero() {
        let a = create_vector2(0.0001, 0.0001);
        let b = create_vector2(0.0001, 0.0001);
        let mut result = create_vector2(0.0, 0.0);
        subtract_vector2(&mut result, &a, &b);
        assert_approx(result.x, 0.0);
        assert_approx(result.y, 0.0);
    }
}

mod write_vector2_to_float32_array {
    use super::*;

    #[test]
    fn writes_2_values_at_the_offset() {
        let mut data = [0.0_f32; 6];
        let v = create_vector2(1.0, 2.0);
        write_vector2_to_float32_array(&mut data, 0, &v);
        assert_eq!(data[0], 1.0);
        assert_eq!(data[1], 2.0);
    }
}
