use flight_geometry::contract::*;
use std::f32::consts::PI;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod clone_matrix3 {
    use super::*;

    #[test]
    fn clones_the_matrix_correctly() {
        let m1 = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0);
        let m2 = clone_matrix3(&m1);
        assert_eq!(get_matrix3_element(&m2, 0, 0), 2.0);
        assert_eq!(get_matrix3_element(&m2, 0, 1), 3.0);
        assert_eq!(get_matrix3_element(&m2, 0, 2), 4.0);
        assert_eq!(get_matrix3_element(&m2, 1, 0), 5.0);
        assert_eq!(get_matrix3_element(&m2, 1, 1), 6.0);
        assert_eq!(get_matrix3_element(&m2, 1, 2), 7.0);
        assert_eq!(get_matrix3_element(&m2, 2, 0), 8.0);
        assert_eq!(get_matrix3_element(&m2, 2, 1), 9.0);
        assert_eq!(get_matrix3_element(&m2, 2, 2), 10.0);
    }
}

mod copy_matrix3 {
    use super::*;

    #[test]
    fn copies_matrix_values_from_another_matrix() {
        let m1 = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0);
        let mut m2 = create_matrix3();
        copy_matrix3(&mut m2, &m1);
        assert_eq!(get_matrix3_element(&m2, 0, 0), 2.0);
        assert_eq!(get_matrix3_element(&m2, 0, 1), 3.0);
        assert_eq!(get_matrix3_element(&m2, 0, 2), 4.0);
        assert_eq!(get_matrix3_element(&m2, 1, 0), 5.0);
        assert_eq!(get_matrix3_element(&m2, 1, 1), 6.0);
        assert_eq!(get_matrix3_element(&m2, 1, 2), 7.0);
        assert_eq!(get_matrix3_element(&m2, 2, 0), 8.0);
        assert_eq!(get_matrix3_element(&m2, 2, 1), 9.0);
        assert_eq!(get_matrix3_element(&m2, 2, 2), 10.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0);
        let matrix_copy = clone_matrix3(&matrix);
        copy_matrix3(&mut matrix, &matrix_copy);
        assert_eq!(matrix.m, [2.0, 5.0, 8.0, 3.0, 6.0, 9.0, 4.0, 7.0, 10.0]);
    }
}

mod copy_matrix3_column_from_vector3 {
    use super::*;

    #[test]
    fn copies_column_0_from_a_vector3_to_a_matrix3() {
        let mut m = create_matrix3();
        let v = create_vector3(1.0, 2.0, 3.0);
        copy_matrix3_column_from_vector3(&mut m, 0, &v);
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 1, 0), 2.0);
        assert_eq!(get_matrix3_element(&m, 2, 0), 3.0);
    }

    #[test]
    fn copies_column_1() {
        let mut m = create_matrix3();
        let v = create_vector3(3.0, 4.0, 5.0);
        copy_matrix3_column_from_vector3(&mut m, 1, &v);
        assert_eq!(get_matrix3_element(&m, 0, 1), 3.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 4.0);
        assert_eq!(get_matrix3_element(&m, 2, 1), 5.0);
    }

    #[test]
    fn copies_column_2() {
        let mut m = create_matrix3();
        let v = create_vector3(5.0, 6.0, 7.0);
        copy_matrix3_column_from_vector3(&mut m, 2, &v);
        assert_eq!(get_matrix3_element(&m, 0, 2), 5.0);
        assert_eq!(get_matrix3_element(&m, 1, 2), 6.0);
        assert_eq!(get_matrix3_element(&m, 2, 2), 7.0);
    }

    #[test]
    #[should_panic]
    fn panics_when_column_is_out_of_bounds() {
        let mut m = create_matrix3();
        let v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_column_from_vector3(&mut m, 3, &v);
    }
}

mod copy_matrix3_column_to_vector3 {
    use super::*;

