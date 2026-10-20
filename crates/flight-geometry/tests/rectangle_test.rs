use flight_geometry::*;

mod clone_rectangle {
    use super::*;

    #[test]
    fn creates_a_copy() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let c = clone_rectangle(&r);
        assert!(equals_rectangle(Some(&r), Some(&c)));
    }

    #[test]
    fn clone_does_not_affect_original_rectangle() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mut c = clone_rectangle(&r);
        c.x = 100.0;
        assert_ne!(r.x, c.x);
    }
}

mod compute_rectangle_intersection {
    use super::*;

    #[test]
    fn returns_intersection_rectangle() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let r3 = create_rectangle(5.0, 10.0, 10.0, 10.0);
        let mut result = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_rectangle_intersection(&mut result, &r, &r3);
        assert_eq!(result.x, 5.0);
        assert_eq!(result.y, 10.0);
        assert_eq!(result.width, 5.0);
        assert_eq!(result.height, 10.0);
    }

    #[test]
    fn returns_empty_rectangle_if_no_intersection() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let r3 = create_rectangle(20.0, 20.0, 5.0, 5.0);
        let mut result = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_rectangle_intersection(&mut result, &r, &r3);
        assert!(is_empty_rectangle(&result));
    }

    #[test]
    fn correctly_modifies_the_original_rectangle_when_intersection_is_empty() {
        let mut r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let r2 = create_rectangle(20.0, 20.0, 5.0, 5.0);
        let r1_clone = clone_rectangle(&r1);
        compute_rectangle_intersection(&mut r1, &r1_clone, &r2);
        assert_eq!(r1.width, 0.0);
        assert_eq!(r1.height, 0.0);
    }

    #[test]
    fn correctly_modifies_the_target_when_intersection_occurs() {
        let mut r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let r2 = create_rectangle(5.0, 5.0, 10.0, 10.0);
        let r1_clone = clone_rectangle(&r1);
        compute_rectangle_intersection(&mut r1, &r1_clone, &r2);
        assert_eq!(r1.width, 5.0);
        assert_eq!(r1.height, 5.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let mut r2 = create_rectangle(5.0, 5.0, 10.0, 10.0);
        let r2_clone = clone_rectangle(&r2);
        compute_rectangle_intersection(&mut r2, &r1, &r2_clone);
        assert_eq!(r2.x, 5.0);
        assert_eq!(r2.y, 5.0);
        assert_eq!(r2.width, 5.0);
        assert_eq!(r2.height, 5.0);
    }
}

mod contains_rectangle_point {
    use super::*;

    #[test]
    fn returns_true_for_point_inside() {
        assert!(contains_rectangle_point(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_vector2(5.0, 10.0)
        ));
    }
}

mod contains_rectangle_point_xy {
    use super::*;

    #[test]
    fn returns_true_for_a_point_inside() {
        assert!(contains_rectangle_point_xy(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            5.0,
            10.0
        ));
    }

    #[test]
    fn returns_false_for_a_point_outside() {
        assert!(!contains_rectangle_point_xy(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            -1.0,
            0.0
        ));
    }

    #[test]
    fn works_with_flipped_rectangle() {
        let rect = create_rectangle(0.0, 0.0, -10.0, -20.0);
        assert!(contains_rectangle_point_xy(&rect, -5.0, -10.0));
    }

    #[test]
    fn returns_true_for_point_on_min_edge() {
        assert!(contains_rectangle_point_xy(
            &create_rectangle(0.0, 0.0, 4.0, 4.0),
            0.0,
            0.0
        ));
    }

    #[test]
    fn returns_false_for_point_on_max_edge() {
        assert!(!contains_rectangle_point_xy(
            &create_rectangle(0.0, 0.0, 4.0, 4.0),
            4.0,
            2.0
        ));
        assert!(!contains_rectangle_point_xy(
            &create_rectangle(0.0, 0.0, 4.0, 4.0),
            2.0,
            4.0
        ));
    }
}

mod copy_rectangle {
    use super::*;

    #[test]
    fn copies_values() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let r2 = create_rectangle(2.0, 5.0, 3.0, 4.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        copy_rectangle(&mut out, &r2);
        assert!(equals_rectangle(Some(&out), Some(&r2)));
        assert!(!equals_rectangle(Some(&out), Some(&r)));
    }

