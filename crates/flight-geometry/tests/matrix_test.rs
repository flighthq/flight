use flight_geometry::contract::*;
use std::f32::consts::PI;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod clone_matrix {
    use super::*;

    #[test]
    fn should_clone_the_matrix_correctly() {
        let m1 = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let m2 = clone_matrix(&m1);
        assert_eq!(m2.a, 2.0);
        assert_eq!(m2.b, 3.0);
        assert_eq!(m2.c, 4.0);
        assert_eq!(m2.d, 5.0);
        assert_eq!(m2.tx, 6.0);
        assert_eq!(m2.ty, 7.0);
    }
}

mod copy_matrix {
    use super::*;

    #[test]
    fn should_copy_matrix_values_from_another_matrix() {
        let m1 = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let mut m2 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        copy_matrix(&mut m2, &m1);
        assert_eq!(m2.a, 2.0);
        assert_eq!(m2.b, 3.0);
        assert_eq!(m2.c, 4.0);
        assert_eq!(m2.d, 5.0);
        assert_eq!(m2.tx, 6.0);
        assert_eq!(m2.ty, 7.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let matrix_copy = clone_matrix(&matrix);
        copy_matrix(&mut matrix, &matrix_copy);
        assert_eq!(matrix.a, 2.0);
        assert_eq!(matrix.b, 3.0);
        assert_eq!(matrix.c, 4.0);
        assert_eq!(matrix.d, 5.0);
        assert_eq!(matrix.tx, 6.0);
        assert_eq!(matrix.ty, 7.0);
    }
}

mod copy_matrix_column_from_vector3 {
    use super::*;

    #[test]
    fn should_copy_column_0_from_a_vector3_to_a_matrix() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let v = create_vector3(1.0, 2.0, 0.0);
        copy_matrix_column_from_vector3(&mut m, 0, &v);
        assert_eq!(m.a, 1.0);
        assert_eq!(m.b, 2.0);
    }

    #[test]
    fn should_copy_column_1() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let v = create_vector3(3.0, 4.0, 0.0);
        copy_matrix_column_from_vector3(&mut m, 1, &v);
        assert_eq!(m.c, 3.0);
        assert_eq!(m.d, 4.0);
    }

    #[test]
    fn should_copy_column_2() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let v = create_vector3(5.0, 6.0, 0.0);
        copy_matrix_column_from_vector3(&mut m, 2, &v);
        assert_eq!(m.tx, 5.0);
        assert_eq!(m.ty, 6.0);
    }
}

mod copy_matrix_column_to_vector3 {
    use super::*;

    #[test]
    fn should_copy_column_0_to_a_vector3_from_a_matrix() {
        let m = create_matrix(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix_column_to_vector3(&mut v, 0, &m);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 0.0);
    }

    #[test]
    fn should_copy_column_1_into_vector3() {
        let m = create_matrix(0.0, 0.0, 3.0, 4.0, 0.0, 0.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix_column_to_vector3(&mut v, 1, &m);
        assert_eq!(v.x, 3.0);
        assert_eq!(v.y, 4.0);
        assert_eq!(v.z, 0.0);
    }

    #[test]
    fn should_copy_column_2_into_vector3_and_set_z_to_1() {
        let m = create_matrix(0.0, 0.0, 0.0, 0.0, 7.0, 8.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix_column_to_vector3(&mut v, 2, &m);
        assert_eq!(v.x, 7.0);
        assert_eq!(v.y, 8.0);
        assert_eq!(v.z, 1.0);
    }
}

mod copy_matrix_row_from_vector3 {
    use super::*;

    #[test]
    fn should_copy_row_0_from_a_vector3_to_a_matrix() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let v = create_vector3(1.0, 2.0, 3.0);
        copy_matrix_row_from_vector3(&mut m, 0, &v);
        assert_eq!(m.a, 1.0);
        assert_eq!(m.c, 2.0);
        assert_eq!(m.tx, 3.0);
    }

    #[test]
    fn should_copy_row_1() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let v = create_vector3(2.0, 4.0, 6.0);
        copy_matrix_row_from_vector3(&mut m, 1, &v);
        assert_eq!(m.b, 2.0);
        assert_eq!(m.d, 4.0);
        assert_eq!(m.ty, 6.0);
    }

    #[test]
    fn leaves_the_fixed_identity_row_unchanged_for_row_2() {
        let mut m = create_matrix(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        copy_matrix_row_from_vector3(&mut m, 2, &create_vector3(7.0, 8.0, 9.0));
        assert_eq!(m.a, 1.0);
        assert_eq!(m.b, 2.0);
        assert_eq!(m.c, 3.0);
        assert_eq!(m.d, 4.0);
        assert_eq!(m.tx, 5.0);
        assert_eq!(m.ty, 6.0);
    }
}

mod copy_matrix_row_to_vector3 {
    use super::*;