    #[test]
    fn copies_column_0_to_a_vector3_from_a_matrix3() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_column_to_vector3(&mut v, 0, &m);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 4.0);
        assert_eq!(v.z, 7.0);
    }

    #[test]
    fn copies_column_1_into_vector3() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_column_to_vector3(&mut v, 1, &m);
        assert_eq!(v.x, 2.0);
        assert_eq!(v.y, 5.0);
        assert_eq!(v.z, 8.0);
    }

    #[test]
    fn copies_column_2_into_vector3() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_column_to_vector3(&mut v, 2, &m);
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 6.0);
        assert_eq!(v.z, 9.0);
    }

    #[test]
    #[should_panic]
    fn panics_when_column_is_out_of_bounds() {
        let m = create_matrix3();
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_column_to_vector3(&mut v, 3, &m);
    }
}

mod copy_matrix3_row_from_vector3 {
    use super::*;

    #[test]
    fn copies_row_0_from_a_vector3_to_a_matrix3() {
        let mut m = create_matrix3();
        let v = create_vector3(1.0, 2.0, 3.0);
        copy_matrix3_row_from_vector3(&mut m, 0, &v);
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 0, 1), 2.0);
        assert_eq!(get_matrix3_element(&m, 0, 2), 3.0);
    }

    #[test]
    fn copies_row_1() {
        let mut m = create_matrix3();
        let v = create_vector3(2.0, 4.0, 6.0);
        copy_matrix3_row_from_vector3(&mut m, 1, &v);
        assert_eq!(get_matrix3_element(&m, 1, 0), 2.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 4.0);
        assert_eq!(get_matrix3_element(&m, 1, 2), 6.0);
    }

    #[test]
    #[should_panic]
    fn panics_when_row_is_out_of_bounds() {
        let mut m = create_matrix3();
        let v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_row_from_vector3(&mut m, 3, &v);
    }
}

mod copy_matrix3_row_to_vector3 {
    use super::*;

    #[test]
    fn copies_row_0_to_a_vector3_from_a_matrix3() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_row_to_vector3(&mut v, 0, &m);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn copies_row_1() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_row_to_vector3(&mut v, 1, &m);
        assert_eq!(v.x, 4.0);
        assert_eq!(v.y, 5.0);
        assert_eq!(v.z, 6.0);
    }

    #[test]
    fn returns_0_0_1_for_row_2_of_identity() {
        let m = create_matrix3();
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_row_to_vector3(&mut v, 2, &m);
        assert_eq!(v.x, 0.0);
        assert_eq!(v.y, 0.0);
        assert_eq!(v.z, 1.0);
    }

    #[test]
    #[should_panic]
    fn panics_when_row_is_out_of_bounds() {
        let m = create_matrix3();
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix3_row_to_vector3(&mut v, 3, &m);
    }
}

mod create_matrix3 {
    use super::*;

    #[test]
    fn defaults_to_identity_matrix_when_no_values_are_provided() {
        let m = create_matrix3();
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 0, 1), 0.0);
        assert_eq!(get_matrix3_element(&m, 0, 2), 0.0);
        assert_eq!(get_matrix3_element(&m, 1, 0), 0.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 1.0);
        assert_eq!(get_matrix3_element(&m, 1, 2), 0.0);
        assert_eq!(get_matrix3_element(&m, 2, 0), 0.0);
        assert_eq!(get_matrix3_element(&m, 2, 1), 0.0);
        assert_eq!(get_matrix3_element(&m, 2, 2), 1.0);
    }
}

mod create_matrix3_from_values {
    use super::*;

    #[test]
    fn initializes_matrix_with_provided_values() {
        let m = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0);
        assert_eq!(get_matrix3_element(&m, 0, 0), 2.0);
        assert_eq!(get_matrix3_element(&m, 0, 1), 3.0);
        assert_eq!(get_matrix3_element(&m, 0, 2), 4.0);
        assert_eq!(get_matrix3_element(&m, 1, 0), 5.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 6.0);
        assert_eq!(get_matrix3_element(&m, 1, 2), 7.0);
        assert_eq!(get_matrix3_element(&m, 2, 0), 8.0);
        assert_eq!(get_matrix3_element(&m, 2, 1), 9.0);
        assert_eq!(get_matrix3_element(&m, 2, 2), 10.0);
    }

    #[test]
    fn stores_row_column_arguments_column_major() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        assert_eq!(m.m, [1.0, 4.0, 7.0, 2.0, 5.0, 8.0, 3.0, 6.0, 9.0]);
    }
}