    #[test]
    fn does_not_change_the_original_values_if_source_and_target_are_the_same() {
        let mut r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let r1_clone = clone_rectangle(&r1);
        copy_rectangle(&mut r1, &r1_clone);
        assert_eq!(r1.x, 0.0);
        assert_eq!(r1.y, 0.0);
        assert_eq!(r1.width, 10.0);
        assert_eq!(r1.height, 10.0);
    }
}

mod create_rectangle {
    use super::*;

    #[test]
    fn initializes_with_default_values() {
        let rect = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert_eq!(rect.x, 0.0);
        assert_eq!(rect.y, 0.0);
        assert_eq!(rect.width, 0.0);
        assert_eq!(rect.height, 0.0);
    }

    #[test]
    fn initializes_with_specified_values() {
        let rect = create_rectangle(1.0, 2.0, 3.0, 4.0);
        assert_eq!(rect.x, 1.0);
        assert_eq!(rect.y, 2.0);
        assert_eq!(rect.width, 3.0);
        assert_eq!(rect.height, 4.0);
    }
}

mod encloses_rectangle {
    use super::*;

    #[test]
    fn returns_true_if_rectangle_is_fully_inside() {
        assert!(encloses_rectangle(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_rectangle(2.0, 2.0, 5.0, 5.0),
        ));
    }

    #[test]
    fn returns_false_if_rectangle_partially_outside() {
        assert!(!encloses_rectangle(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_rectangle(-1.0, 2.0, 5.0, 5.0),
        ));
    }

    #[test]
    fn works_with_flipped_rectangle_fully_inside() {
        assert!(encloses_rectangle(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_rectangle(5.0, 6.0, -3.0, -4.0),
        ));
    }

    #[test]
    fn returns_false_if_flipped_rectangle_exceeds_bounds() {
        assert!(!encloses_rectangle(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_rectangle(15.0, 15.0, -20.0, -20.0),
        ));
    }

    #[test]
    fn works_if_flipped_rectangle_exactly_fits_inside() {
        assert!(encloses_rectangle(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_rectangle(10.0, 10.0, -10.0, -10.0),
        ));
    }

    #[test]
    fn returns_false_if_zero_size_rectangle_outside() {
        assert!(!encloses_rectangle(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_rectangle(20.0, 20.0, 0.0, 0.0),
        ));
    }

    #[test]
    fn returns_true_if_zero_size_rectangle_exactly_on_a_corner() {
        assert!(encloses_rectangle(
            &create_rectangle(0.0, 0.0, 10.0, 20.0),
            &create_rectangle(0.0, 0.0, 0.0, 0.0),
        ));
    }
}

mod equals_rectangle {
    use super::*;

    #[test]
    fn returns_true_for_identical_rectangles() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        assert!(equals_rectangle(Some(&r), Some(&r)));
        assert!(equals_rectangle(Some(&r), Some(&clone_rectangle(&r))));
    }

    #[test]
    fn returns_false_for_different_rectangles() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let r2 = create_rectangle(1.0, 5.0, 3.0, 4.0);
        assert!(!equals_rectangle(Some(&r), Some(&r2)));
    }

    #[test]
    fn compares_every_field_not_just_the_position() {
        let base = create_rectangle(1.0, 2.0, 3.0, 4.0);
        assert!(!equals_rectangle(Some(&base), Some(&create_rectangle(9.0, 2.0, 3.0, 4.0))));
        assert!(!equals_rectangle(Some(&base), Some(&create_rectangle(1.0, 9.0, 3.0, 4.0))));
        assert!(!equals_rectangle(Some(&base), Some(&create_rectangle(1.0, 2.0, 9.0, 4.0))));
        assert!(!equals_rectangle(Some(&base), Some(&create_rectangle(1.0, 2.0, 3.0, 9.0))));
    }

    #[test]
    fn returns_false_when_either_side_is_missing() {
        let rect = create_rectangle(1.0, 2.0, 3.0, 4.0);
        assert!(!equals_rectangle(Some(&rect), None));
        assert!(!equals_rectangle(None, Some(&rect)));
        assert!(!equals_rectangle(None, None));
    }

    #[test]
    fn holds_a_rectangle_equal_to_itself_even_with_a_nan_field() {
        let nan_rect = create_rectangle(f32::NAN, 2.0, 3.0, 4.0);
        assert!(equals_rectangle(Some(&nan_rect), Some(&nan_rect)));
        let nan_rect2 = create_rectangle(f32::NAN, 2.0, 3.0, 4.0);
        assert!(!equals_rectangle(Some(&nan_rect), Some(&nan_rect2)));
    }

    #[test]
    fn supports_partial_eq_trait() {
        assert_eq!(create_rectangle(1.0, 2.0, 3.0, 4.0), create_rectangle(1.0, 2.0, 3.0, 4.0));
        assert_ne!(create_rectangle(1.0, 2.0, 3.0, 4.0), create_rectangle(1.0, 2.0, 3.0, 5.0));
    }
}