    #[test]
    fn should_copy_row_0_to_a_vector3_from_a_matrix() {
        let m = create_matrix(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix_row_to_vector3(&mut v, 0, &m);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 3.0);
        assert_eq!(v.z, 5.0);
    }

    #[test]
    fn should_copy_row_1() {
        let m = create_matrix(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix_row_to_vector3(&mut v, 1, &m);
        assert_eq!(v.x, 2.0);
        assert_eq!(v.y, 4.0);
        assert_eq!(v.z, 6.0);
    }

    #[test]
    fn should_return_0_0_1_for_row_2() {
        let m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut v = create_vector3(0.0, 0.0, 0.0);
        copy_matrix_row_to_vector3(&mut v, 2, &m);
        assert_eq!(v.x, 0.0);
        assert_eq!(v.y, 0.0);
        assert_eq!(v.z, 1.0);
    }
}

mod create_gradient_transform_matrix {
    use super::*;

    #[test]
    fn returns_a_matrix_equivalent_to_calling_set_gradient_transform() {
        let m1 = create_gradient_transform_matrix(100.0, 200.0, 0.0, 0.0, 0.0);
        let mut m2 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_gradient_transform_matrix(&mut m2, 100.0, 200.0, 0.0, 0.0, 0.0);
        assert!(equals_matrix(Some(&m1), Some(&m2), true));
    }

    #[test]
    fn sets_tx_to_tx_plus_width_over_2_and_ty_to_ty_plus_height_over_2() {
        let m = create_gradient_transform_matrix(100.0, 200.0, 0.0, 10.0, 20.0);
        assert_approx(m.tx, 60.0);
        assert_approx(m.ty, 120.0);
    }
}

mod create_matrix {
    use super::*;

    #[test]
    fn should_initialize_matrix_with_provided_values() {
        let m = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        assert_eq!(m.a, 2.0);
        assert_eq!(m.b, 3.0);
        assert_eq!(m.c, 4.0);
        assert_eq!(m.d, 5.0);
        assert_eq!(m.tx, 6.0);
        assert_eq!(m.ty, 7.0);
    }

    #[test]
    fn should_default_to_identity_matrix() {
        let m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert_eq!(m.a, 1.0);
        assert_eq!(m.b, 0.0);
        assert_eq!(m.c, 0.0);
        assert_eq!(m.d, 1.0);
        assert_eq!(m.tx, 0.0);
        assert_eq!(m.ty, 0.0);
    }
}

mod create_transform_matrix {
    use super::*;

    #[test]
    fn should_create_a_matrix_and_call_set_transform() {
        let m1 = create_transform_matrix(2.0, 4.0, 45.0, 10.0, 100.0);
        let mut m2 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_transform_matrix(&mut m2, 2.0, 4.0, 45.0, 10.0, 100.0);
        assert!(equals_matrix(Some(&m1), Some(&m2), true));
    }
}

mod equals_matrix {
    use super::*;

    #[test]
    fn should_return_false_if_one_matrix_is_none_and_the_other_is_not() {
        let mat1 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!equals_matrix(Some(&mat1), None, true));
    }

    #[test]
    fn should_return_false_if_one_matrix_is_none_the_other_is_some() {
        let mat1 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!equals_matrix(Some(&mat1), None, true));
        assert!(!equals_matrix(None, Some(&mat1), true));
    }

    #[test]
    fn should_return_true_if_both_are_none() {
        assert!(equals_matrix(None::<&Matrix>, None::<&Matrix>, true));
    }

    #[test]
    fn should_return_false_if_both_are_defined_and_have_different_values() {
        let mat1 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mat2 = create_matrix(2.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!equals_matrix(Some(&mat1), Some(&mat2), true));
    }

    #[test]
    fn should_allow_differences_in_translation_if_compare_translation_is_false() {
        let mat1 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mat2 = create_matrix(1.0, 0.0, 0.0, 1.0, 100.0, 0.0);
        assert!(equals_matrix(Some(&mat1), Some(&mat2), false));
    }

    #[test]
    fn should_not_allow_differences_in_translation_if_compare_translation_is_true() {
        let mat1 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mat2 = create_matrix(1.0, 0.0, 0.0, 1.0, 100.0, 0.0);
        assert!(!equals_matrix(Some(&mat1), Some(&mat2), true));
    }

    #[test]
    fn returns_true_for_same_reference() {
        let mat = create_matrix(5.0, 10.0, 15.0, 20.0, 25.0, 30.0);
        assert!(equals_matrix(Some(&mat), Some(&mat), true));
    }
}

mod initialize_matrix {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_matrix() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        initialize_matrix(&mut m, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        assert_eq!(m.a, 2.0);
        assert_eq!(m.b, 3.0);
        assert_eq!(m.c, 4.0);
        assert_eq!(m.d, 5.0);
        assert_eq!(m.tx, 6.0);
        assert_eq!(m.ty, 7.0);
    }
}

mod inverse_matrix {
    use super::*;

