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

fn assert_matrix4_close(actual: &Matrix4, expected: &Matrix4) {
    for i in 0..16 {
        let diff = (actual.m[i] - expected.m[i]).abs();
        assert!(
            diff < 1e-4,
            "element {i}: expected {}, got {} (diff: {diff})",
            expected.m[i],
            actual.m[i]
        );
    }
}

fn discriminating_matrix4() -> Matrix4 {
    let mut m = create_matrix4();
    set_matrix4(
        &mut m, 0.0, 2.0, 0.0, 0.0, -3.0, 0.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 7.0, 8.0, 9.0, 1.0,
    );
    return m;
}

fn z_axis_v4() -> Vector4 {
    return create_vector4(0.0, 0.0, 1.0, 0.0);
}

fn x_axis_v4() -> Vector4 {
    return create_vector4(1.0, 0.0, 0.0, 0.0);
}

fn y_axis_v4() -> Vector4 {
    return create_vector4(0.0, 1.0, 0.0, 0.0);
}

mod append_matrix4 {
    use super::*;

    #[test]
    fn composes_other_after_source_out_equals_other_times_source() {
        let source = discriminating_matrix4();
        let mut other = create_matrix4();
        set_matrix4(
            &mut other, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 0.0, 0.0,
            1.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &other, &source);

        let mut out = create_matrix4();
        append_matrix4(&mut out, &source, &other);

        assert_eq!(out.m, expected.m);
    }

    #[test]
    fn is_not_the_other_operand_order() {
        let source = discriminating_matrix4();
        let mut other = create_matrix4();
        set_matrix4(
            &mut other, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 0.0, 0.0,
            1.0,
        );
        let mut transposed_order = create_matrix4();
        multiply_matrix4(&mut transposed_order, &source, &other);

        let mut out = create_matrix4();
        append_matrix4(&mut out, &source, &other);

        assert_ne!(out.m, transposed_order.m);
    }

    #[test]
    fn supports_out_equals_source() {
        let source = discriminating_matrix4();
        let mut other = create_matrix4();
        scale_matrix4(&mut other, &create_matrix4(), 2.0, 3.0, 4.0);
        let mut expected = create_matrix4();
        append_matrix4(&mut expected, &source, &other);

        let mut source_mut = clone_matrix4(&source);
        let source_copy = clone_matrix4(&source_mut);
        append_matrix4(&mut source_mut, &source_copy, &other);

        assert_eq!(source_mut.m, expected.m);
    }
}

mod append_rotation_matrix4 {
    use super::*;

    #[test]
    fn rotates_identity_around_z_axis_by_90_degrees() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        append_rotation_matrix4(&mut m, &m_copy, PI / 2.0, &z_axis_v4(), None);

        assert_approx(m.m[0], 0.0);
        assert_approx(m.m[1], 1.0);
        assert_approx(m.m[4], -1.0);
        assert_approx(m.m[5], 0.0);
    }

    #[test]
    fn sweeps_the_existing_translation_around_the_origin() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 10.0, 0.0, 0.0);

        let m_copy2 = clone_matrix4(&m);
        append_rotation_matrix4(&mut m, &m_copy2, PI / 2.0, &z_axis_v4(), None);

        assert_approx_tight(m.m[12], 0.0);
        assert_approx_tight(m.m[13], 10.0);
    }

    #[test]
    fn applies_the_rotation_after_source_out_equals_r_times_source() {
        let source = discriminating_matrix4();
        let mut rotation = create_matrix4();
        let rot_copy = clone_matrix4(&rotation);
        append_rotation_matrix4(&mut rotation, &rot_copy, PI / 3.0, &z_axis_v4(), None);
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &rotation, &source);

        let mut out = create_matrix4();
        append_rotation_matrix4(&mut out, &source, PI / 3.0, &z_axis_v4(), None);

        for i in 0..16 {
            assert_approx(out.m[i], expected.m[i]);
        }
    }

    #[test]
    fn holds_the_pivot_point_fixed() {
        let mut source = create_matrix4();
        let source_copy = clone_matrix4(&source);
        translate_matrix4(&mut source, &source_copy, 10.0, 0.0, 0.0);
        let pivot = create_vector4(5.0, 0.0, 0.0, 1.0);

        let mut out = create_matrix4();
        append_rotation_matrix4(&mut out, &source, PI / 2.0, &z_axis_v4(), Some(&pivot));

        let lands_on_pivot = create_vector3(-5.0, 0.0, 0.0);
        let mut before = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut before, &source, &lands_on_pivot);
        assert_approx_tight(before.x, pivot.x);

        let mut after = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut after, &out, &lands_on_pivot);
        assert_approx_tight(after.x, pivot.x);
        assert_approx_tight(after.y, pivot.y);
        assert_approx_tight(after.z, pivot.z);
    }

    #[test]
    fn differs_from_the_local_prepend_rotation_matrix4_on_a_translated_matrix() {
        let source = discriminating_matrix4();
        let mut world = create_matrix4();
        let mut local = create_matrix4();

        append_rotation_matrix4(&mut world, &source, PI / 3.0, &z_axis_v4(), None);
        prepend_rotation_matrix4(&mut local, &source, PI / 3.0, &z_axis_v4(), None);

        assert_ne!(world.m, local.m);
    }

    #[test]
    fn writes_the_same_values_whether_out_aliases_source_or_not() {
        let source = discriminating_matrix4();
        let mut distinct = create_matrix4();
        let mut aliased = clone_matrix4(&source);
        let pivot = create_vector4(1.0, 2.0, 3.0, 1.0);

        append_rotation_matrix4(&mut distinct, &source, PI / 3.0, &z_axis_v4(), Some(&pivot));
        let aliased_copy = clone_matrix4(&aliased);
        append_rotation_matrix4(
            &mut aliased,
            &aliased_copy,
            PI / 3.0,
            &z_axis_v4(),
            Some(&pivot),
        );

        assert_eq!(aliased.m, distinct.m);
    }
}

mod append_scale_matrix4 {
    use super::*;

    #[test]
    fn applies_the_scale_after_source_out_equals_s_times_source() {
        let source = discriminating_matrix4();
        let scale = create_matrix4_from_values(
            2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &scale, &source);

        let mut out = create_matrix4();
        append_scale_matrix4(&mut out, &source, 2.0, 3.0, 4.0);

        assert_eq!(out.m, expected.m);
    }

    #[test]
    fn scales_the_translation_unlike_the_local_scale_matrix4() {
        let source = discriminating_matrix4();
        let mut world = create_matrix4();
        let mut local = create_matrix4();

        append_scale_matrix4(&mut world, &source, 2.0, 3.0, 4.0);
        scale_matrix4(&mut local, &source, 2.0, 3.0, 4.0);

        assert_eq!(world.m[12], source.m[12] * 2.0);
        assert_eq!(local.m[12], source.m[12]);
        assert_ne!(world.m, local.m);
    }

    #[test]
    fn supports_out_equals_source() {
        let source = discriminating_matrix4();
        let mut expected = create_matrix4();
        append_scale_matrix4(&mut expected, &source, 2.0, 3.0, 4.0);

        let mut source_mut = clone_matrix4(&source);
        let source_copy = clone_matrix4(&source_mut);
        append_scale_matrix4(&mut source_mut, &source_copy, 2.0, 3.0, 4.0);

        assert_eq!(source_mut.m, expected.m);
    }
}

mod append_translation_matrix4 {
    use super::*;

    #[test]
    fn adds_the_offset_to_the_translation_and_leaves_the_basis_alone() {
        let source = discriminating_matrix4();
        let mut out = create_matrix4();

        append_translation_matrix4(&mut out, &source, 1.0, 2.0, 3.0);

        assert_eq!(out.m[12], source.m[12] + 1.0);
        assert_eq!(out.m[13], source.m[13] + 2.0);
        assert_eq!(out.m[14], source.m[14] + 3.0);
        assert_eq!(out.m[..12], source.m[..12]);
    }

    #[test]
    fn equals_composing_a_translation_matrix_after_source() {
        let source = discriminating_matrix4();
        let translation = create_matrix4_from_values(
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 2.0, 3.0, 1.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &translation, &source);

        let mut out = create_matrix4();
        append_translation_matrix4(&mut out, &source, 1.0, 2.0, 3.0);

        assert_eq!(out.m, expected.m);
    }

    #[test]
    fn differs_from_the_local_prepend_translation_matrix4_on_a_rotated_matrix() {
        let source = discriminating_matrix4();
        let mut world = create_matrix4();
        let mut local = create_matrix4();

        append_translation_matrix4(&mut world, &source, 1.0, 2.0, 3.0);
        prepend_translation_matrix4(&mut local, &source, 1.0, 2.0, 3.0);

        assert_ne!(world.m, local.m);
    }

    #[test]
    fn copies_the_whole_source_matrix_when_out_is_a_distinct_object() {
        let source = discriminating_matrix4();
        let before: [f32; 16] = source.m;
        let mut out = create_matrix4_from_values(
            9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0,
        );
        let mut aliased = clone_matrix4(&source);

        append_translation_matrix4(&mut out, &source, 1.0, 2.0, 3.0);
        let aliased_copy = clone_matrix4(&aliased);
        append_translation_matrix4(&mut aliased, &aliased_copy, 1.0, 2.0, 3.0);

        assert_eq!(out.m, aliased.m);
        assert_eq!(source.m, before);
    }
}