mod expand_rectangle_to_point {
    use super::*;

    #[test]
    fn expands_a_rectangle_to_contain_an_outside_point() {
        let source = create_rectangle(10.0, 10.0, 5.0, 5.0);
        let mut result = create_rectangle(0.0, 0.0, 0.0, 0.0);
        expand_rectangle_to_point(&mut result, &source, &create_vector2(20.0, 12.0));
        assert_eq!(result.x, 10.0);
        assert_eq!(result.y, 10.0);
        assert_eq!(result.width, 10.0);
        assert_eq!(result.height, 5.0);
    }

    #[test]
    fn normalizes_flipped_bounds_while_expanding() {
        let mut result = create_rectangle(0.0, 0.0, 0.0, 0.0);
        expand_rectangle_to_point(&mut result, &create_rectangle(10.0, 10.0, -5.0, -5.0), &create_vector2(12.0, 4.0));
        assert_eq!(result, create_rectangle(5.0, 4.0, 7.0, 6.0));
    }

    #[test]
    fn supports_out_equals_source_rect() {
        let mut source = create_rectangle(10.0, 10.0, 5.0, 5.0);
        let source_clone = clone_rectangle(&source);
        expand_rectangle_to_point(&mut source, &source_clone, &create_vector2(20.0, 12.0));
        assert_eq!(source.x, 10.0);
        assert_eq!(source.y, 10.0);
        assert_eq!(source.width, 10.0);
        assert_eq!(source.height, 5.0);
    }

    #[test]
    fn does_not_expand_for_inside_point() {
        let rect = create_rectangle(2.0, 3.0, 5.0, 4.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        expand_rectangle_to_point(&mut out, &rect, &create_vector2(4.0, 5.0));
        assert_eq!(out, rect);
    }

    #[test]
    fn extends_in_negative_direction() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        expand_rectangle_to_point(&mut out, &create_rectangle(2.0, 3.0, 5.0, 4.0), &create_vector2(-1.0, 10.0));
        assert_eq!(out, create_rectangle(-1.0, 3.0, 8.0, 7.0));
    }
}

mod get_rectangle_bottom {
    use super::*;

    #[test]
    fn returns_y_plus_height() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_bottom(&rect), 22.0);
    }
}

mod get_rectangle_bottom_right {
    use super::*;

    #[test]
    fn returns_correct_vector2() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        let mut br = create_vector2(0.0, 0.0);
        get_rectangle_bottom_right(&mut br, &rect);
        assert_eq!(br, create_vector2(11.0, 22.0));
    }
}

mod get_rectangle_left {
    use super::*;

    #[test]
    fn returns_x() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_left(&rect), 1.0);
    }
}

mod get_rectangle_max_x {
    use super::*;

    #[test]
    fn returns_correct_maximum_x_for_positive_rectangle() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_max_x(&rect), 11.0);
    }

    #[test]
    fn returns_correct_maximum_x_for_flipped_rectangle() {
        let rect = create_rectangle(4.0, 6.0, -3.0, -2.0);
        assert_eq!(get_rectangle_max_x(&rect), 4.0);
    }
}

mod get_rectangle_max_y {
    use super::*;

    #[test]
    fn returns_correct_maximum_y_for_positive_rectangle() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_max_y(&rect), 22.0);
    }

    #[test]
    fn returns_correct_maximum_y_for_flipped_rectangle() {
        let rect = create_rectangle(4.0, 6.0, -3.0, -2.0);
        assert_eq!(get_rectangle_max_y(&rect), 6.0);
    }
}

mod get_rectangle_min_x {
    use super::*;

    #[test]
    fn returns_correct_minimum_x_for_positive_rectangle() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_min_x(&rect), 1.0);
    }

    #[test]
    fn returns_correct_minimum_x_for_flipped_rectangle() {
        let rect = create_rectangle(4.0, 6.0, -3.0, -2.0);
        assert_eq!(get_rectangle_min_x(&rect), 1.0);
    }
}