    #[test]
    fn should_invert_the_matrix_correctly() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 5.0, 3.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        inverse_matrix(&mut out, &m);
        assert_approx(out.a, 0.5);
        assert_approx(out.b, 0.0);
        assert_approx(out.c, 0.0);
        assert_approx(out.d, 0.5);
        assert_approx(out.tx, -2.5);
        assert_approx(out.ty, -1.5);
    }

    #[test]
    fn should_not_depend_on_initial_out_matrix_values() {
        let source = create_matrix(2.0, 1.0, 3.0, 4.0, 5.0, 6.0);
        let mut out = create_matrix(9.0, 9.0, 9.0, 9.0, 9.0, 9.0);
        inverse_matrix(&mut out, &source);
        let mut result = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut result, &source, &out);
        assert_approx(result.a, 1.0);
        assert_approx(result.b, 0.0);
        assert_approx(result.c, 0.0);
        assert_approx(result.d, 1.0);
        assert_approx(result.tx, 0.0);
        assert_approx(result.ty, 0.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix(2.0, 1.0, 3.0, 4.0, 5.0, 6.0);
        let mut expected = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        inverse_matrix(&mut expected, &matrix);
        let matrix_copy = clone_matrix(&matrix);
        inverse_matrix(&mut matrix, &matrix_copy);
        assert!(equals_matrix(Some(&matrix), Some(&expected), true));
    }

    #[test]
    fn returns_true_on_success() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 5.0, 3.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(inverse_matrix(&mut out, &m));
    }

    #[test]
    fn returns_false_and_writes_a_degenerate_fill_for_a_singular_matrix() {
        let m = create_matrix(0.0, 0.0, 0.0, 0.0, 5.0, 3.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!inverse_matrix(&mut out, &m));
        assert_eq!(out.a, 0.0);
        assert_eq!(out.b, 0.0);
        assert_eq!(out.c, 0.0);
        assert_eq!(out.d, 0.0);
        assert_eq!(out.tx, -5.0);
        assert_eq!(out.ty, -3.0);
    }

    #[test]
    fn returns_false_for_a_singular_matrix_with_out_equals_source() {
        let mut m = create_matrix(0.0, 0.0, 0.0, 0.0, 5.0, 3.0);
        let m_copy = clone_matrix(&m);
        assert!(!inverse_matrix(&mut m, &m_copy));
        assert_eq!(m.a, 0.0);
        assert_eq!(m.tx, -5.0);
        assert_eq!(m.ty, -3.0);
    }
}

mod inverse_matrix_transform_point {
    use super::*;