mod clone_matrix4 {
    use super::*;

    #[test]
    fn copies_all_values_from_the_source_matrix() {
        let source = create_matrix4_from_values(
            2.0, 3.0, 5.0, 7.0, 11.0, 13.0, 17.0, 19.0, 23.0, 29.0, 31.0, 37.0, 41.0, 43.0, 47.0,
            53.0,
        );

        let cloned = clone_matrix4(&source);

        assert_eq!(cloned.m, source.m);
    }
}

mod compose_matrix4 {
    use super::*;

    #[test]
    fn composes_translation_identity_rotation_and_scale() {
        let mut out = create_matrix4();
        compose_matrix4(
            &mut out,
            &create_vector3(10.0, 20.0, 30.0),
            &create_quaternion(0.0, 0.0, 0.0, 1.0),
            &create_vector3(2.0, 3.0, 4.0),
        );

        assert_approx_tight(out.m[0], 2.0);
        assert_approx_tight(out.m[5], 3.0);
        assert_approx_tight(out.m[10], 4.0);
        assert_approx_tight(out.m[12], 10.0);
        assert_approx_tight(out.m[13], 20.0);
        assert_approx_tight(out.m[14], 30.0);
        assert_approx_tight(out.m[15], 1.0);
    }

    #[test]
    fn round_trips_with_decompose_matrix4() {
        let position = create_vector3(1.0, -2.0, 3.0);
        let mut rotation = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut rotation, &create_vector3(0.0, 1.0, 0.0), PI / 5.0);
        let scale = create_vector3(2.0, 2.0, 2.0);

        let mut m = create_matrix4();
        compose_matrix4(&mut m, &position, &rotation, &scale);

        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &m);

        assert_approx(p.x, 1.0);
        assert_approx(p.y, -2.0);
        assert_approx(p.z, 3.0);
        assert_approx(s.x, 2.0);
        assert_approx(s.y, 2.0);
        assert_approx(s.z, 2.0);
        let dot = r.x * rotation.x + r.y * rotation.y + r.z * rotation.z + r.w * rotation.w;
        assert_approx(dot.abs(), 1.0);
    }
}

mod copy_matrix4 {
    use super::*;

    #[test]
    fn copies_all_values_from_source_into_out() {
        let source = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );

        let mut out = create_matrix4();
        copy_matrix4(&mut out, &source);

        assert_eq!(out.m, source.m);
    }

    #[test]
    fn is_a_no_op_when_out_aliases_source() {
        let mut m = create_matrix4();
        set_matrix4(
            &mut m, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 7.0, 8.0, 9.0, 1.0,
        );
        let expected: [f32; 16] = m.m;

        let m_copy = clone_matrix4(&m);
        copy_matrix4(&mut m, &m_copy);

        assert_eq!(m.m, expected);
    }
}

mod copy_matrix4_column_from_vector4 {
    use super::*;

    #[test]
    fn copies_values_into_column_0() {
        let mut m = create_matrix4();
        let v = create_vector4(1.0, 2.0, 3.0, 4.0);

        copy_matrix4_column_from_vector4(&mut m, 0, &v);

        assert_eq!(m.m[0], 1.0);
        assert_eq!(m.m[1], 2.0);
        assert_eq!(m.m[2], 3.0);
        assert_eq!(m.m[3], 4.0);
    }

    #[test]
    fn copies_values_into_column_2() {
        let mut m = create_matrix4();
        let v = create_vector4(5.0, 6.0, 7.0, 8.0);

        copy_matrix4_column_from_vector4(&mut m, 2, &v);

        assert_eq!(m.m[8], 5.0);
        assert_eq!(m.m[9], 6.0);
        assert_eq!(m.m[10], 7.0);
        assert_eq!(m.m[11], 8.0);
    }

    #[test]
    #[should_panic]
    fn panics_for_an_invalid_column_index() {
        let mut m = create_matrix4();
        let v = create_vector4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_column_from_vector4(&mut m, 4, &v);
    }

    #[test]
    fn writes_column_c_into_elements_4c_through_4c_plus_3_for_every_column() {
        for column in 0..4 {
            let mut m = create_matrix4_from_values(
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            );

            copy_matrix4_column_from_vector4(&mut m, column, &create_vector4(1.0, 2.0, 3.0, 4.0));

            let mut expected = [0.0f32; 16];
            expected[column * 4] = 1.0;
            expected[column * 4 + 1] = 2.0;
            expected[column * 4 + 2] = 3.0;
            expected[column * 4 + 3] = 4.0;
            assert_eq!(m.m, expected);
        }
    }
}

mod copy_matrix4_column_to_vector4 {
    use super::*;

    #[test]
    fn copies_values_from_column_1_into_a_vector() {
        let m = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );

        let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_column_to_vector4(&mut out, 1, &m);

        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 6.0);
        assert_eq!(out.z, 7.0);
        assert_eq!(out.w, 8.0);
    }

    #[test]
    #[should_panic]
    fn panics_for_an_invalid_column_index() {
        let m = create_matrix4();
        let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_column_to_vector4(&mut out, 99, &m);
    }

    #[test]
    fn reads_column_c_from_elements_4c_through_4c_plus_3_for_every_column() {
        let m = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );

        for column in 0..4usize {
            let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
            copy_matrix4_column_to_vector4(&mut out, column, &m);

            assert_eq!(out.x, (column * 4 + 1) as f32);
            assert_eq!(out.y, (column * 4 + 2) as f32);
            assert_eq!(out.z, (column * 4 + 3) as f32);
            assert_eq!(out.w, (column * 4 + 4) as f32);
        }
    }
}

mod copy_matrix4_row_from_vector4 {
    use super::*;

    #[test]
    fn copies_values_into_row_0() {
        let mut m = create_matrix4();
        let v = create_vector4(1.0, 2.0, 3.0, 4.0);

        copy_matrix4_row_from_vector4(&mut m, 0, &v);

        assert_eq!(m.m[0], 1.0);
        assert_eq!(m.m[4], 2.0);
        assert_eq!(m.m[8], 3.0);
        assert_eq!(m.m[12], 4.0);
    }

    #[test]
    fn copies_values_into_row_3() {
        let mut m = create_matrix4();
        let v = create_vector4(9.0, 8.0, 7.0, 6.0);

        copy_matrix4_row_from_vector4(&mut m, 3, &v);

        assert_eq!(m.m[3], 9.0);
        assert_eq!(m.m[7], 8.0);
        assert_eq!(m.m[11], 7.0);
        assert_eq!(m.m[15], 6.0);
    }

    #[test]
    #[should_panic]
    fn panics_for_an_invalid_row_index() {
        let mut m = create_matrix4();
        let v = create_vector4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_row_from_vector4(&mut m, 4, &v);
    }

    #[test]
    fn writes_row_r_with_a_stride_of_four_for_every_row() {
        for row in 0..4usize {
            let mut m = create_matrix4_from_values(
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            );

            copy_matrix4_row_from_vector4(&mut m, row, &create_vector4(1.0, 2.0, 3.0, 4.0));

            let mut expected = [0.0f32; 16];
            expected[row] = 1.0;
            expected[row + 4] = 2.0;
            expected[row + 8] = 3.0;
            expected[row + 12] = 4.0;
            assert_eq!(m.m, expected);
        }
    }
}

mod copy_matrix4_row_to_vector4 {
    use super::*;

    #[test]
    fn copies_values_from_row_2_into_a_vector() {
        let m = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );

        let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_row_to_vector4(&mut out, 2, &m);

        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 7.0);
        assert_eq!(out.z, 11.0);
        assert_eq!(out.w, 15.0);
    }

    #[test]
    #[should_panic]
    fn panics_for_an_invalid_row_index() {
        let m = create_matrix4();
        let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_row_to_vector4(&mut out, 42, &m);
    }

    #[test]
    fn reads_row_r_with_a_stride_of_four_for_every_row() {
        let m = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );

        for row in 0..4usize {
            let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
            copy_matrix4_row_to_vector4(&mut out, row, &m);

            assert_eq!(out.x, (row + 1) as f32);
            assert_eq!(out.y, (row + 5) as f32);
            assert_eq!(out.z, (row + 9) as f32);
            assert_eq!(out.w, (row + 13) as f32);
        }
    }
}

mod create_matrix4 {
    use super::*;

    #[test]
    fn creates_an_identity_matrix_when_called_with_no_arguments() {
        let m = create_matrix4();

        assert_eq!(
            m.m,
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn maps_constructor_arguments_to_correct_column_major_indices() {
        let m = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );

        assert_eq!(
            m.m,
            [
                1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
                16.0
            ]
        );
    }
}

mod create_matrix4_from_2d {
    use super::*;

    #[test]
    fn initializes_the_matrix_using_set_2d_semantics() {
        let m = create_matrix4_from_2d(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);

        assert_eq!(
            m.m,
            [
                1.0, 2.0, 0.0, 0.0, 3.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 6.0, 0.0, 1.0
            ]
        );
    }
}

mod create_orthographic_matrix4 {
    use super::*;