mod get_rectangle_min_y {
    use super::*;

    #[test]
    fn returns_correct_minimum_y_for_positive_rectangle() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_min_y(&rect), 2.0);
    }

    #[test]
    fn returns_correct_minimum_y_for_flipped_rectangle() {
        let rect = create_rectangle(4.0, 6.0, -3.0, -2.0);
        assert_eq!(get_rectangle_min_y(&rect), 4.0);
    }
}

mod get_rectangle_normalized_bottom_right {
    use super::*;

    #[test]
    fn returns_proper_vector2() {
        let rect = create_rectangle(10.0, 20.0, -5.0, -15.0);
        let mut nbr = create_vector2(0.0, 0.0);
        get_rectangle_normalized_bottom_right(&mut nbr, &rect);
        assert_eq!(nbr.x, 10.0);
        assert_eq!(nbr.y, 20.0);
    }

    #[test]
    fn matches_min_max_for_positive_rectangles() {
        let rect = create_rectangle(2.0, 3.0, 10.0, 15.0);
        let mut nbr = create_vector2(0.0, 0.0);
        get_rectangle_normalized_bottom_right(&mut nbr, &rect);
        assert_eq!(nbr.x, get_rectangle_max_x(&rect));
        assert_eq!(nbr.y, get_rectangle_max_y(&rect));
    }
}

mod get_rectangle_normalized_top_left {
    use super::*;

    #[test]
    fn returns_proper_vector2() {
        let rect = create_rectangle(10.0, 20.0, -5.0, -15.0);
        let mut ntl = create_vector2(0.0, 0.0);
        get_rectangle_normalized_top_left(&mut ntl, &rect);
        assert_eq!(ntl, create_vector2(5.0, 5.0));
    }

    #[test]
    fn matches_min_max_for_positive_rectangles() {
        let rect = create_rectangle(2.0, 3.0, 10.0, 15.0);
        let mut ntl = create_vector2(0.0, 0.0);
        get_rectangle_normalized_top_left(&mut ntl, &rect);
        assert_eq!(ntl.x, get_rectangle_min_x(&rect));
        assert_eq!(ntl.y, get_rectangle_min_y(&rect));
    }
}

mod get_rectangle_right {
    use super::*;

    #[test]
    fn returns_x_plus_width() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_right(&rect), 11.0);
    }
}

mod get_rectangle_size {
    use super::*;

    #[test]
    fn returns_width_and_height_as_vector2() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mut out = create_vector2(0.0, 0.0);
        get_rectangle_size(&mut out, &rect);
        assert_eq!(out, create_vector2(10.0, 20.0));
    }
}

mod get_rectangle_top {
    use super::*;

    #[test]
    fn returns_y() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        assert_eq!(get_rectangle_top(&rect), 2.0);
    }
}

mod get_rectangle_top_left {
    use super::*;

    #[test]
    fn returns_top_left_vector2() {
        let rect = create_rectangle(1.0, 2.0, 10.0, 20.0);
        let mut tl = create_vector2(0.0, 0.0);
        get_rectangle_top_left(&mut tl, &rect);
        assert_eq!(tl, create_vector2(1.0, 2.0));
    }
}

mod inflate_rectangle {
    use super::*;

    #[test]
    fn inflates_rectangle_by_dx_dy() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        inflate_rectangle(&mut out, &create_rectangle(0.0, 0.0, 10.0, 20.0), 2.0, 3.0);
        assert_eq!(out, create_rectangle(-2.0, -3.0, 14.0, 26.0));
    }

    #[test]
    fn correctly_inflates_when_source_and_target_are_the_same() {
        let mut r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let r1_clone = clone_rectangle(&r1);
        inflate_rectangle(&mut r1, &r1_clone, 2.0, 3.0);
        assert_eq!(r1.x, -2.0);
        assert_eq!(r1.y, -3.0);
        assert_eq!(r1.width, 14.0);
        assert_eq!(r1.height, 16.0);
    }
}

mod initialize_rectangle {
    use super::*;

    #[test]
    fn writes_fields() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        initialize_rectangle(&mut out, 1.0, 2.0, 3.0, 4.0);
        assert_eq!(out, create_rectangle(1.0, 2.0, 3.0, 4.0));
    }
}

mod intersects_rectangle {
    use super::*;