    #[test]
    fn should_apply_inverse_transformation_to_a_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = create_vector2(2.0, 2.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_point(&mut out, &m, &p);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn should_not_modify_original_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = create_vector2(2.0, 2.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_point(&mut out, &m, &p);
        assert_eq!(p.x, 2.0);
        assert_eq!(p.y, 2.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let mut p = create_vector2(2.0, 4.0);
        let p_copy = clone_vector2(&p);
        inverse_matrix_transform_point(&mut p, &m, &p_copy);
        assert_eq!(p.x, 1.0);
        assert_eq!(p.y, 2.0);
    }
}

mod inverse_matrix_transform_point_xy {
    use super::*;

    #[test]
    fn should_apply_inverse_transformation_to_a_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_point_xy(&mut out, &m, 2.0, 2.0);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn should_handle_singular_matrices() {
        let m = create_matrix(1.0, 2.0, 2.0, 4.0, 10.0, 20.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_point_xy(&mut out, &m, 5.0, 5.0);
        assert_eq!(out.x, -10.0);
        assert_eq!(out.y, -20.0);
    }
}

mod inverse_matrix_transform_vector {
    use super::*;

    #[test]
    fn should_apply_inverse_transformation_to_a_vector() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = create_vector2(2.0, 2.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_vector(&mut out, &m, &p);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn should_not_modify_original_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = create_vector2(2.0, 2.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_vector(&mut out, &m, &p);
        assert_eq!(p.x, 2.0);
        assert_eq!(p.y, 2.0);
    }

    #[test]
    fn supports_out_equals_vector() {
        let m = create_matrix(2.0, 0.0, 0.0, 4.0, 10.0, 20.0);
        let mut p = create_vector2(2.0, 8.0);
        let p_copy = clone_vector2(&p);
        inverse_matrix_transform_vector(&mut p, &m, &p_copy);
        assert_eq!(p.x, 1.0);
        assert_eq!(p.y, 2.0);
    }
}

mod inverse_matrix_transform_vector_xy {
    use super::*;

    #[test]
    fn should_apply_inverse_transformation_to_a_vector() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_vector_xy(&mut out, &m, 2.0, 2.0);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn should_handle_singular_matrices() {
        let m = create_matrix(1.0, 2.0, 2.0, 4.0, 10.0, 20.0);
        let mut out = create_vector2(0.0, 0.0);
        inverse_matrix_transform_vector_xy(&mut out, &m, 5.0, 5.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod matrix_transform_bounds {
    use super::*;

    #[test]
    fn maps_coincident_corners_to_a_zero_size_rectangle_at_the_matrix_translation() {
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        matrix_transform_bounds(
            &mut out,
            &create_matrix(2.0, 0.0, 0.0, 3.0, 7.0, 11.0),
            5.0,
            5.0,
            5.0,
            5.0,
        );
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 11.0);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn should_work_when_ax_greater_than_bx_or_ay_greater_than_by() {
        let m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(&mut out, &m, 10.0, 10.0, 0.0, 0.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 10.0);
        assert_eq!(out.height, 10.0);
    }

    #[test]
    fn should_handle_negative_scaling() {
        let m = create_matrix(-1.0, 0.0, 0.0, -1.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(&mut out, &m, 0.0, 0.0, 10.0, 10.0);
        assert_eq!(out.width, 10.0);
        assert_eq!(out.height, 10.0);
    }

    #[test]
    fn should_handle_rotation() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let m_copy = clone_matrix(&m);
        rotate_matrix(&mut m, &m_copy, PI / 2.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(&mut out, &m, 0.0, 0.0, 10.0, 20.0);
        assert_approx(out.width, 20.0);
        assert_approx(out.height, 10.0);
    }

    #[test]
    fn tracks_the_fourth_corner_as_a_new_minimum_after_positive_skew() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(
            &mut out,
            &create_matrix(1.0, 1.0, 1.0, 1.0, 0.0, 0.0),
            0.0,
            1.0,
            1.0,
            0.0,
        );
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 2.0);
        assert_eq!(out.height, 2.0);
    }

    #[test]
    fn tracks_the_second_and_fourth_corners_after_a_reflected_skew() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(
            &mut out,
            &create_matrix(-1.0, -1.0, 1.0, 1.0, 0.0, 0.0),
            0.0,
            0.0,
            1.0,
            1.0,
        );
        assert_eq!(out.x, -1.0);
        assert_eq!(out.y, -1.0);
        assert_eq!(out.width, 2.0);
        assert_eq!(out.height, 2.0);
    }

    #[test]
    fn should_handle_flipped_input_coordinates() {
        let rect = create_rectangle(10.0, 20.0, -10.0, -20.0);
        let mat = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(
            &mut out,
            &mat,
            rect.x,
            rect.y,
            get_rectangle_right(&rect),
            get_rectangle_bottom(&rect),
        );
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.width, 10.0);
        assert_approx(out.height, 20.0);
    }

    #[test]
    fn should_handle_negative_scaling_mirroring() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mat = create_matrix(-1.0, 0.0, 0.0, -1.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(
            &mut out,
            &mat,
            rect.x,
            rect.y,
            get_rectangle_right(&rect),
            get_rectangle_bottom(&rect),
        );
        assert_approx(out.width, 10.0);
        assert_approx(out.height, 20.0);
    }
}

mod matrix_transform_bounds_vector2 {
    use super::*;

    #[test]
    fn should_alias_transform_bounds() {
        let m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let a = create_vector2(10.0, 10.0);
        let b = create_vector2(0.0, 0.0);
        matrix_transform_bounds_vector2(&mut out, &m, &a, &b);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 10.0);
        assert_eq!(out.height, 10.0);
    }
}

mod matrix_transform_point {
    use super::*;

    #[test]
    fn should_transform_a_point_using_the_matrix() {
        let m = create_matrix(1.0, 0.0, 0.0, 1.0, 10.0, 20.0);
        let p = create_vector2(1.0, 1.0);
        let mut out = create_vector2(0.0, 0.0);
        matrix_transform_point(&mut out, &m, &p);
        assert_eq!(out.x, 11.0);
        assert_eq!(out.y, 21.0);
    }

    #[test]
    fn should_not_modify_input_point() {
        let m = create_matrix(1.0, 0.0, 0.0, 1.0, 10.0, 20.0);
        let p = create_vector2(1.0, 1.0);
        let mut out = create_vector2(0.0, 0.0);
        matrix_transform_point(&mut out, &m, &p);
        assert_eq!(p.x, 1.0);
        assert_eq!(p.y, 1.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 3.0, 10.0, 20.0);
        let mut p = create_vector2(1.0, 2.0);
        let p_copy = clone_vector2(&p);
        matrix_transform_point(&mut p, &m, &p_copy);
        assert_eq!(p.x, 12.0);
        assert_eq!(p.y, 26.0);
    }
}

mod matrix_transform_point_xy {
    use super::*;

    #[test]
    fn should_correctly_transform_coordinates_with_translation() {
        let m = create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 6.0);
        let mut p = create_vector2(0.0, 0.0);
        matrix_transform_point_xy(&mut p, &m, 1.0, 2.0);
        assert_eq!(p.x, 6.0);
        assert_eq!(p.y, 8.0);
    }

    #[test]
    fn should_handle_rotation_correctly() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let m_copy = clone_matrix(&m);
        rotate_matrix(&mut m, &m_copy, PI / 2.0);
        let mut p = create_vector2(0.0, 0.0);
        matrix_transform_point_xy(&mut p, &m, 1.0, 0.0);
        assert_approx(p.x, 0.0);
        assert_approx(p.y, 1.0);
    }
}

mod matrix_transform_rectangle {
    use super::*;