    #[test]
    fn returns_a_matrix4_equivalent_to_set_ortho() {
        let m1 = create_orthographic_matrix4(-1.0, 1.0, -1.0, 1.0, 0.1, 100.0);
        let mut m2 = create_matrix4();
        set_orthographic_matrix4(&mut m2, -1.0, 1.0, -1.0, 1.0, 0.1, 100.0);
        assert!(equals_matrix4(Some(&m1), Some(&m2)));
    }
}

mod create_perspective_matrix4 {
    use super::*;

    #[test]
    fn returns_a_matrix4_equivalent_to_set_perspective() {
        let m1 = create_perspective_matrix4(0.5, 1.6, 0.1, 1000.0);
        let mut m2 = create_matrix4();
        set_perspective_matrix4(&mut m2, 0.5, 1.6, 0.1, 1000.0);
        assert!(equals_matrix4(Some(&m1), Some(&m2)));
    }
}

mod decompose_matrix4 {
    use super::*;

    #[test]
    fn extracts_translation_rotation_and_scale_from_a_trs_matrix() {
        let mut m = create_matrix4();
        let mut rotation = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut rotation, &create_vector3(0.0, 0.0, 1.0), PI / 2.0);
        compose_matrix4(
            &mut m,
            &create_vector3(5.0, 6.0, 7.0),
            &rotation,
            &create_vector3(2.0, 3.0, 4.0),
        );

        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &m);

        assert_approx(p.x, 5.0);
        assert_approx(p.y, 6.0);
        assert_approx(p.z, 7.0);
        assert_approx(s.x, 2.0);
        assert_approx(s.y, 3.0);
        assert_approx(s.z, 4.0);
        let dot = r.x * rotation.x + r.y * rotation.y + r.z * rotation.z + r.w * rotation.w;
        assert_approx(dot.abs(), 1.0);
    }

    #[test]
    fn identity_matrix_decomposes_to_origin_identity_rotation_unit_scale() {
        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &create_matrix4());

        assert_approx_tight(p.x, 0.0);
        assert_approx_tight(p.y, 0.0);
        assert_approx_tight(p.z, 0.0);
        assert_approx_tight(s.x, 1.0);
        assert_approx_tight(s.y, 1.0);
        assert_approx_tight(s.z, 1.0);
        assert_approx_tight(r.w, 1.0);
    }

    #[test]
    fn round_trips_a_half_turn_about_x() {
        let axis = create_vector3(1.0, 0.0, 0.0);
        let mut rotation = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut rotation, &axis, PI);
        let mut original = create_matrix4();
        compose_matrix4(
            &mut original,
            &create_vector3(5.0, 6.0, 7.0),
            &rotation,
            &create_vector3(2.0, 3.0, 4.0),
        );

        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &original);
        let mut recomposed = create_matrix4();
        compose_matrix4(&mut recomposed, &p, &r, &s);

        for i in 0..16 {
            assert_approx(recomposed.m[i], original.m[i]);
        }
    }

    #[test]
    fn round_trips_a_half_turn_about_y() {
        let axis = create_vector3(0.0, 1.0, 0.0);
        let mut rotation = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut rotation, &axis, PI);
        let mut original = create_matrix4();
        compose_matrix4(
            &mut original,
            &create_vector3(5.0, 6.0, 7.0),
            &rotation,
            &create_vector3(2.0, 3.0, 4.0),
        );

        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &original);
        let mut recomposed = create_matrix4();
        compose_matrix4(&mut recomposed, &p, &r, &s);

        for i in 0..16 {
            assert_approx(recomposed.m[i], original.m[i]);
        }
    }

    #[test]
    fn round_trips_a_half_turn_about_z() {
        let axis = create_vector3(0.0, 0.0, 1.0);
        let mut rotation = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut rotation, &axis, PI);
        let mut original = create_matrix4();
        compose_matrix4(
            &mut original,
            &create_vector3(5.0, 6.0, 7.0),
            &rotation,
            &create_vector3(2.0, 3.0, 4.0),
        );

        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &original);
        let mut recomposed = create_matrix4();
        compose_matrix4(&mut recomposed, &p, &r, &s);

        for i in 0..16 {
            assert_approx(recomposed.m[i], original.m[i]);
        }
    }

    #[test]
    fn folds_a_mirrored_basis_into_a_negative_x_scale() {
        let mut original = create_matrix4();
        compose_matrix4(
            &mut original,
            &create_vector3(0.0, 0.0, 0.0),
            &create_quaternion(0.0, 0.0, 0.0, 1.0),
            &create_vector3(-2.0, 3.0, 4.0),
        );

        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &original);

        assert_approx(s.x, -2.0);
        assert_approx(s.y, 3.0);
        assert_approx(s.z, 4.0);
        let mut recomposed = create_matrix4();
        compose_matrix4(&mut recomposed, &p, &r, &s);
        for i in 0..16 {
            assert_approx(recomposed.m[i], original.m[i]);
        }
    }

    #[test]
    fn reports_a_collapsed_axis_as_zero_scale_without_producing_nan() {
        let mut original = create_matrix4();
        compose_matrix4(
            &mut original,
            &create_vector3(1.0, 2.0, 3.0),
            &create_quaternion(0.0, 0.0, 0.0, 1.0),
            &create_vector3(0.0, 0.0, 0.0),
        );

        let mut p = create_vector3(0.0, 0.0, 0.0);
        let mut r = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut s = create_vector3(0.0, 0.0, 0.0);
        decompose_matrix4(&mut p, &mut r, &mut s, &original);

        assert_eq!(s.x, 0.0);
        assert_eq!(s.y, 0.0);
        assert_eq!(s.z, 0.0);
        assert!(r.x.is_finite());
        assert!(r.y.is_finite());
        assert!(r.z.is_finite());
        assert!(r.w.is_finite());
        assert_eq!(p.x, 1.0);
    }
}

mod equals_matrix4 {
    use super::*;

    #[test]
    fn returns_true_when_comparing_the_same_reference() {
        let m = create_matrix4();
        assert!(equals_matrix4(Some(&m), Some(&m)));
    }

    #[test]
    fn returns_false_when_both_are_none() {
        assert!(!equals_matrix4(None, None));
    }

    #[test]
    fn returns_false_if_either_argument_is_none() {
        let m = create_matrix4();
        assert!(!equals_matrix4(Some(&m), None));
        assert!(!equals_matrix4(None, Some(&m)));
    }

    #[test]
    fn returns_true_for_two_matrices_with_identical_values() {
        let a = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );
        let b = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );
        assert!(equals_matrix4(Some(&a), Some(&b)));
    }

    #[test]
    fn returns_false_if_any_value_differs() {
        let a = create_matrix4();
        let mut b = create_matrix4();
        b.m[10] = 2.0;
        assert!(!equals_matrix4(Some(&a), Some(&b)));
    }
}

mod get_matrix4_determinant {
    use super::*;

    #[test]
    fn returns_1_for_the_identity_matrix() {
        let m = create_matrix4();
        assert_eq!(get_matrix4_determinant(&m), 1.0);
    }
}

mod get_matrix4_element {
    use super::*;

    #[test]
    fn returns_the_element_at_the_given_row_and_column() {
        let m = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );
        assert_eq!(get_matrix4_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix4_element(&m, 1, 0), 2.0);
        assert_eq!(get_matrix4_element(&m, 0, 1), 5.0);
        assert_eq!(get_matrix4_element(&m, 3, 3), 16.0);
    }
}

mod get_matrix4_position {
    use super::*;

    #[test]
    fn extracts_translation_components_from_the_matrix() {
        let mut m = create_matrix4();
        m.m[12] = 10.0;
        m.m[13] = 20.0;
        m.m[14] = 30.0;

        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_matrix4_position(&mut out, &m);

        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.z, 30.0);
    }
}

mod interpolate_matrix4 {
    use super::*;

    #[test]
    fn returns_a_at_t_zero() {
        let a = create_matrix4();
        let mut b = create_matrix4();
        let b_copy = clone_matrix4(&b);
        translate_matrix4(&mut b, &b_copy, 10.0, 0.0, 0.0);
        let mut out = create_matrix4();
        interpolate_matrix4(&mut out, &a, &b, 0.0);
        assert!(equals_matrix4(Some(&out), Some(&a)));
    }

    #[test]
    fn returns_b_at_t_one() {
        let a = create_matrix4();
        let mut b = create_matrix4();
        let b_copy = clone_matrix4(&b);
        translate_matrix4(&mut b, &b_copy, 10.0, 0.0, 0.0);
        let mut out = create_matrix4();
        interpolate_matrix4(&mut out, &a, &b, 1.0);
        assert!(equals_matrix4(Some(&out), Some(&b)));
    }