    #[test]
    fn returns_true_if_rectangles_overlap() {
        assert!(intersects_rectangle(
            &create_rectangle(0.0, 0.0, 4.0, 4.0),
            &create_rectangle(2.0, 2.0, 4.0, 4.0),
        ));
    }

    #[test]
    fn returns_false_if_rectangles_do_not_overlap() {
        assert!(!intersects_rectangle(
            &create_rectangle(0.0, 0.0, 1.0, 1.0),
            &create_rectangle(5.0, 5.0, 1.0, 1.0),
        ));
    }

    #[test]
    fn returns_false_for_touching_edges() {
        assert!(!intersects_rectangle(
            &create_rectangle(0.0, 0.0, 2.0, 2.0),
            &create_rectangle(2.0, 0.0, 2.0, 2.0),
        ));
    }
}

mod is_empty_rectangle {
    use super::*;

    #[test]
    fn returns_true_for_zero_width_or_height() {
        assert!(!is_empty_rectangle(&create_rectangle(0.0, 0.0, 10.0, 20.0)));
        assert!(is_empty_rectangle(&create_rectangle(0.0, 0.0, 0.0, 20.0)));
        assert!(is_empty_rectangle(&create_rectangle(0.0, 0.0, 10.0, 0.0)));
        assert!(is_empty_rectangle(&create_rectangle(0.0, 0.0, 0.0, 0.0)));
    }

    #[test]
    fn returns_false_for_flipped_rectangles() {
        assert!(!is_empty_rectangle(&create_rectangle(0.0, 0.0, -5.0, -5.0)));
    }
}

mod is_flipped_x_rectangle {
    use super::*;

    #[test]
    fn returns_false_if_width_is_positive() {
        assert!(!is_flipped_x_rectangle(&create_rectangle(0.0, 0.0, 10.0, 20.0)));
    }

    #[test]
    fn returns_true_if_width_is_negative() {
        assert!(is_flipped_x_rectangle(&create_rectangle(0.0, 0.0, -10.0, 20.0)));
    }
}

mod is_flipped_y_rectangle {
    use super::*;

    #[test]
    fn returns_false_if_height_is_positive() {
        assert!(!is_flipped_y_rectangle(&create_rectangle(0.0, 0.0, 10.0, 20.0)));
    }

    #[test]
    fn returns_true_if_height_is_negative() {
        assert!(is_flipped_y_rectangle(&create_rectangle(0.0, 0.0, 10.0, -20.0)));
    }
}

mod merge_rectangle {
    use super::*;