mod equals_matrix3 {
    use super::*;

    #[test]
    fn returns_false_when_one_is_none_and_other_is_not() {
        let mat1 = create_matrix3();
        assert!(!equals_matrix3(Some(&mat1), None));
        assert!(!equals_matrix3(None, Some(&mat1)));
    }

    #[test]
    fn returns_true_when_both_are_none() {
        assert!(equals_matrix3(None, None));
    }

    #[test]
    fn returns_false_when_values_differ() {
        let mat1 = create_matrix3();
        let mut mat2 = create_matrix3();
        set_matrix3_element(&mut mat2, 0, 0, 2.0);
        assert!(!equals_matrix3(Some(&mat1), Some(&mat2)));
    }

    #[test]
    fn returns_true_when_values_are_equal() {
        let mat1 = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mat2 = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        assert!(equals_matrix3(Some(&mat1), Some(&mat2)));
    }

    #[test]
    fn returns_true_for_same_reference() {
        let mat = create_matrix3();
        assert!(equals_matrix3(Some(&mat), Some(&mat)));
    }
}

mod get_matrix3_determinant {
    use super::*;

    #[test]
    fn returns_1_for_the_identity_matrix() {
        assert_approx(get_matrix3_determinant(&create_matrix3()), 1.0);
    }

    #[test]
    fn returns_0_for_a_singular_matrix() {
        assert_approx(
            get_matrix3_determinant(&create_matrix3_from_values(
                1.0, 2.0, 3.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0,
            )),
            0.0,
        );
    }

    #[test]
    fn returns_a_negative_value_when_a_row_is_negated() {
        assert_approx(
            get_matrix3_determinant(&create_matrix3_from_values(
                -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0,
            )),
            -1.0,
        );
    }
}

mod get_matrix3_element {
    use super::*;

    #[test]
    fn returns_the_element_at_the_given_row_and_column() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 0, 1), 2.0);
        assert_eq!(get_matrix3_element(&m, 0, 2), 3.0);
        assert_eq!(get_matrix3_element(&m, 1, 0), 4.0);
        assert_eq!(get_matrix3_element(&m, 2, 2), 9.0);
    }
}

mod initialize_matrix3 {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_matrix3() {
        let mut m = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0);
        initialize_matrix3(&mut m);
        let expected = create_matrix3();
        assert!(equals_matrix3(Some(&m), Some(&expected)));
        assert_eq!(m.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }
}

mod inverse_matrix3 {
    use super::*;

    #[test]
    fn inverts_the_matrix_correctly() {
        let m = create_matrix3_from_values(2.0, 0.0, 5.0, 0.0, 2.0, 3.0, 0.0, 0.0, 1.0);
        let mut out = create_matrix3();
        inverse_matrix3(&mut out, &m);

        assert_approx(out.m[0], 0.5);
        assert_approx(out.m[1], 0.0);
        assert_approx(out.m[3], 0.0);
        assert_approx(out.m[4], 0.5);
        assert_approx(out.m[6], -2.5);
        assert_approx(out.m[7], -1.5);
    }

    #[test]
    fn does_not_depend_on_initial_out_matrix_values() {
        let source = create_matrix3_from_values(2.0, 1.0, 5.0, 3.0, 4.0, 6.0, 0.0, 0.0, 1.0);
        let mut out = create_matrix3_from_values(9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 0.0, 0.0, 1.0);
        inverse_matrix3(&mut out, &source);

        let mut result = create_matrix3();
        multiply_matrix3(&mut result, &source, &out);

        assert_approx(get_matrix3_element(&result, 0, 0), 1.0);
        assert_approx(get_matrix3_element(&result, 0, 1), 0.0);
        assert_approx(get_matrix3_element(&result, 1, 0), 0.0);
        assert_approx(get_matrix3_element(&result, 1, 1), 1.0);
    }