    #[test]
    fn returns_midpoint_at_t_half() {
        let a = create_matrix4();
        let mut b = create_matrix4();
        let b_copy = clone_matrix4(&b);
        translate_matrix4(&mut b, &b_copy, 10.0, 0.0, 0.0);
        let mut out = create_matrix4();
        interpolate_matrix4(&mut out, &a, &b, 0.5);
        assert_approx(out.m[12], 5.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_matrix4();
        let mut b = create_matrix4();
        let b_copy = clone_matrix4(&b);
        translate_matrix4(&mut b, &b_copy, 10.0, 20.0, 30.0);
        let a_copy = clone_matrix4(&a);
        interpolate_matrix4(&mut a, &a_copy, &b, 0.5);
        assert_approx(a.m[12], 5.0);
        assert_approx(a.m[13], 10.0);
        assert_approx(a.m[14], 15.0);
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_matrix4();
        let mut b = create_matrix4();
        let b_copy = clone_matrix4(&b);
        translate_matrix4(&mut b, &b_copy, 10.0, 20.0, 30.0);
        let b_copy2 = clone_matrix4(&b);
        interpolate_matrix4(&mut b, &a, &b_copy2, 0.5);
        assert_approx(b.m[12], 5.0);
        assert_approx(b.m[13], 10.0);
        assert_approx(b.m[14], 15.0);
    }
}

mod inverse_matrix4 {
    use super::*;

    #[test]
    fn inverse_of_identity_is_identity() {
        let m = create_matrix4();
        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &m);
        assert!(equals_matrix4(Some(&inv), Some(&create_matrix4())));
    }

    #[test]
    fn inverse_of_translation_only_negates_translation() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, -3.0, 2.0);

        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &m);

        assert_approx(inv.m[12], -5.0);
        assert_approx(inv.m[13], 3.0);
        assert_approx(inv.m[14], -2.0);
        assert_approx(inv.m[0], 1.0);
        assert_approx(inv.m[5], 1.0);
        assert_approx(inv.m[10], 1.0);
    }

    #[test]
    fn inverse_of_rotation_only_matrix_gives_identity_when_multiplied() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        append_rotation_matrix4(&mut m, &m_copy, PI / 2.0, &z_axis_v4(), None);

        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &m);

        let mut check = create_matrix4();
        multiply_matrix4(&mut check, &m, &inv);
        assert_matrix4_close(&check, &create_matrix4());
    }

    #[test]
    fn inverse_of_rotation_plus_translation() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, 0.0, 0.0);
        let m_copy2 = clone_matrix4(&m);
        append_rotation_matrix4(&mut m, &m_copy2, PI / 2.0, &z_axis_v4(), None);

        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &m);

        let mut check = create_matrix4();
        multiply_matrix4(&mut check, &m, &inv);
        assert_matrix4_close(&check, &create_matrix4());
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix4();
        let mc = clone_matrix4(&matrix);
        translate_matrix4(&mut matrix, &mc, 5.0, -3.0, 2.0);
        let mc2 = clone_matrix4(&matrix);
        append_rotation_matrix4(&mut matrix, &mc2, PI / 6.0, &z_axis_v4(), None);
        let mc3 = clone_matrix4(&matrix);
        scale_matrix4(&mut matrix, &mc3, 2.0, 3.0, 4.0);
        let mut expected = create_matrix4();
        inverse_matrix4(&mut expected, &matrix);

        let matrix_copy = clone_matrix4(&matrix);
        inverse_matrix4(&mut matrix, &matrix_copy);

        assert_matrix4_close(&matrix, &expected);
    }

    #[test]
    fn inverse_of_singular_matrix_returns_false_and_fills_with_nan() {
        let mut m = create_matrix4();
        m.m[0] = 0.0;

        let mut inv = create_matrix4();
        let ok = inverse_matrix4(&mut inv, &m);

        let det = get_matrix4_determinant(&m);
        assert_approx(det, 0.0);
        assert!(!ok);
        assert!(inv.m[0].is_nan());
        assert!(inv.m[1].is_nan());
        assert!(inv.m[2].is_nan());
    }

    #[test]
    fn returns_false_for_a_singular_matrix_with_out_equals_source() {
        let mut m = create_matrix4();
        m.m[0] = 0.0;

        let m_copy = clone_matrix4(&m);
        let ok = inverse_matrix4(&mut m, &m_copy);

        assert!(!ok);
        assert!(m.m[0].is_nan());
    }
}

mod is_affine_matrix4 {
    use super::*;

    #[test]
    fn returns_true_for_the_identity_matrix() {
        let m = create_matrix4();
        assert!(is_affine_matrix4(&m));
    }

    #[test]
    fn returns_true_for_a_2d_transform_matrix() {
        let m = create_matrix4_from_2d(1.0, 0.0, 0.0, 1.0, 10.0, 20.0);
        assert!(is_affine_matrix4(&m));
    }

    #[test]
    fn returns_false_if_m3_is_non_zero() {
        let mut m = create_matrix4();
        m.m[3] = 1.0;
        assert!(!is_affine_matrix4(&m));
    }

    #[test]
    fn returns_false_if_m7_is_non_zero() {
        let mut m = create_matrix4();
        m.m[7] = 1.0;
        assert!(!is_affine_matrix4(&m));
    }

    #[test]
    fn returns_false_if_m11_is_non_zero() {
        let mut m = create_matrix4();
        m.m[11] = 1.0;
        assert!(!is_affine_matrix4(&m));
    }

    #[test]
    fn returns_false_if_m15_is_not_1() {
        let mut m = create_matrix4();
        m.m[15] = 0.0;
        assert!(!is_affine_matrix4(&m));
    }
}

mod matrix4_transform_point {
    use super::*;

    #[test]
    fn translates_a_point_by_the_matrix_translation() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, 10.0, 15.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut out, &m, &create_vector3(0.0, 0.0, 0.0));
        assert_approx(out.x, 5.0);
        assert_approx(out.y, 10.0);
        assert_approx(out.z, 15.0);
    }

    #[test]
    fn scales_a_point_correctly() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        scale_matrix4(&mut m, &m_copy, 2.0, 3.0, 4.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut out, &m, &create_vector3(1.0, 2.0, 3.0));
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 6.0);
        assert_eq!(out.z, 12.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, 10.0, 15.0);
        let mut point = create_vector3(1.0, 2.0, 3.0);
        let point_copy = create_vector3(point.x, point.y, point.z);
        matrix4_transform_point(&mut point, &m, &point_copy);
        assert_approx(point.x, 6.0);
        assert_approx(point.y, 12.0);
        assert_approx(point.z, 18.0);
    }
}

mod matrix4_transform_vector {
    use super::*;

    #[test]
    fn transforms_a_vector4_by_the_matrix() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, 10.0, 15.0);
        let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
        matrix4_transform_vector(&mut out, &m, &create_vector4(1.0, 2.0, 3.0, 1.0));
        assert_approx(out.x, 6.0);
        assert_approx(out.y, 12.0);
        assert_approx(out.z, 18.0);
    }

    #[test]
    fn does_not_translate_a_direction_vector_with_w_equals_0() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, 10.0, 15.0);
        let mut out = create_vector4(0.0, 0.0, 0.0, 0.0);
        matrix4_transform_vector(&mut out, &m, &create_vector4(1.0, 2.0, 3.0, 0.0));
        assert_approx(out.x, 1.0);
        assert_approx(out.y, 2.0);
        assert_approx(out.z, 3.0);
        assert_approx(out.w, 0.0);
    }

    #[test]
    fn supports_out_equals_vector() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, 10.0, 15.0);
        let mut vector = create_vector4(1.0, 2.0, 3.0, 1.0);
        let vector_copy = create_vector4(vector.x, vector.y, vector.z, vector.w);
        matrix4_transform_vector(&mut vector, &m, &vector_copy);
        assert_approx(vector.x, 6.0);
        assert_approx(vector.y, 12.0);
        assert_approx(vector.z, 18.0);
        assert_approx(vector.w, 1.0);
    }
}

mod matrix4_transform_vectors {
    use super::*;

    #[test]
    fn transforms_a_flat_array_of_xyz_triples() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 1.0, 2.0, 3.0);
        let vectors: [f32; 6] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let mut out = [0.0f32; 6];
        matrix4_transform_vectors(&mut out, &m, &vectors);
        assert_approx(out[0], 1.0);
        assert_approx(out[1], 2.0);
        assert_approx(out[2], 3.0);
        assert_approx(out[3], 2.0);
        assert_approx(out[4], 2.0);
        assert_approx(out[5], 3.0);
    }

    #[test]
    fn processes_each_triple_independently() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 1.0, 2.0, 3.0);
        let vectors: [f32; 6] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let vectors_copy = vectors.clone();
        let mut out = [0.0f32; 6];
        matrix4_transform_vectors(&mut out, &m, &vectors_copy);
        assert_eq!(out, [1.0, 2.0, 3.0, 2.0, 2.0, 3.0]);
    }
}

mod multiply_matrix4 {
    use super::*;

    #[test]
    fn returns_the_right_hand_operand_when_left_is_identity() {
        let i = create_matrix4();
        let t = create_matrix4_from_2d(1.0, 0.0, 0.0, 1.0, 10.0, 20.0);

        let mut out = create_matrix4();
        multiply_matrix4(&mut out, &i, &t);

        assert!(equals_matrix4(Some(&out), Some(&t)));
    }