    #[test]
    fn returns_union_of_two_rectangles() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let r3 = create_rectangle(5.0, 15.0, 10.0, 10.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &r, &r3);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 15.0);
        assert_eq!(out.height, 25.0);
    }

    #[test]
    fn union_works_with_zero_width_rectangle() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let r3 = create_rectangle(5.0, 15.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &r, &r3);
        assert!(equals_rectangle(Some(&out), Some(&r)));
    }

    #[test]
    fn has_the_values_of_the_right_hand_rectangle_if_the_left_hand_is_degenerate() {
        let lh = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let rh = create_rectangle(5.0, 15.0, 100.0, 100.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &lh, &rh);
        assert!(equals_rectangle(Some(&out), Some(&rh)));
    }

    #[test]
    fn has_the_values_of_the_left_hand_rectangle_if_the_right_hand_is_degenerate() {
        let lh = create_rectangle(5.0, 15.0, 100.0, 100.0);
        let rh = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &lh, &rh);
        assert!(equals_rectangle(Some(&out), Some(&lh)));
    }

    #[test]
    fn returns_an_empty_rectangle_if_both_are_degenerate() {
        let lh = create_rectangle(-50.0, -150.0, 0.0, 0.0);
        let rh = create_rectangle(-5.0, -15.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &lh, &rh);
        assert!(is_empty_rectangle(&out));
    }

    #[test]
    fn returns_the_xy_of_the_left_hand_rectangle_if_both_are_degenerate() {
        let lh = create_rectangle(-50.0, -150.0, 0.0, 0.0);
        let rh = create_rectangle(-5.0, -15.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &lh, &rh);
        assert!(equals_rectangle(Some(&out), Some(&lh)));
    }

    #[test]
    fn does_nothing_if_right_hand_is_empty_and_source_equals_out() {
        let mut lh = create_rectangle(-50.0, -150.0, 0.0, 0.0);
        let rh = create_rectangle(-5.0, -15.0, 0.0, 0.0);
        let cache = clone_rectangle(&lh);
        let lh_clone = clone_rectangle(&lh);
        merge_rectangle(&mut lh, &lh_clone, &rh);
        assert!(equals_rectangle(Some(&cache), Some(&lh)));
    }

    #[test]
    fn union_works_with_flipped_rectangles() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let r3 = create_rectangle(15.0, 20.0, -10.0, -10.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &r, &r3);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 15.0);
        assert_eq!(out.height, 20.0);
    }

    #[test]
    fn correctly_modifies_the_target_when_union_occurs() {
        let mut r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let r2 = create_rectangle(5.0, 5.0, 10.0, 10.0);
        let r1_clone = clone_rectangle(&r1);
        merge_rectangle(&mut r1, &r1_clone, &r2);
        assert_eq!(r1.width, 15.0);
        assert_eq!(r1.height, 15.0);
    }

    #[test]
    fn correctly_handles_union_of_non_overlapping_rectangles() {
        let mut r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let r2 = create_rectangle(20.0, 20.0, 5.0, 5.0);
        let r1_clone = clone_rectangle(&r1);
        merge_rectangle(&mut r1, &r1_clone, &r2);
        assert_eq!(r1.width, 25.0);
        assert_eq!(r1.height, 25.0);
    }

    #[test]
    fn supports_out_equals_other() {
        let r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let mut r2 = create_rectangle(5.0, 5.0, 10.0, 10.0);
        let r2_clone = clone_rectangle(&r2);
        merge_rectangle(&mut r2, &r1, &r2_clone);
        assert_eq!(r2.x, 0.0);
        assert_eq!(r2.y, 0.0);
        assert_eq!(r2.width, 15.0);
        assert_eq!(r2.height, 15.0);
    }

    #[test]
    fn returns_union_of_non_overlapping_rectangles() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &create_rectangle(0.0, 0.0, 10.0, 10.0), &create_rectangle(20.0, 20.0, 5.0, 5.0));
        assert_eq!(out, create_rectangle(0.0, 0.0, 25.0, 25.0));
    }
}

mod normalize_rectangle {
    use super::*;

    #[test]
    fn returns_rectangle_with_positive_width_and_height() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        normalize_rectangle(&mut out, &create_rectangle(10.0, 20.0, -5.0, -15.0));
        assert_eq!(out, create_rectangle(5.0, 5.0, 5.0, 15.0));
    }

    #[test]
    fn supports_out_equals_source() {
        let mut rect = create_rectangle(10.0, 20.0, -5.0, -15.0);
        let rect_clone = clone_rectangle(&rect);
        normalize_rectangle(&mut rect, &rect_clone);
        assert_eq!(rect.x, 5.0);
        assert_eq!(rect.y, 5.0);
        assert_eq!(rect.width, 5.0);
        assert_eq!(rect.height, 15.0);
    }

    #[test]
    fn normalized_of_positive_rectangle_equals_original() {
        let r = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        normalize_rectangle(&mut out, &r);
        assert_eq!(out.x, r.x);
        assert_eq!(out.y, r.y);
        assert_eq!(out.width, r.width);
        assert_eq!(out.height, r.height);
    }

    #[test]
    fn flips_negative_width() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        normalize_rectangle(&mut out, &create_rectangle(4.0, 0.0, -3.0, 2.0));
        assert_eq!(out, create_rectangle(1.0, 0.0, 3.0, 2.0));
    }
}

mod offset_rectangle {
    use super::*;

    #[test]
    fn moves_rectangle() {
        let mut result = create_rectangle(0.0, 0.0, 0.0, 0.0);
        offset_rectangle(&mut result, &create_rectangle(0.0, 0.0, 10.0, 20.0), 5.0, 10.0);
        assert_eq!(result.x, 5.0);
        assert_eq!(result.y, 10.0);
    }

    #[test]
    fn correctly_offsets_when_source_and_target_are_the_same() {
        let mut r1 = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let r1_clone = clone_rectangle(&r1);
        offset_rectangle(&mut r1, &r1_clone, 5.0, 10.0);
        assert_eq!(r1.x, 5.0);
        assert_eq!(r1.y, 10.0);
    }
}

mod offset_rectangle_by_point {
    use super::*;