    #[test]
    fn should_return_the_same_rectangle_for_identity_matrix() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mat = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &mat, &rect);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.width, 10.0);
        assert_approx(out.height, 20.0);
    }

    #[test]
    fn should_apply_translation_correctly() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mat = create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 7.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &mat, &rect);
        assert_approx(out.x, 5.0);
        assert_approx(out.y, 7.0);
        assert_approx(out.width, 10.0);
        assert_approx(out.height, 20.0);
    }

    #[test]
    fn should_apply_uniform_scaling_correctly() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mat = create_matrix(2.0, 0.0, 0.0, 3.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &mat, &rect);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.width, 20.0);
        assert_approx(out.height, 60.0);
    }

    #[test]
    fn should_handle_rotation_correctly() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let angle = PI / 2.0;
        let mat = create_matrix(
            angle.cos(),
            angle.sin(),
            -angle.sin(),
            angle.cos(),
            0.0,
            0.0,
        );
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &mat, &rect);
        assert_approx(out.width, 20.0);
        assert_approx(out.height, 10.0);
    }

    #[test]
    fn should_handle_skew_correctly() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let mat = create_matrix(1.0, 0.5, 1.0, 1.0, 0.0, 0.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &mat, &rect);
        assert_approx(out.width, 20.0);
        assert_approx(out.height, 15.0);
    }

    #[test]
    fn should_not_modify_input_object() {
        let rect = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let mat = create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 7.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &mat, &rect);
        assert_approx(rect.x, 0.0);
        assert_approx(rect.y, 0.0);
        assert_approx(rect.width, 10.0);
        assert_approx(rect.height, 10.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut rect = create_rectangle(0.0, 0.0, 10.0, 20.0);
        let mat = create_matrix(2.0, 0.0, 0.0, 3.0, 5.0, 7.0);
        let rect_copy = clone_rectangle(&rect);
        matrix_transform_rectangle(&mut rect, &mat, &rect_copy);
        assert_approx(rect.x, 5.0);
        assert_approx(rect.y, 7.0);
        assert_approx(rect.width, 20.0);
        assert_approx(rect.height, 60.0);
    }
}

mod matrix_transform_vector {
    use super::*;

    #[test]
    fn should_apply_delta_transformation_to_a_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = create_vector2(1.0, 1.0);
        let mut out = create_vector2(0.0, 0.0);
        matrix_transform_vector(&mut out, &m, &p);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn should_not_modify_input_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = create_vector2(1.0, 1.0);
        let mut out = create_vector2(0.0, 0.0);
        matrix_transform_vector(&mut out, &m, &p);
        assert_eq!(p.x, 1.0);
        assert_eq!(p.y, 1.0);
    }

    #[test]
    fn supports_out_equals_vector() {
        let m = create_matrix(2.0, 0.0, 0.0, 3.0, 10.0, 20.0);
        let mut p = create_vector2(1.0, 2.0);
        let p_copy = clone_vector2(&p);
        matrix_transform_vector(&mut p, &m, &p_copy);
        assert_eq!(p.x, 2.0);
        assert_eq!(p.y, 6.0);
    }
}

mod matrix_transform_vector_xy {
    use super::*;

    #[test]
    fn should_apply_delta_transformation_to_a_point() {
        let m = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        matrix_transform_vector_xy(&mut out, &m, 1.0, 1.0);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 2.0);
    }
}

mod multiply_matrix {
    use super::*;