    #[test]
    fn returns_the_left_hand_operand_when_right_is_identity() {
        let i = create_matrix4();
        let mut s = create_matrix4();
        let s_copy = clone_matrix4(&s);
        scale_matrix4(&mut s, &s_copy, 2.0, 3.0, 4.0);

        let mut out = create_matrix4();
        multiply_matrix4(&mut out, &s, &i);

        assert!(equals_matrix4(Some(&out), Some(&s)));
    }

    #[test]
    fn does_not_mutate_inputs() {
        let mut a = create_matrix4();
        let a_copy = clone_matrix4(&a);
        translate_matrix4(&mut a, &a_copy, 1.0, 2.0, 3.0);
        let mut b = create_matrix4();
        let b_copy = clone_matrix4(&b);
        scale_matrix4(&mut b, &b_copy, 2.0, 2.0, 2.0);

        let a_before: [f32; 16] = a.m;
        let b_before: [f32; 16] = b.m;

        let mut result = create_matrix4();
        multiply_matrix4(&mut result, &a, &b);

        assert_eq!(a.m, a_before);
        assert_eq!(b.m, b_before);
    }

    #[test]
    fn supports_out_equals_a() {
        let a = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );
        let b = create_matrix4_from_values(
            17.0, 19.0, 23.0, 29.0, 31.0, 37.0, 41.0, 43.0, 47.0, 53.0, 59.0, 61.0, 67.0, 71.0,
            73.0, 79.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &a, &b);

        let mut a_mut = clone_matrix4(&a);
        let a_copy = clone_matrix4(&a_mut);
        multiply_matrix4(&mut a_mut, &a_copy, &b);
        assert!(equals_matrix4(Some(&a_mut), Some(&expected)));
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );
        let b = create_matrix4_from_values(
            17.0, 19.0, 23.0, 29.0, 31.0, 37.0, 41.0, 43.0, 47.0, 53.0, 59.0, 61.0, 67.0, 71.0,
            73.0, 79.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &a, &b);

        let mut b_mut = clone_matrix4(&b);
        let b_copy = clone_matrix4(&b_mut);
        multiply_matrix4(&mut b_mut, &a, &b_copy);
        assert!(equals_matrix4(Some(&b_mut), Some(&expected)));
    }

    #[test]
    fn post_multiplies_by_the_given_matrix() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 1.0, 0.0, 0.0);
        let mut s = create_matrix4();
        let s_copy = clone_matrix4(&s);
        scale_matrix4(&mut s, &s_copy, 2.0, 2.0, 2.0);

        let m_copy2 = clone_matrix4(&m);
        multiply_matrix4(&mut m, &m_copy2, &s);

        assert_eq!(m.m[12], 1.0);
        assert_eq!(m.m[0], 2.0);
    }

    #[test]
    fn translation_times_scale_not_equals_scale_times_translation() {
        let mut t = create_matrix4();
        let t_copy = clone_matrix4(&t);
        translate_matrix4(&mut t, &t_copy, 10.0, 0.0, 0.0);
        let mut s = create_matrix4();
        let s_copy = clone_matrix4(&s);
        scale_matrix4(&mut s, &s_copy, 2.0, 2.0, 2.0);

        let mut ts = create_matrix4();
        multiply_matrix4(&mut ts, &t, &s);

        let mut st = create_matrix4();
        multiply_matrix4(&mut st, &s, &t);

        assert_eq!(ts.m[12], 10.0);
        assert_eq!(st.m[12], 20.0);
        assert!(!equals_matrix4(Some(&ts), Some(&st)));
    }
}

mod prepend_matrix4 {
    use super::*;

    #[test]
    fn composes_other_before_source_out_equals_source_times_other() {
        let source = discriminating_matrix4();
        let mut other = create_matrix4();
        set_matrix4(
            &mut other, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 0.0, 0.0,
            1.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &source, &other);

        let mut out = create_matrix4();
        prepend_matrix4(&mut out, &source, &other);

        assert_eq!(out.m, expected.m);
    }

    #[test]
    fn is_the_opposite_composition_from_append_matrix4() {
        let source = discriminating_matrix4();
        let mut other = create_matrix4();
        set_matrix4(
            &mut other, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 0.0, 0.0,
            1.0,
        );

        let mut appended = create_matrix4();
        append_matrix4(&mut appended, &source, &other);
        let mut prepended = create_matrix4();
        prepend_matrix4(&mut prepended, &source, &other);

        assert_ne!(appended.m, prepended.m);
    }

    #[test]
    fn supports_out_equals_source() {
        let source = discriminating_matrix4();
        let mut other = create_matrix4();
        scale_matrix4(&mut other, &create_matrix4(), 2.0, 3.0, 4.0);
        let mut expected = create_matrix4();
        prepend_matrix4(&mut expected, &source, &other);

        let mut source_mut = clone_matrix4(&source);
        let source_copy = clone_matrix4(&source_mut);
        prepend_matrix4(&mut source_mut, &source_copy, &other);

        assert_eq!(source_mut.m, expected.m);
    }
}

mod prepend_rotation_matrix4 {
    use super::*;

    #[test]
    fn rotates_identity_around_z_axis() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        prepend_rotation_matrix4(&mut m, &m_copy, PI / 2.0, &z_axis_v4(), None);

        assert_approx(m.m[0], 0.0);
        assert_approx(m.m[1], 1.0);
    }

    #[test]
    fn leaves_the_existing_translation_in_place() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 10.0, 0.0, 0.0);

        let m_copy2 = clone_matrix4(&m);
        prepend_rotation_matrix4(&mut m, &m_copy2, PI / 2.0, &z_axis_v4(), None);

        assert_approx_tight(m.m[12], 10.0);
        assert_approx_tight(m.m[13], 0.0);
    }

    #[test]
    fn applies_the_rotation_before_source_out_equals_source_times_r() {
        let source = discriminating_matrix4();
        let mut rotation = create_matrix4();
        let rot_copy = clone_matrix4(&rotation);
        prepend_rotation_matrix4(&mut rotation, &rot_copy, PI / 3.0, &z_axis_v4(), None);
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &source, &rotation);

        let mut out = create_matrix4();
        prepend_rotation_matrix4(&mut out, &source, PI / 3.0, &z_axis_v4(), None);

        for i in 0..16 {
            assert_approx(out.m[i], expected.m[i]);
        }
    }

    #[test]
    fn holds_the_pivot_point_fixed() {
        let source = discriminating_matrix4();
        let pivot = create_vector4(5.0, 0.0, 0.0, 1.0);
        let mut before = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(
            &mut before,
            &source,
            &create_vector3(pivot.x, pivot.y, pivot.z),
        );

        let mut out = create_matrix4();
        prepend_rotation_matrix4(&mut out, &source, PI / 2.0, &z_axis_v4(), Some(&pivot));

        let mut after = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut after, &out, &create_vector3(pivot.x, pivot.y, pivot.z));
        assert_approx(after.x, before.x);
        assert_approx(after.y, before.y);
        assert_approx(after.z, before.z);
    }

    #[test]
    fn writes_the_same_values_whether_out_aliases_source_or_not() {
        let source = discriminating_matrix4();
        let mut distinct = create_matrix4();
        let mut aliased = clone_matrix4(&source);
        let pivot = create_vector4(1.0, 2.0, 3.0, 1.0);

        prepend_rotation_matrix4(&mut distinct, &source, PI / 3.0, &z_axis_v4(), Some(&pivot));
        let aliased_copy = clone_matrix4(&aliased);
        prepend_rotation_matrix4(
            &mut aliased,
            &aliased_copy,
            PI / 3.0,
            &z_axis_v4(),
            Some(&pivot),
        );

        assert_eq!(aliased.m, distinct.m);
    }
}

mod prepend_scale_matrix4 {
    use super::*;

    #[test]
    fn applies_the_scale_before_source_out_equals_source_times_s() {
        let source = discriminating_matrix4();
        let scale = create_matrix4_from_values(
            2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &source, &scale);

        let mut out = create_matrix4();
        prepend_scale_matrix4(&mut out, &source, 2.0, 3.0, 4.0);

        assert_eq!(out.m, expected.m);
    }

    #[test]
    fn leaves_the_translation_alone() {
        let source = discriminating_matrix4();
        let mut out = create_matrix4();

        prepend_scale_matrix4(&mut out, &source, 2.0, 3.0, 4.0);

        assert_eq!(out.m[12], source.m[12]);
        assert_eq!(out.m[13], source.m[13]);
        assert_eq!(out.m[14], source.m[14]);
    }

    #[test]
    fn supports_out_equals_source() {
        let source = discriminating_matrix4();
        let mut expected = create_matrix4();
        prepend_scale_matrix4(&mut expected, &source, 2.0, 3.0, 4.0);

        let mut source_mut = clone_matrix4(&source);
        let source_copy = clone_matrix4(&source_mut);
        prepend_scale_matrix4(&mut source_mut, &source_copy, 2.0, 3.0, 4.0);

        assert_eq!(source_mut.m, expected.m);
    }
}

mod prepend_translation_matrix4 {
    use super::*;

    #[test]
    fn applies_the_offset_before_source_out_equals_source_times_t() {
        let source = discriminating_matrix4();
        let translation = create_matrix4_from_values(
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 2.0, 3.0, 1.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &source, &translation);

        let mut out = create_matrix4();
        prepend_translation_matrix4(&mut out, &source, 1.0, 2.0, 3.0);

        assert_eq!(out.m, expected.m);
    }