    #[test]
    fn moves_rectangle_by_vector2() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        offset_rectangle_by_point(&mut out, &create_rectangle(0.0, 0.0, 10.0, 20.0), &create_vector2(3.0, 4.0));
        assert_eq!(out, create_rectangle(3.0, 4.0, 10.0, 20.0));
    }

    #[test]
    fn supports_out_equals_source() {
        let mut source = create_rectangle(1.0, 2.0, 10.0, 20.0);
        let source_clone = clone_rectangle(&source);
        offset_rectangle_by_point(&mut source, &source_clone, &create_vector2(3.0, 4.0));
        assert_eq!(source.x, 4.0);
        assert_eq!(source.y, 6.0);
        assert_eq!(source.width, 10.0);
        assert_eq!(source.height, 20.0);
    }
}

mod set_empty_rectangle {
    use super::*;

    #[test]
    fn sets_rectangle_to_zero() {
        let mut rect = create_rectangle(1.0, 2.0, 3.0, 4.0);
        set_empty_rectangle(&mut rect);
        assert_eq!(rect, create_rectangle(0.0, 0.0, 0.0, 0.0));
    }
}

mod set_rectangle {
    use super::*;

    #[test]
    fn sets_rectangle_to_specified_values() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        set_rectangle(&mut out, 1.0, 2.0, 3.0, 4.0);
        assert_eq!(out, create_rectangle(1.0, 2.0, 3.0, 4.0));
    }

    #[test]
    fn overwrites_existing_values() {
        let mut rect = create_rectangle(10.0, 20.0, 30.0, 40.0);
        set_rectangle(&mut rect, 0.0, 0.0, 0.0, 0.0);
        assert_eq!(rect, create_rectangle(0.0, 0.0, 0.0, 0.0));
    }
}

mod set_rectangle_bottom {
    use super::*;

    #[test]
    fn adjusts_height_so_that_y_plus_height_equals_value() {
        let mut rect = create_rectangle(0.0, 10.0, 5.0, 5.0);
        set_rectangle_bottom(&mut rect, 30.0);
        assert_eq!(rect.height, 20.0);
    }

    #[test]
    fn can_set_bottom_to_equal_y_zero_height() {
        let mut rect = create_rectangle(0.0, 5.0, 10.0, 10.0);
        set_rectangle_bottom(&mut rect, 5.0);
        assert_eq!(rect.height, 0.0);
    }
}

mod set_rectangle_bottom_right {
    use super::*;

    #[test]
    fn adjusts_width_and_height() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        set_rectangle_bottom_right(&mut rect, &create_vector2(15.0, 25.0));
        assert_eq!(rect.width, 15.0);
        assert_eq!(rect.height, 25.0);
    }
}

mod set_rectangle_left {
    use super::*;

    #[test]
    fn adjusts_width_correctly() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        set_rectangle_left(&mut rect, 5.0);
        assert_eq!(rect.x, 5.0);
        assert_eq!(rect.width, 5.0);
    }
}

mod set_rectangle_right {
    use super::*;

    #[test]
    fn adjusts_width() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        set_rectangle_right(&mut rect, 15.0);
        assert_eq!(rect.width, 15.0);
    }

    #[test]
    fn accounts_for_x() {
        let mut rect = create_rectangle(10.0, 0.0, 10.0, 20.0);
        set_rectangle_right(&mut rect, 15.0);
        assert_eq!(rect.width, 5.0);
    }

    #[test]
    fn can_create_negative_width_flipped_rectangle() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        set_rectangle_right(&mut rect, -5.0);
        assert_eq!(rect.width, -5.0);
    }
}

mod set_rectangle_size {
    use super::*;

    #[test]
    fn adjusts_width_and_height() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        set_rectangle_size(&mut rect, &create_vector2(5.0, 6.0));
        assert_eq!(rect.width, 5.0);
        assert_eq!(rect.height, 6.0);
    }
}

mod set_rectangle_top {
    use super::*;

    #[test]
    fn adjusts_height_correctly() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        set_rectangle_top(&mut rect, 5.0);
        assert_eq!(rect.y, 5.0);
        assert_eq!(rect.height, 15.0);
    }

    #[test]
    fn can_create_negative_height_flipped_rectangle() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        set_rectangle_top(&mut rect, 25.0);
        assert_eq!(rect.height, -5.0);
    }
}

mod set_rectangle_top_left {
    use super::*;

    #[test]
    fn updates_x_and_y() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        set_rectangle_top_left(&mut out, &create_vector2(3.0, 4.0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }
}