    #[test]
    fn should_support_out_equals_a() {
        let mut a = create_matrix(2.0, 0.0, 0.0, 2.0, 1.0, 1.0);
        let b = create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 6.0);
        let a_copy = clone_matrix(&a);
        multiply_matrix(&mut a, &a_copy, &b);
        assert_eq!(a.tx, 2.0 * 5.0 + 1.0);
        assert_eq!(a.ty, 2.0 * 6.0 + 1.0);
    }

    #[test]
    fn should_support_out_equals_b() {
        let a = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let mut b = create_matrix(1.0, 0.0, 0.0, 1.0, 3.0, 4.0);
        let b_copy = clone_matrix(&b);
        multiply_matrix(&mut b, &a, &b_copy);
        assert_eq!(b.a, 2.0);
        assert_eq!(b.d, 2.0);
        assert_eq!(b.tx, 6.0);
        assert_eq!(b.ty, 8.0);
    }

    #[test]
    fn should_multiply_identity_correctly() {
        let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let m = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut out, &identity, &m);
        assert!(equals_matrix(Some(&out), Some(&m), true));
        multiply_matrix(&mut out, &m, &identity);
        assert!(equals_matrix(Some(&out), Some(&m), true));
    }

    #[test]
    fn should_handle_negative_scale_factors() {
        let m1 = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let m2 = create_matrix(-1.0, 0.0, 0.0, -1.0, 0.0, 0.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut out, &m1, &m2);
        assert_eq!(out.a, -2.0);
        assert_eq!(out.b, 0.0);
        assert_eq!(out.c, 0.0);
        assert_eq!(out.d, -2.0);
        assert_eq!(out.tx, 0.0);
        assert_eq!(out.ty, 0.0);
    }

    #[test]
    fn should_handle_rotation_multiplication() {
        let angle = PI / 4.0;
        let r = create_matrix(
            angle.cos(),
            angle.sin(),
            -angle.sin(),
            angle.cos(),
            0.0,
            0.0,
        );
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut out, &r, &r);
        assert_approx(out.a, 0.0);
        assert_approx(out.b, 1.0);
        assert_approx(out.c, -1.0);
        assert_approx(out.d, 0.0);
    }

    #[test]
    fn should_handle_non_uniform_scaling() {
        let scale_y = create_matrix(1.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let scale_x = create_matrix(2.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut out, &scale_y, &scale_x);
        assert_eq!(out.a, 2.0);
        assert_eq!(out.b, 0.0);
        assert_eq!(out.c, 0.0);
        assert_eq!(out.d, 2.0);
    }

    #[test]
    fn should_handle_translation_correctly() {
        let a = create_matrix(2.0, 0.0, 0.0, 2.0, 1.0, 1.0);
        let b = create_matrix(1.0, 0.0, 0.0, 1.0, 3.0, 4.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut out, &a, &b);
        assert_eq!(out.tx, 2.0 * 3.0 + 1.0);
        assert_eq!(out.ty, 2.0 * 4.0 + 1.0);
    }

    #[test]
    fn should_handle_negative_values_consistently() {
        let a = create_matrix(-1.0, 0.0, 0.0, -1.0, 0.0, 0.0);
        let b = create_matrix(1.0, 0.0, 0.0, 1.0, -2.0, -3.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut out, &a, &b);
        assert_eq!(out.tx, 2.0);
        assert_eq!(out.ty, 3.0);
    }
}

mod rotate_matrix {
    use super::*;

    #[test]
    fn should_write_rotated_result_to_out_without_modifying_source() {
        let src = create_matrix(1.0, 0.0, 0.0, 1.0, 10.0, 0.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        rotate_matrix(&mut out, &src, PI / 2.0);
        assert_eq!(src.tx, 10.0);
        assert_approx(out.tx, 0.0);
    }

    #[test]
    fn should_support_out_equals_source() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let m_copy = clone_matrix(&m);
        rotate_matrix(&mut m, &m_copy, PI);
        assert_approx(m.a, -1.0);
        assert_approx(m.d, -1.0);
    }
}

mod scale_matrix {
    use super::*;

    #[test]
    fn should_write_scaled_result_to_out_without_modifying_source() {
        let src = create_matrix(2.0, 0.0, 0.0, 2.0, 5.0, 6.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        scale_matrix(&mut out, &src, 2.0, 3.0);
        assert_eq!(src.a, 2.0);
        assert_eq!(out.a, 4.0);
        assert_eq!(out.d, 6.0);
    }

    #[test]
    fn should_support_out_equals_source() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let m_copy = clone_matrix(&m);
        scale_matrix(&mut m, &m_copy, 2.0, 3.0);
        assert_eq!(m.a, 2.0);
        assert_eq!(m.d, 3.0);
        assert_eq!(m.tx, 2.0);
        assert_eq!(m.ty, 3.0);
    }
}

mod set_gradient_transform_matrix {
    use super::*;

    #[test]
    fn sets_a_and_d_proportional_to_width_and_height() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_gradient_transform_matrix(&mut m, 1638.4, 1638.4, 0.0, 0.0, 0.0);
        assert_approx(m.a, 1.0);
        assert_approx(m.d, 1.0);
    }

    #[test]
    fn sets_tx_to_tx_plus_width_over_2_and_ty_to_ty_plus_height_over_2() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_gradient_transform_matrix(&mut m, 200.0, 400.0, 0.0, 0.0, 0.0);
        assert_approx(m.tx, 100.0);
        assert_approx(m.ty, 200.0);
    }

    #[test]
    fn applies_rotation_to_the_linear_part() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_gradient_transform_matrix(&mut m, 1638.4, 1638.4, PI / 2.0, 0.0, 0.0);
        assert_approx(m.b, 1.0);
        assert_approx(m.c, -1.0);
    }
}

mod set_matrix {
    use super::*;

    #[test]
    fn should_assign_all_matrix_fields() {
        let mut m = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix(&mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!(m.a, 1.0);
        assert_eq!(m.b, 2.0);
        assert_eq!(m.c, 3.0);
        assert_eq!(m.d, 4.0);
        assert_eq!(m.tx, 5.0);
        assert_eq!(m.ty, 6.0);
    }
}

mod set_matrix_from_float32_array {
    use super::*;