    #[test]
    fn carries_the_offset_through_the_source_basis() {
        let source = discriminating_matrix4();
        let mut out = create_matrix4();

        prepend_translation_matrix4(&mut out, &source, 1.0, 2.0, 3.0);

        assert_eq!(
            out.m[12],
            source.m[0] * 1.0 + source.m[4] * 2.0 + source.m[8] * 3.0 + source.m[12]
        );
        assert_eq!(
            out.m[13],
            source.m[1] * 1.0 + source.m[5] * 2.0 + source.m[9] * 3.0 + source.m[13]
        );
        assert_eq!(
            out.m[14],
            source.m[2] * 1.0 + source.m[6] * 2.0 + source.m[10] * 3.0 + source.m[14]
        );
    }

    #[test]
    fn supports_out_equals_source() {
        let source = discriminating_matrix4();
        let mut expected = create_matrix4();
        prepend_translation_matrix4(&mut expected, &source, 1.0, 2.0, 3.0);

        let mut source_mut = clone_matrix4(&source);
        let source_copy = clone_matrix4(&source_mut);
        prepend_translation_matrix4(&mut source_mut, &source_copy, 1.0, 2.0, 3.0);

        assert_eq!(source_mut.m, expected.m);
    }
}

mod rotate_matrix4 {
    use super::*;

    #[test]
    fn matches_append_rotation_on_identity() {
        let mut a = create_matrix4();
        let a_copy = clone_matrix4(&a);
        rotate_matrix4(&mut a, &a_copy, &create_vector3(0.0, 0.0, 1.0), PI / 2.0);

        let mut b = create_matrix4();
        let b_copy = clone_matrix4(&b);
        append_rotation_matrix4(&mut b, &b_copy, PI / 2.0, &z_axis_v4(), None);

        assert!(equals_matrix4(Some(&a), Some(&b)));
    }

    #[test]
    fn matches_the_quaternion_rotation_path_for_an_asymmetric_unit_axis() {
        let inverse_length = 1.0 / 14.0f32.sqrt();
        let axis = create_vector3(2.0 * inverse_length, inverse_length, 3.0 * inverse_length);
        let radians = PI / 3.0;
        let mut quaternion = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quaternion, &axis, radians);
        let mut expected = create_matrix4();
        set_matrix4_from_quaternion(&mut expected, &quaternion);

        let mut actual = create_matrix4();
        let actual_copy = clone_matrix4(&actual);
        rotate_matrix4(&mut actual, &actual_copy, &axis, radians);

        for i in 0..16 {
            assert_approx_tight(actual.m[i], expected.m[i]);
        }
    }

    #[test]
    fn preserves_translation_when_rotating_locally() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 5.0, 0.0, 0.0);

        let m_copy2 = clone_matrix4(&m);
        rotate_matrix4(&mut m, &m_copy2, &create_vector3(0.0, 0.0, 1.0), PI / 2.0);

        assert_eq!(m.m[12], 5.0);
        assert_eq!(m.m[13], 0.0);
    }

    #[test]
    fn rotation_around_x_does_not_affect_x_axis_basis_vector() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        append_rotation_matrix4(&mut m, &m_copy, PI / 2.0, &x_axis_v4(), None);

        assert_approx(m.m[0], 1.0);
        assert_approx(m.m[1], 0.0);
        assert_approx(m.m[2], 0.0);
    }

    #[test]
    fn rotation_around_y_does_not_affect_y_axis_basis_vector() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        append_rotation_matrix4(&mut m, &m_copy, PI / 2.0, &y_axis_v4(), None);

        assert_approx(m.m[4], 0.0);
        assert_approx(m.m[5], 1.0);
        assert_approx(m.m[6], 0.0);
    }

    #[test]
    fn writes_the_same_values_whether_out_aliases_source_or_not() {
        let mut source = create_matrix4();
        set_matrix4(
            &mut source,
            0.0,
            1.0,
            0.0,
            0.0,
            -1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            7.0,
            8.0,
            9.0,
            1.0,
        );
        let mut distinct = create_matrix4();
        let mut aliased = clone_matrix4(&source);

        rotate_matrix4(
            &mut distinct,
            &source,
            &create_vector3(0.0, 0.0, 1.0),
            PI / 3.0,
        );
        let aliased_copy = clone_matrix4(&aliased);
        rotate_matrix4(
            &mut aliased,
            &aliased_copy,
            &create_vector3(0.0, 0.0, 1.0),
            PI / 3.0,
        );

        assert_eq!(aliased.m, distinct.m);
    }
}

mod scale_matrix4 {
    use super::*;

    #[test]
    fn scales_an_identity_matrix_by_xyz() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        scale_matrix4(&mut m, &m_copy, 2.0, 3.0, 4.0);

        assert_eq!(m.m[0], 2.0);
        assert_eq!(m.m[5], 3.0);
        assert_eq!(m.m[10], 4.0);
    }

    #[test]
    fn accumulates_scale_multiplicatively() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        scale_matrix4(&mut m, &m_copy, 2.0, 3.0, 4.0);
        let m_copy2 = clone_matrix4(&m);
        scale_matrix4(&mut m, &m_copy2, 5.0, 6.0, 7.0);

        assert_eq!(m.m[0], 10.0);
        assert_eq!(m.m[5], 18.0);
        assert_eq!(m.m[10], 28.0);
    }

    #[test]
    fn does_not_modify_translation_when_scaling_locally() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 10.0, 20.0, 30.0);

        let m_copy2 = clone_matrix4(&m);
        scale_matrix4(&mut m, &m_copy2, 2.0, 3.0, 4.0);

        assert_eq!(m.m[12], 10.0);
        assert_eq!(m.m[13], 20.0);
        assert_eq!(m.m[14], 30.0);
    }

    #[test]
    fn post_multiplies_by_diag_on_a_rotated_basis() {
        let mut rotated = create_matrix4();
        set_matrix4(
            &mut rotated,
            0.0,
            1.0,
            0.0,
            0.0,
            -1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            7.0,
            8.0,
            9.0,
            1.0,
        );
        let scale = create_matrix4_from_values(
            2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &rotated, &scale);

        let mut result = create_matrix4();
        scale_matrix4(&mut result, &rotated, 2.0, 3.0, 4.0);

        assert_eq!(result.m, expected.m);
        assert_eq!(result.m[1], 2.0);
        assert_eq!(result.m[4], -3.0);
    }

    #[test]
    fn scales_the_fourth_row_of_each_basis_column_for_a_non_affine_matrix() {
        let mut projective = create_matrix4();
        set_matrix4(
            &mut projective,
            1.0,
            0.0,
            0.0,
            5.0,
            0.0,
            1.0,
            0.0,
            6.0,
            0.0,
            0.0,
            1.0,
            7.0,
            0.0,
            0.0,
            0.0,
            1.0,
        );

        let proj_copy = clone_matrix4(&projective);
        scale_matrix4(&mut projective, &proj_copy, 2.0, 3.0, 4.0);

        assert_eq!(projective.m[3], 10.0);
        assert_eq!(projective.m[7], 18.0);
        assert_eq!(projective.m[11], 28.0);
        assert_eq!(projective.m[15], 1.0);
    }

    #[test]
    fn writes_the_same_values_whether_out_aliases_source_or_not() {
        let mut source = create_matrix4();
        set_matrix4(
            &mut source,
            0.0,
            1.0,
            0.0,
            0.0,
            -1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            7.0,
            8.0,
            9.0,
            1.0,
        );
        let mut distinct = create_matrix4();
        let mut aliased = clone_matrix4(&source);

        scale_matrix4(&mut distinct, &source, 2.0, 3.0, 4.0);
        let aliased_copy = clone_matrix4(&aliased);
        scale_matrix4(&mut aliased, &aliased_copy, 2.0, 3.0, 4.0);

        assert_eq!(aliased.m, distinct.m);
    }
}

mod set_matrix4_element {
    use super::*;

    #[test]
    fn writes_the_value_at_the_given_row_and_column() {
        let mut m = create_matrix4();
        set_matrix4_element(&mut m, 2, 3, 42.0);
        assert_eq!(get_matrix4_element(&m, 2, 3), 42.0);
    }

    #[test]
    fn does_not_affect_other_elements() {
        let mut m = create_matrix4();
        set_matrix4_element(&mut m, 1, 2, 7.0);
        assert_eq!(get_matrix4_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix4_element(&m, 3, 3), 1.0);
    }
}

mod set_matrix4_from_2d {
    use super::*;