    #[test]
    fn supports_out_equals_source_for_affine_matrices() {
        let mut matrix = create_matrix3_from_values(2.0, 1.0, 5.0, 3.0, 4.0, 6.0, 0.0, 0.0, 1.0);
        let mut expected = create_matrix3();
        inverse_matrix3(&mut expected, &matrix);

        let matrix_copy = clone_matrix3(&matrix);
        inverse_matrix3(&mut matrix, &matrix_copy);

        assert!(equals_matrix3(Some(&matrix), Some(&expected)));
    }

    #[test]
    fn supports_out_equals_source_for_non_affine_matrices() {
        let mut matrix = create_matrix3_from_values(1.0, 2.0, 3.0, 0.0, 1.0, 4.0, 5.0, 6.0, 0.0);
        let mut expected = create_matrix3();
        inverse_matrix3(&mut expected, &matrix);

        let matrix_copy = clone_matrix3(&matrix);
        inverse_matrix3(&mut matrix, &matrix_copy);

        assert!(equals_matrix3(Some(&matrix), Some(&expected)));
    }

    #[test]
    fn returns_true_on_success() {
        let m = create_matrix3_from_values(2.0, 0.0, 5.0, 0.0, 2.0, 3.0, 0.0, 0.0, 1.0);
        let mut out = create_matrix3();
        assert!(inverse_matrix3(&mut out, &m));
    }

    #[test]
    fn returns_false_and_fills_nan_for_a_singular_affine_matrix() {
        let m = create_matrix3_from_values(0.0, 0.0, 5.0, 0.0, 0.0, 3.0, 0.0, 0.0, 1.0);
        let mut out = create_matrix3();
        assert!(!inverse_matrix3(&mut out, &m));
        assert!(out.m[0].is_nan());
        assert!(out.m[4].is_nan());
    }

    #[test]
    fn returns_false_and_fills_nan_for_a_singular_non_affine_matrix() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 2.0, 4.0, 6.0, 1.0, 1.0, 1.0);
        let mut out = create_matrix3();
        assert!(!inverse_matrix3(&mut out, &m));
        assert!(out.m[0].is_nan());
    }

    #[test]
    fn returns_false_for_a_singular_matrix_with_out_equals_source() {
        let mut m = create_matrix3_from_values(0.0, 0.0, 5.0, 0.0, 0.0, 3.0, 0.0, 0.0, 1.0);
        let m_copy = clone_matrix3(&m);
        assert!(!inverse_matrix3(&mut m, &m_copy));
        assert!(m.m[0].is_nan());
    }
}

mod is_affine_matrix3 {
    use super::*;

    #[test]
    fn returns_true_for_identity_matrix() {
        let m = create_matrix3();
        assert!(is_affine_matrix3(&m));
    }

    #[test]
    fn returns_false_when_last_row_is_not_0_0_1() {
        let m = create_matrix3_from_values(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
        assert!(!is_affine_matrix3(&m));
    }

    #[test]
    fn returns_true_for_a_matrix_with_translation() {
        let m = create_matrix3_from_values(1.0, 0.0, 5.0, 0.0, 1.0, 10.0, 0.0, 0.0, 1.0);
        assert!(is_affine_matrix3(&m));
    }
}

mod multiply_matrix3 {
    use super::*;

    #[test]
    fn multiplies_non_affine_matrices_into_distinct_output() {
        let a = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0);
        let b = create_matrix3_from_values(2.0, 0.0, 1.0, 1.0, 3.0, 0.0, 0.0, 2.0, 4.0);
        let expected =
            create_matrix3_from_values(4.0, 12.0, 13.0, 13.0, 27.0, 28.0, 22.0, 44.0, 47.0);
        let mut out = create_matrix3();
        multiply_matrix3(&mut out, &a, &b);
        assert!(equals_matrix3(Some(&out), Some(&expected)));
    }