    #[test]
    fn writes_the_matrix_from_6_values_at_the_offset() {
        let data: [f32; 6] = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
        let mut matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_float32_array(&mut matrix, 0, &data);
        assert_eq!(matrix.a, 0.0);
        assert_eq!(matrix.b, 1.0);
        assert_eq!(matrix.c, 2.0);
        assert_eq!(matrix.d, 3.0);
        assert_eq!(matrix.tx, 4.0);
        assert_eq!(matrix.ty, 5.0);
    }
}

mod set_matrix_from_matrix3 {
    use super::*;

    #[test]
    fn should_correctly_copy_values_from_matrix3_into_matrix() {
        let mat3 = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix3(&mut mat2d, &mat3);
        assert_eq!(mat2d.a, 1.0);
        assert_eq!(mat2d.b, 2.0);
        assert_eq!(mat2d.tx, 3.0);
        assert_eq!(mat2d.c, 4.0);
        assert_eq!(mat2d.d, 5.0);
        assert_eq!(mat2d.ty, 6.0);
    }

    #[test]
    fn should_not_affect_the_original_matrix3() {
        let mat3 = create_matrix3_from_values(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let original = mat3.m;
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix3(&mut mat2d, &mat3);
        assert_eq!(mat3.m, original);
    }

    #[test]
    fn should_work_with_matrices_where_all_values_are_zeros() {
        let zero_mat3 = create_matrix3_from_values(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix3(&mut mat2d, &zero_mat3);
        assert_eq!(mat2d.a, 0.0);
        assert_eq!(mat2d.b, 0.0);
        assert_eq!(mat2d.tx, 0.0);
        assert_eq!(mat2d.c, 0.0);
        assert_eq!(mat2d.d, 0.0);
        assert_eq!(mat2d.ty, 0.0);
    }

    #[test]
    fn should_handle_identity_matrix3() {
        let identity_mat3 = create_matrix3_from_values(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix3(&mut mat2d, &identity_mat3);
        assert_eq!(mat2d.a, 1.0);
        assert_eq!(mat2d.b, 0.0);
        assert_eq!(mat2d.tx, 0.0);
        assert_eq!(mat2d.c, 0.0);
        assert_eq!(mat2d.d, 1.0);
        assert_eq!(mat2d.ty, 0.0);
    }
}

mod set_matrix_from_matrix4 {
    use super::*;

    #[test]
    fn should_correctly_copy_the_2d_affine_part_from_a_column_major_matrix4() {
        let mat4 = create_matrix4_from_values(
            1.0, 4.0, 0.0, 0.0, 2.0, 5.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 3.0, 6.0, 0.0, 1.0,
        );
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix4(&mut mat2d, &mat4);
        assert_eq!(mat2d.a, 1.0);
        assert_eq!(mat2d.b, 2.0);
        assert_eq!(mat2d.tx, 3.0);
        assert_eq!(mat2d.c, 4.0);
        assert_eq!(mat2d.d, 5.0);
        assert_eq!(mat2d.ty, 6.0);
    }

    #[test]
    fn should_not_affect_the_original_matrix4() {
        let mat4 = create_matrix4_from_values(
            1.0, 4.0, 0.0, 0.0, 2.0, 5.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 3.0, 6.0, 0.0, 1.0,
        );
        let original = mat4.m;
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix4(&mut mat2d, &mat4);
        assert_eq!(mat4.m, original);
    }

    #[test]
    fn should_handle_matrices_with_zero_values_correctly() {
        let zero_mat4 = create_matrix4_from_values(
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix4(&mut mat2d, &zero_mat4);
        assert_eq!(mat2d.a, 0.0);
        assert_eq!(mat2d.b, 0.0);
        assert_eq!(mat2d.tx, 0.0);
        assert_eq!(mat2d.c, 0.0);
        assert_eq!(mat2d.d, 0.0);
        assert_eq!(mat2d.ty, 0.0);
    }

    #[test]
    fn should_correctly_handle_a_2d_identity_matrix_in_matrix4_format() {
        let identity_mat4 = create_matrix4_from_values(
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_matrix_from_matrix4(&mut mat2d, &identity_mat4);
        assert_eq!(mat2d.a, 1.0);
        assert_eq!(mat2d.b, 0.0);
        assert_eq!(mat2d.tx, 0.0);
        assert_eq!(mat2d.c, 0.0);
        assert_eq!(mat2d.d, 1.0);
        assert_eq!(mat2d.ty, 0.0);
    }
}

mod set_matrix_identity {
    use super::*;

    #[test]
    fn resets_a_modified_matrix_to_identity() {
        let mut m = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        set_matrix_identity(&mut m);
        assert_eq!(m.a, 1.0);
        assert_eq!(m.b, 0.0);
        assert_eq!(m.c, 0.0);
        assert_eq!(m.d, 1.0);
        assert_eq!(m.tx, 0.0);
        assert_eq!(m.ty, 0.0);
    }
}

mod set_transform_matrix {
    use super::*;

    #[test]
    fn builds_scale_and_translation_without_rotation() {
        let mut out = create_matrix(9.0, 9.0, 9.0, 9.0, 9.0, 9.0);
        set_transform_matrix(&mut out, 2.0, 4.0, 0.0, 10.0, 100.0);
        assert_eq!(out.a, 2.0);
        assert_eq!(out.b, 0.0);
        assert_eq!(out.c, 0.0);
        assert_eq!(out.d, 4.0);
        assert_eq!(out.tx, 10.0);
        assert_eq!(out.ty, 100.0);
    }

    #[test]
    fn should_apply_rotate_scale_and_translation() {
        let mut m1 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let m1_copy = clone_matrix(&m1);
        rotate_matrix(&mut m1, &m1_copy, 45.0);
        let m1_copy2 = clone_matrix(&m1);
        scale_matrix(&mut m1, &m1_copy2, 2.0, 4.0);
        let m1_copy3 = clone_matrix(&m1);
        translate_matrix(&mut m1, &m1_copy3, 10.0, 100.0);
        let mut m2 = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_transform_matrix(&mut m2, 2.0, 4.0, 45.0, 10.0, 100.0);
        assert!(equals_matrix(Some(&m1), Some(&m2), true));
    }
}

mod translate_matrix {
    use super::*;

    #[test]
    fn writes_every_component_to_a_distinct_output() {
        let source = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        translate_matrix(&mut out, &source, 10.0, 20.0);
        assert_eq!(out.a, 2.0);
        assert_eq!(out.b, 3.0);
        assert_eq!(out.c, 4.0);
        assert_eq!(out.d, 5.0);
        assert_eq!(out.tx, 16.0);
        assert_eq!(out.ty, 27.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let matrix_copy = clone_matrix(&matrix);
        translate_matrix(&mut matrix, &matrix_copy, 10.0, 20.0);
        assert_eq!(matrix.a, 2.0);
        assert_eq!(matrix.b, 3.0);
        assert_eq!(matrix.c, 4.0);
        assert_eq!(matrix.d, 5.0);
        assert_eq!(matrix.tx, 16.0);
        assert_eq!(matrix.ty, 27.0);
    }
}

mod translate_matrix_by_vector {
    use super::*;

    #[test]
    fn writes_every_component_to_a_distinct_output() {
        let matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let v = create_vector2(3.0, 4.0);
        translate_matrix_by_vector(&mut out, &matrix, &v);
        assert_eq!(out.a, 2.0);
        assert_eq!(out.b, 3.0);
        assert_eq!(out.c, 4.0);
        assert_eq!(out.d, 5.0);
        assert_eq!(out.tx, 28.0);
        assert_eq!(out.ty, 36.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let matrix_copy = clone_matrix(&matrix);
        let v = create_vector2(3.0, 4.0);
        translate_matrix_by_vector(&mut matrix, &matrix_copy, &v);
        assert_eq!(matrix.a, 2.0);
        assert_eq!(matrix.b, 3.0);
        assert_eq!(matrix.c, 4.0);
        assert_eq!(matrix.d, 5.0);
        assert_eq!(matrix.tx, 28.0);
        assert_eq!(matrix.ty, 36.0);
    }
}

mod translate_matrix_by_vector_xy {
    use super::*;

    #[test]
    fn writes_every_component_to_a_distinct_output() {
        let matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        translate_matrix_by_vector_xy(&mut out, &matrix, 3.0, 4.0);
        assert_eq!(out.a, 2.0);
        assert_eq!(out.b, 3.0);
        assert_eq!(out.c, 4.0);
        assert_eq!(out.d, 5.0);
        assert_eq!(out.tx, 28.0);
        assert_eq!(out.ty, 36.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        let matrix_copy = clone_matrix(&matrix);
        translate_matrix_by_vector_xy(&mut matrix, &matrix_copy, 3.0, 4.0);
        assert_eq!(matrix.a, 2.0);
        assert_eq!(matrix.b, 3.0);
        assert_eq!(matrix.c, 4.0);
        assert_eq!(matrix.d, 5.0);
        assert_eq!(matrix.tx, 28.0);
        assert_eq!(matrix.ty, 36.0);
    }
}

mod write_matrix_to_float32_array {
    use super::*;

    #[test]
    fn writes_6_values_at_the_offset() {
        let mut data = [0.0_f32; 6];
        let matrix = create_matrix(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        write_matrix_to_float32_array(&mut data, 0, &matrix);
        assert_eq!(data[0], 1.0);
        assert_eq!(data[1], 2.0);
        assert_eq!(data[2], 3.0);
        assert_eq!(data[3], 4.0);
        assert_eq!(data[4], 5.0);
        assert_eq!(data[5], 6.0);
    }
}