    #[test]
    fn sets_a_2d_transform_with_translation() {
        let mut m = create_matrix4();
        set_matrix4_from_2d(&mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);

        assert_eq!(
            m.m,
            [
                1.0, 2.0, 0.0, 0.0, 3.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 6.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn produces_an_affine_matrix() {
        let mut m = create_matrix4();
        set_matrix4_from_2d(&mut m, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(is_affine_matrix4(&m));
    }

    #[test]
    fn sets_z_axis_to_identity() {
        let mut m = create_matrix4();
        set_matrix4_from_2d(&mut m, 1.0, 2.0, 3.0, 4.0, 0.0, 0.0);

        assert_eq!(m.m[10], 1.0);
        assert_eq!(m.m[2], 0.0);
        assert_eq!(m.m[6], 0.0);
        assert_eq!(m.m[14], 0.0);
    }
}

mod set_matrix4_from_float32_array {
    use super::*;

    #[test]
    fn reads_16_elements_at_offset_0() {
        let mut arr = [0.0f32; 16];
        for i in 0..16 {
            arr[i] = (i + 1) as f32;
        }
        let mut m = create_matrix4();
        set_matrix4_from_float32_array(&mut m, 0, &arr);
        for i in 0..16 {
            assert_eq!(m.m[i], (i + 1) as f32);
        }
    }

    #[test]
    fn reads_16_elements_at_a_non_zero_offset() {
        let mut arr = [0.0f32; 20];
        for i in 0..20 {
            arr[i] = (i + 1) as f32;
        }
        let mut m = create_matrix4();
        set_matrix4_from_float32_array(&mut m, 4, &arr);
        for i in 0..16 {
            assert_eq!(m.m[i], (i + 5) as f32);
        }
    }

    #[test]
    fn round_trips_with_write_matrix4_to_float32_array() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 3.0, 4.0, 5.0);
        let mut arr = [0.0f32; 16];
        write_matrix4_to_float32_array(&mut arr, 0, &m);
        let mut m2 = create_matrix4();
        set_matrix4_from_float32_array(&mut m2, 0, &arr);
        assert!(equals_matrix4(Some(&m), Some(&m2)));
    }
}

mod set_matrix4_from_matrix {
    use super::*;

    #[test]
    fn should_convert_a_matrix_to_a_matrix4() {
        let mat2d = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut mat = create_matrix4();
        set_matrix4_from_matrix(&mut mat, &mat2d);
        let expected: [f32; 16] = [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];
        assert_eq!(mat.m, expected);
    }

    #[test]
    fn should_handle_scaling_and_translation() {
        let mat2d = create_matrix(2.0, 0.0, 0.0, 3.0, 5.0, 10.0);
        let mut mat = create_matrix4();
        set_matrix4_from_matrix(&mut mat, &mat2d);

        assert_eq!(get_matrix4_element(&mat, 0, 0), 2.0);
        assert_eq!(get_matrix4_element(&mat, 0, 1), 0.0);
        assert_eq!(get_matrix4_element(&mat, 0, 3), 5.0);
        assert_eq!(get_matrix4_element(&mat, 1, 0), 0.0);
        assert_eq!(get_matrix4_element(&mat, 1, 1), 3.0);
        assert_eq!(get_matrix4_element(&mat, 1, 3), 10.0);
        assert_eq!(get_matrix4_element(&mat, 2, 2), 1.0);
        assert_eq!(get_matrix4_element(&mat, 3, 3), 1.0);
    }
}

mod set_matrix4_from_matrix3 {
    use super::*;

    #[test]
    fn should_convert_an_identity_matrix3_to_a_matrix4() {
        let mat3 = create_matrix3();
        let mut mat = create_matrix4();
        set_matrix4_from_matrix3(&mut mat, &mat3);
        let expected: [f32; 16] = [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];
        assert_eq!(mat.m, expected);
    }

    #[test]
    fn should_handle_scaling_and_translation() {
        let mut mat3 = create_matrix3();
        mat3.m = [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 5.0, 10.0, 1.0];
        let mut mat = create_matrix4();
        set_matrix4_from_matrix3(&mut mat, &mat3);

        assert_eq!(get_matrix4_element(&mat, 0, 0), 2.0);
        assert_eq!(get_matrix4_element(&mat, 0, 1), 0.0);
        assert_eq!(get_matrix4_element(&mat, 0, 3), 5.0);
        assert_eq!(get_matrix4_element(&mat, 1, 0), 0.0);
        assert_eq!(get_matrix4_element(&mat, 1, 1), 3.0);
        assert_eq!(get_matrix4_element(&mat, 1, 3), 10.0);
        assert_eq!(get_matrix4_element(&mat, 2, 2), 1.0);
        assert_eq!(get_matrix4_element(&mat, 3, 3), 1.0);
    }
}

mod set_matrix4_from_quaternion {
    use super::*;

    #[test]
    fn identity_quaternion_writes_the_identity_matrix() {
        let mut m = create_matrix4_from_values(
            2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0,
        );
        set_matrix4_from_quaternion(&mut m, &create_quaternion(0.0, 0.0, 0.0, 1.0));
        assert_eq!(
            m.m,
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn a_90_degree_z_rotation_maps_plus_x_to_plus_y() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 0.0, 1.0), PI / 2.0);
        let mut m = create_matrix4();
        set_matrix4_from_quaternion(&mut m, &q);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut out, &m, &create_vector3(1.0, 0.0, 0.0));
        assert_approx_tight(out.x, 0.0);
        assert_approx_tight(out.y, 1.0);
        assert_approx_tight(out.z, 0.0);
    }
}

mod set_matrix4_identity {
    use super::*;

    #[test]
    fn resets_a_matrix_to_identity() {
        let mut m = create_matrix4_from_values(
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
        );
        set_matrix4_identity(&mut m);
        assert_eq!(
            m.m,
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }
}

mod set_matrix4_look_at {
    use super::*;

    #[test]
    fn places_the_eye_at_the_origin_of_view_space() {
        let mut m = create_matrix4();
        let eye = create_vector3(0.0, 0.0, 5.0);
        set_matrix4_look_at(
            &mut m,
            &eye,
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );

        let mut out = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut out, &m, &eye);
        assert_approx_tight(out.x, 0.0);
        assert_approx_tight(out.y, 0.0);
        assert_approx_tight(out.z, 0.0);
    }

    #[test]
    fn looks_down_negative_z_so_the_target_lands_in_front_of_the_camera() {
        let mut m = create_matrix4();
        set_matrix4_look_at(
            &mut m,
            &create_vector3(0.0, 0.0, 5.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );

        let mut out = create_vector3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut out, &m, &create_vector3(0.0, 0.0, 0.0));
        assert_approx_tight(out.z, -5.0);
    }