    #[test]
    fn multiplies_non_affine_matrices_with_aliased_output() {
        let mut a = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0);
        let b = create_matrix3_from_values(2.0, 0.0, 1.0, 1.0, 3.0, 0.0, 0.0, 2.0, 4.0);
        let expected =
            create_matrix3_from_values(4.0, 12.0, 13.0, 13.0, 27.0, 28.0, 22.0, 44.0, 47.0);
        let a_copy = clone_matrix3(&a);
        multiply_matrix3(&mut a, &a_copy, &b);
        assert!(equals_matrix3(Some(&a), Some(&expected)));
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 7.0, 8.0, 0.0, 0.0, 1.0);
        let b = create_matrix3_from_values(11.0, 13.0, 17.0, 19.0, 23.0, 29.0, 0.0, 0.0, 1.0);
        let mut expected = create_matrix3();
        multiply_matrix3(&mut expected, &a, &b);

        let a_copy = clone_matrix3(&a);
        multiply_matrix3(&mut a, &a_copy, &b);
        assert!(equals_matrix3(Some(&a), Some(&expected)));
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 7.0, 8.0, 0.0, 0.0, 1.0);
        let mut b = create_matrix3_from_values(11.0, 13.0, 17.0, 19.0, 23.0, 29.0, 0.0, 0.0, 1.0);
        let mut expected = create_matrix3();
        multiply_matrix3(&mut expected, &a, &b);

        let b_copy = clone_matrix3(&b);
        multiply_matrix3(&mut b, &a, &b_copy);
        assert!(equals_matrix3(Some(&b), Some(&expected)));
    }

    #[test]
    fn multiplies_identity_correctly() {
        let a = create_matrix3();
        let b = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 0.0, 0.0, 1.0);
        let mut out = create_matrix3();
        multiply_matrix3(&mut out, &a, &b);
        assert!(equals_matrix3(Some(&out), Some(&b)));
    }

    #[test]
    fn composes_an_affine_scale_then_translate() {
        let mut a = create_matrix3_from_values(2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 1.0);
        let b = create_matrix3_from_values(1.0, 0.0, 5.0, 0.0, 1.0, 5.0, 0.0, 0.0, 1.0);
        let a_copy = clone_matrix3(&a);
        multiply_matrix3(&mut a, &a_copy, &b);
        assert_eq!(get_matrix3_element(&a, 0, 2), 10.0);
        assert_eq!(get_matrix3_element(&a, 1, 2), 10.0);
    }
}

mod rotate_matrix3 {
    use super::*;

    #[test]
    fn rotates_the_matrix_correctly() {
        let m = create_matrix3();
        let mut out = create_matrix3();
        rotate_matrix3(&mut out, &m, PI / 2.0);
        assert_approx(get_matrix3_element(&out, 0, 0), 0.0);
        assert_approx(get_matrix3_element(&out, 0, 1), -1.0);
        assert_approx(get_matrix3_element(&out, 1, 0), 1.0);
        assert_approx(get_matrix3_element(&out, 1, 1), 0.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 7.0, 8.0, 11.0, 13.0, 17.0);
        let mut expected = create_matrix3();
        rotate_matrix3(&mut expected, &matrix, PI / 2.0);

        let matrix_copy = clone_matrix3(&matrix);
        rotate_matrix3(&mut matrix, &matrix_copy, PI / 2.0);
        assert!(equals_matrix3(Some(&matrix), Some(&expected)));
    }
}

mod scale_matrix3 {
    use super::*;

    #[test]
    fn scales_the_matrix_correctly() {
        let m = create_matrix3();
        let mut out = create_matrix3();
        scale_matrix3(&mut out, &m, 2.0, 3.0);
        assert_eq!(get_matrix3_element(&out, 0, 0), 2.0);
        assert_eq!(get_matrix3_element(&out, 1, 1), 3.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let matrix_copy = clone_matrix3(&matrix);
        scale_matrix3(&mut matrix, &matrix_copy, 2.0, 3.0);
        assert_eq!(matrix.m, [2.0, 8.0, 14.0, 6.0, 15.0, 24.0, 3.0, 6.0, 9.0]);
    }
}

mod set_matrix3 {
    use super::*;