    #[test]
    fn keeps_the_basis_orthonormal_when_up_parallel_to_the_view_direction() {
        let mut m = create_matrix4();
        set_matrix4_look_at(
            &mut m,
            &create_vector3(0.0, 5.0, 0.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        assert_look_at_orthonormal(&m);
    }

    #[test]
    fn keeps_the_basis_orthonormal_when_eye_at_the_target() {
        let mut m = create_matrix4();
        set_matrix4_look_at(
            &mut m,
            &create_vector3(2.0, 2.0, 2.0),
            &create_vector3(2.0, 2.0, 2.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        assert_look_at_orthonormal(&m);
    }

    #[test]
    fn keeps_the_basis_orthonormal_when_up_parallel_to_a_z_aligned_view() {
        let mut m = create_matrix4();
        set_matrix4_look_at(
            &mut m,
            &create_vector3(0.0, 0.0, 5.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 0.0, 1.0),
        );
        assert_look_at_orthonormal(&m);
    }

    fn assert_look_at_orthonormal(m: &Matrix4) {
        for i in 0..16 {
            assert!(m.m[i].is_finite(), "element {} is not finite", i);
        }
        let x_axis = create_vector3(m.m[0], m.m[4], m.m[8]);
        let y_axis = create_vector3(m.m[1], m.m[5], m.m[9]);
        let z_axis = create_vector3(m.m[2], m.m[6], m.m[10]);

        assert_approx_tight(get_vector3_length(&x_axis), 1.0);
        assert_approx_tight(get_vector3_length(&y_axis), 1.0);
        assert_approx_tight(get_vector3_length(&z_axis), 1.0);
        assert_approx_tight(get_vector3_dot(&x_axis, &y_axis), 0.0);
        assert_approx_tight(get_vector3_dot(&x_axis, &z_axis), 0.0);
        assert_approx_tight(get_vector3_dot(&y_axis, &z_axis), 0.0);
        assert_approx_tight(get_matrix4_determinant(m).abs(), 1.0);
    }
}

mod set_matrix4_position {
    use super::*;

    #[test]
    fn sets_the_translation_components_of_the_matrix() {
        let mut m = create_matrix4();
        set_matrix4_position(&mut m, &create_vector3(5.0, 6.0, 7.0));

        assert_eq!(m.m[12], 5.0);
        assert_eq!(m.m[13], 6.0);
        assert_eq!(m.m[14], 7.0);
    }

    #[test]
    fn does_not_modify_other_matrix_values() {
        let mut m = create_matrix4();
        let before: [f32; 16] = m.m;
        set_matrix4_position(&mut m, &create_vector3(1.0, 2.0, 3.0));

        assert_eq!(m.m[0], before[0]);
        assert_eq!(m.m[5], before[5]);
        assert_eq!(m.m[10], before[10]);
        assert_eq!(m.m[15], before[15]);
    }

    #[test]
    fn can_overwrite_an_existing_translation() {
        let mut m = create_matrix4();
        set_matrix4_position(&mut m, &create_vector3(1.0, 2.0, 3.0));
        set_matrix4_position(&mut m, &create_vector3(-1.0, -2.0, -3.0));

        assert_eq!(m.m[12], -1.0);
        assert_eq!(m.m[13], -2.0);
        assert_eq!(m.m[14], -3.0);
    }
}

mod set_matrix4_tests {
    use super::*;

    #[test]
    fn sets_all_16_values_in_column_major_order() {
        let mut m = create_matrix4();
        set_matrix4(
            &mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0,
            15.0, 16.0,
        );

        assert_eq!(
            m.m,
            [
                1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
                16.0
            ]
        );
    }

    #[test]
    fn overwrites_existing_matrix_values_completely() {
        let mut m = create_matrix4_from_values(
            99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0,
            99.0, 99.0,
        );

        set_matrix4(
            &mut m, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        );

        assert_eq!(
            m.m,
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }
}

mod set_orthographic_matrix4 {
    use super::*;

    #[test]
    fn sets_m0_to_2_over_right_minus_left() {
        let mut m = create_matrix4();
        set_orthographic_matrix4(&mut m, -1.0, 1.0, -1.0, 1.0, 0.1, 100.0);
        assert_approx(m.m[0], 1.0);
    }

    #[test]
    fn sets_m5_to_2_over_top_minus_bottom() {
        let mut m = create_matrix4();
        set_orthographic_matrix4(&mut m, 0.0, 2.0, 0.0, 4.0, 0.1, 100.0);
        assert_approx(m.m[5], 0.5);
    }
}

mod set_perspective_matrix4 {
    use super::*;

    #[test]
    #[should_panic]
    fn panics_when_aspect_is_zero() {
        let mut m = create_matrix4();
        set_perspective_matrix4(&mut m, 0.5, 0.0, 0.1, 1000.0);
    }

    #[test]
    fn evaluates_the_infinite_far_projection_limit_without_nan() {
        let mut m = create_matrix4();
        set_perspective_matrix4(&mut m, 0.5, 1.6, 0.1, f32::INFINITY);
        assert!(m.m.iter().all(|v| v.is_finite()));
        assert_eq!(m.m[10], -1.0);
        assert_approx(m.m[14], -0.2);
    }

    #[test]
    fn sets_m11_to_negative_1() {
        let mut m = create_matrix4();
        set_perspective_matrix4(&mut m, 0.5, 1.6, 0.1, 1000.0);
        assert_eq!(m.m[11], -1.0);
    }

    #[test]
    fn sets_m15_to_0_so_clip_w_is_negative_z_not_negative_z_plus_w() {
        let mut m = create_matrix4();
        set_perspective_matrix4(&mut m, 0.5, 1.6, 0.1, 1000.0);
        assert_eq!(m.m[15], 0.0);
    }

    #[test]
    fn projects_a_point_to_clip_w_equals_negative_z_eye() {
        let mut m = create_matrix4();
        set_perspective_matrix4(&mut m, 0.5, 1.6, 0.1, 1000.0);
        let z_eye: f32 = -5.0;
        let w_clip = m.m[3] * 2.0 + m.m[7] * 3.0 + m.m[11] * z_eye + m.m[15] * 1.0;
        assert_eq!(w_clip, 5.0);
    }
}

mod translate_matrix4 {
    use super::*;

    #[test]
    fn translates_an_identity_matrix_by_xyz() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 1.0, 2.0, 3.0);

        assert_eq!(m.m[12], 1.0);
        assert_eq!(m.m[13], 2.0);
        assert_eq!(m.m[14], 3.0);
    }

    #[test]
    fn accumulates_translation_when_called_multiple_times() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 1.0, 2.0, 3.0);
        let m_copy2 = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy2, 4.0, 5.0, 6.0);

        assert_eq!(m.m[12], 5.0);
        assert_eq!(m.m[13], 7.0);
        assert_eq!(m.m[14], 9.0);
    }

    #[test]
    fn copies_the_whole_source_matrix_when_out_is_a_distinct_object() {
        let mut source = create_matrix4();
        set_matrix4(
            &mut source,
            0.0,
            1.0,
            0.0,
            0.0,
            -1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            7.0,
            8.0,
            9.0,
            1.0,
        );
        let mut out = create_matrix4_from_values(
            9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0,
        );
        let mut aliased = clone_matrix4(&source);

        translate_matrix4(&mut out, &source, 1.0, 2.0, 3.0);
        let aliased_copy = clone_matrix4(&aliased);
        translate_matrix4(&mut aliased, &aliased_copy, 1.0, 2.0, 3.0);

        assert_eq!(out.m, aliased.m);
        assert_eq!(
            source.m,
            [
                0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 7.0, 8.0, 9.0, 1.0
            ]
        );
    }
}

mod transpose_matrix4 {
    use super::*;

    #[test]
    fn transpose_of_identity_is_identity() {
        let m = create_matrix4();
        let mut t = create_matrix4();
        transpose_matrix4(&mut t, &m);
        assert!(equals_matrix4(Some(&t), Some(&m)));
    }

    #[test]
    fn transpose_of_diagonal_matrix_is_itself() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        scale_matrix4(&mut m, &m_copy, 2.0, 3.0, 4.0);
        let mut t = create_matrix4();
        transpose_matrix4(&mut t, &m);
        assert!(equals_matrix4(Some(&t), Some(&m)));
    }

    #[test]
    fn transpose_of_rotation_matrix_equals_its_inverse() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        append_rotation_matrix4(&mut m, &m_copy, PI / 2.0, &z_axis_v4(), None);

        let mut t = create_matrix4();
        transpose_matrix4(&mut t, &m);
        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &m);

        for i in 0..16 {
            assert_approx(t.m[i], inv.m[i]);
        }
    }

    #[test]
    fn transpose_of_arbitrary_matrix_swaps_rows_and_columns() {
        let mut m = create_matrix4();
        set_matrix4(
            &mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0,
            15.0, 16.0,
        );
        let mut t = create_matrix4();
        transpose_matrix4(&mut t, &m);
        let expected = [
            1.0, 5.0, 9.0, 13.0, 2.0, 6.0, 10.0, 14.0, 3.0, 7.0, 11.0, 15.0, 4.0, 8.0, 12.0, 16.0,
        ];
        for i in 0..16 {
            assert_eq!(t.m[i], expected[i]);
        }
    }

    #[test]
    fn transpose_twice_returns_original_matrix() {
        let mut m = create_matrix4();
        set_matrix4(
            &mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0,
            15.0, 16.0,
        );
        let mut t = create_matrix4();
        transpose_matrix4(&mut t, &m);
        let mut t2 = create_matrix4();
        transpose_matrix4(&mut t2, &t);
        assert!(equals_matrix4(Some(&t2), Some(&m)));
    }

    #[test]
    fn supports_out_equals_source() {
        let mut matrix = create_matrix4();
        set_matrix4(
            &mut matrix,
            1.0,
            2.0,
            3.0,
            4.0,
            5.0,
            6.0,
            7.0,
            8.0,
            9.0,
            10.0,
            11.0,
            12.0,
            13.0,
            14.0,
            15.0,
            16.0,
        );
        let mut expected = create_matrix4();
        transpose_matrix4(&mut expected, &matrix);

        let matrix_copy = clone_matrix4(&matrix);
        transpose_matrix4(&mut matrix, &matrix_copy);
        assert!(equals_matrix4(Some(&matrix), Some(&expected)));
    }

    #[test]
    fn supports_out_equals_source_with_non_symmetric_values() {
        let mut m = create_matrix4();
        set_matrix4(
            &mut m, 2.0, 3.0, 5.0, 7.0, 11.0, 13.0, 17.0, 19.0, 23.0, 29.0, 31.0, 37.0, 41.0, 43.0,
            47.0, 53.0,
        );
        let m_copy = clone_matrix4(&m);
        transpose_matrix4(&mut m, &m_copy);
        let expected = [
            2.0, 11.0, 23.0, 41.0, 3.0, 13.0, 29.0, 43.0, 5.0, 17.0, 31.0, 47.0, 7.0, 19.0, 37.0,
            53.0,
        ];
        for i in 0..16 {
            assert_eq!(m.m[i], expected[i]);
        }
    }
}

mod write_matrix4_to_float32_array {
    use super::*;

    #[test]
    fn writes_16_elements_at_offset_0() {
        let mut m = create_matrix4();
        set_matrix4(
            &mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0,
            15.0, 16.0,
        );
        let mut arr = [0.0f32; 16];
        write_matrix4_to_float32_array(&mut arr, 0, &m);
        for i in 0..16 {
            assert_eq!(arr[i], m.m[i]);
        }
    }

    #[test]
    fn writes_16_elements_at_a_non_zero_offset() {
        let mut m = create_matrix4();
        let m_copy = clone_matrix4(&m);
        translate_matrix4(&mut m, &m_copy, 1.0, 2.0, 3.0);
        let mut arr = [0.0f32; 20];
        write_matrix4_to_float32_array(&mut arr, 4, &m);
        for i in 0..16 {
            assert_eq!(arr[4 + i], m.m[i]);
        }
        assert_eq!(arr[0], 0.0);
        assert_eq!(arr[3], 0.0);
    }
}