    #[test]
    fn sets_all_9_elements_by_row_column() {
        let mut m = create_matrix3();
        set_matrix3(&mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        for row in 0..3 {
            for col in 0..3 {
                assert_eq!(
                    get_matrix3_element(&m, row, col),
                    (row * 3 + col + 1) as f32
                );
            }
        }
    }

    #[test]
    fn stores_its_arguments_column_major() {
        let mut m = create_matrix3();
        set_matrix3(&mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        assert_eq!(m.m, [1.0, 4.0, 7.0, 2.0, 5.0, 8.0, 3.0, 6.0, 9.0]);
    }
}

mod set_matrix3_element {
    use super::*;

    #[test]
    fn writes_the_value_at_the_given_row_and_column() {
        let mut m = create_matrix3();
        set_matrix3_element(&mut m, 1, 2, 42.0);
        assert_eq!(get_matrix3_element(&m, 1, 2), 42.0);
    }

    #[test]
    fn does_not_affect_other_elements() {
        let mut m = create_matrix3();
        set_matrix3_element(&mut m, 0, 1, 7.0);
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 1.0);
    }
}

mod set_matrix3_from_float32_array {
    use super::*;

    #[test]
    fn reads_9_values_starting_at_the_given_offset() {
        let data: [f32; 10] = [99.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let mut m = create_matrix3();
        set_matrix3_from_float32_array(&mut m, 1, &data);
        assert_eq!(m.m, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    }

    #[test]
    fn reads_from_offset_zero() {
        let data: [f32; 9] = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let mut m = create_matrix3();
        set_matrix3_from_float32_array(&mut m, 0, &data);
        assert_eq!(m.m, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    }
}

mod set_matrix3_from_matrix {
    use super::*;

    #[test]
    fn converts_an_identity_matrix_to_a_matrix3() {
        let mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut mat = create_matrix3();
        set_matrix3_from_matrix(&mut mat, &mat2d);
        assert_eq!(mat.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn handles_scaling_and_translation() {
        let mat2d = create_matrix(2.0, 0.0, 0.0, 3.0, 5.0, 10.0);
        let mut mat = create_matrix3();
        set_matrix3_from_matrix(&mut mat, &mat2d);
        assert_eq!(mat.m, [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 5.0, 10.0, 1.0]);
    }
}

mod set_matrix3_from_matrix4 {
    use super::*;

    #[test]
    fn converts_an_identity_matrix4_to_a_matrix3() {
        let mut m4 = create_matrix4();
        m4.m = [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 3.0, 4.0, 5.0, 1.0,
        ];
        let mut mat = create_matrix3();
        set_matrix3_from_matrix4(&mut mat, &m4);
        assert_eq!(mat.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn handles_non_identity_matrix4_correctly() {
        let mut m4 = create_matrix4();
        m4.m = [
            2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 5.0, 6.0, 7.0, 1.0,
        ];
        let mut mat = create_matrix3();
        set_matrix3_from_matrix4(&mut mat, &m4);
        assert_eq!(mat.m, [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 4.0]);
    }

    #[test]
    fn copies_the_upper_left_3x3_column_major() {
        let mut m4 = create_matrix4();
        m4.m = [
            1.0, 2.0, 3.0, 0.0, 4.0, 5.0, 6.0, 0.0, 7.0, 8.0, 9.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];
        let mut mat = create_matrix3();
        set_matrix3_from_matrix4(&mut mat, &m4);
        assert_eq!(mat.m, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
        assert_eq!(get_matrix3_element(&mat, 0, 1), 4.0);
        assert_eq!(get_matrix3_element(&mat, 1, 0), 2.0);
    }
}

mod set_matrix3_identity {
    use super::*;

    #[test]
    fn resets_a_matrix_to_the_identity() {
        let mut m = create_matrix3_from_values(2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0);
        set_matrix3_identity(&mut m);
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 1.0);
        assert_eq!(get_matrix3_element(&m, 2, 2), 1.0);
        assert_eq!(get_matrix3_element(&m, 0, 1), 0.0);
        assert_eq!(get_matrix3_element(&m, 1, 0), 0.0);
    }
}

mod set_matrix3_normal_from_matrix4 {
    use super::*;

    #[test]
    fn equals_the_rotation_basis_for_an_orthonormal_matrix() {
        let mut m4 = create_matrix4();
        m4.m = [
            0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];
        let mut out = create_matrix3();
        set_matrix3_normal_from_matrix4(&mut out, &m4);
        assert_approx(get_matrix3_element(&out, 0, 0), 0.0);
        assert_approx(get_matrix3_element(&out, 0, 1), -1.0);
        assert_approx(get_matrix3_element(&out, 1, 0), 1.0);
        assert_approx(get_matrix3_element(&out, 1, 1), 0.0);
        assert_approx(get_matrix3_element(&out, 2, 2), 1.0);
    }

    #[test]
    fn uploads_column_major_so_a_gl_upload_needs_no_transpose() {
        let mut m4 = create_matrix4();
        m4.m = [
            0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];
        let mut out = create_matrix3();
        set_matrix3_normal_from_matrix4(&mut out, &m4);
        assert_approx(out.m[0], 0.0);
        assert_approx(out.m[1], 1.0);
        assert_approx(out.m[3], -1.0);
        assert_approx(out.m[4], 0.0);
    }

    #[test]
    fn keeps_a_normal_perpendicular_under_non_uniform_scale() {
        let mut m4 = create_matrix4();
        m4.m = [
            2.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];
        let mut normal_matrix = create_matrix3();
        set_matrix3_normal_from_matrix4(&mut normal_matrix, &m4);
        assert_approx(get_matrix3_element(&normal_matrix, 0, 0), 0.5);
        assert_approx(get_matrix3_element(&normal_matrix, 1, 1), 1.0);
        assert_approx(get_matrix3_element(&normal_matrix, 2, 2), 1.0);
    }
}

mod translate_matrix3 {
    use super::*;

    #[test]
    fn translates_the_matrix_correctly() {
        let m = create_matrix3();
        let mut out = create_matrix3();
        translate_matrix3(&mut out, &m, 2.0, 3.0);
        assert_eq!(get_matrix3_element(&out, 0, 2), 2.0);
        assert_eq!(get_matrix3_element(&out, 1, 2), 3.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.0, 0.0, 1.0);
        let matrix_copy = clone_matrix3(&matrix);
        translate_matrix3(&mut matrix, &matrix_copy, 2.0, 3.0);
        assert_eq!(matrix.m, [1.0, 4.0, 0.0, 2.0, 5.0, 0.0, 11.0, 29.0, 1.0]);
    }
}

mod transpose_matrix3 {
    use super::*;

    #[test]
    fn swaps_rows_and_columns() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut out = create_matrix3();
        transpose_matrix3(&mut out, &m);
        assert_eq!(out.m, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
        assert_eq!(get_matrix3_element(&out, 0, 1), 4.0);
        assert_eq!(get_matrix3_element(&out, 1, 0), 2.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let m_copy = clone_matrix3(&m);
        transpose_matrix3(&mut m, &m_copy);
        assert_eq!(m.m, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    }

    #[test]
    fn transpose_of_identity_is_identity() {
        let m = create_matrix3();
        let mut out = create_matrix3();
        transpose_matrix3(&mut out, &m);
        assert_eq!(out.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }
}

mod write_matrix3_to_float32_array {
    use super::*;

    #[test]
    fn writes_9_values_starting_at_the_given_offset() {
        let m = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut data = [0.0_f32; 10];
        write_matrix3_to_float32_array(&mut data, 1, &m);
        assert_eq!(data, [0.0, 1.0, 4.0, 7.0, 2.0, 5.0, 8.0, 3.0, 6.0, 9.0]);
    }

    #[test]
    fn round_trips_through_set_matrix3_from_float32_array() {
        let m = create_matrix3_from_values(9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0);
        let mut data = [0.0_f32; 9];
        write_matrix3_to_float32_array(&mut data, 0, &m);
        let mut m2 = create_matrix3();
        set_matrix3_from_float32_array(&mut m2, 0, &data);
        assert!(equals_matrix3(Some(&m2), Some(&m)));
    }
}
