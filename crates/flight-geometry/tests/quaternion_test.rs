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

fn assert_quaternion_close(q: &Quaternion, x: f32, y: f32, z: f32, w: f32) {
    assert_approx_tight(q.x, x);
    assert_approx_tight(q.y, y);
    assert_approx_tight(q.z, z);
    assert_approx_tight(q.w, w);
}

fn quaternion_to_matrix4(q: &Quaternion) -> Matrix4 {
    let x = q.x;
    let y = q.y;
    let z = q.z;
    let w = q.w;
    let xx = x * x;
    let yy = y * y;
    let zz = z * z;
    let xy = x * y;
    let xz = x * z;
    let yz = y * z;
    let wx = w * x;
    let wy = w * y;
    let wz = w * z;
    let mut m = create_matrix4();
    m.m[0] = 1.0 - 2.0 * (yy + zz);
    m.m[1] = 2.0 * (xy + wz);
    m.m[2] = 2.0 * (xz - wy);
    m.m[3] = 0.0;
    m.m[4] = 2.0 * (xy - wz);
    m.m[5] = 1.0 - 2.0 * (xx + zz);
    m.m[6] = 2.0 * (yz + wx);
    m.m[7] = 0.0;
    m.m[8] = 2.0 * (xz + wy);
    m.m[9] = 2.0 * (yz - wx);
    m.m[10] = 1.0 - 2.0 * (xx + yy);
    m.m[11] = 0.0;
    m.m[12] = 0.0;
    m.m[13] = 0.0;
    m.m[14] = 0.0;
    m.m[15] = 1.0;
    return m;
}

mod clone_quaternion {
    use super::*;

    #[test]
    fn creates_an_independent_copy() {
        let q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        let c = clone_quaternion(&q);
        assert_eq!(c.x, 1.0);
        assert_eq!(c.y, 2.0);
        assert_eq!(c.z, 3.0);
        assert_eq!(c.w, 4.0);
    }
}

mod conjugate_quaternion {
    use super::*;

    #[test]
    fn negates_the_vector_part() {
        let q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        conjugate_quaternion(&mut out, &q);
        assert_quaternion_close(&out, -1.0, -2.0, -3.0, 4.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        let q_clone = clone_quaternion(&q);
        conjugate_quaternion(&mut q, &q_clone);
        assert_quaternion_close(&q, -1.0, -2.0, -3.0, 4.0);
    }
}

mod copy_quaternion {
    use super::*;

    #[test]
    fn copies_all_components() {
        let src = create_quaternion(5.0, 6.0, 7.0, 8.0);
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        copy_quaternion(&mut out, &src);
        assert_quaternion_close(&out, 5.0, 6.0, 7.0, 8.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut q = create_quaternion(5.0, 6.0, 7.0, 8.0);
        let q_clone = clone_quaternion(&q);
        copy_quaternion(&mut q, &q_clone);
        assert_quaternion_close(&q, 5.0, 6.0, 7.0, 8.0);
    }
}

mod create_quaternion {
    use super::*;

    #[test]
    fn defaults_to_identity() {
        let q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        assert_quaternion_close(&q, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn uses_provided_components() {
        let q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        assert_quaternion_close(&q, 1.0, 2.0, 3.0, 4.0);
    }
}

mod equals_quaternion {
    use super::*;

    #[test]
    fn returns_true_for_identical_components() {
        assert!(equals_quaternion(
            Some(&create_quaternion(1.0, 2.0, 3.0, 4.0)),
            Some(&create_quaternion(1.0, 2.0, 3.0, 4.0))
        ));
    }

    #[test]
    fn returns_true_for_the_same_reference() {
        let q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        assert!(equals_quaternion(Some(&q), Some(&q)));
    }

    #[test]
    fn returns_false_for_differing_components() {
        assert!(!equals_quaternion(
            Some(&create_quaternion(1.0, 2.0, 3.0, 4.0)),
            Some(&create_quaternion(1.0, 2.0, 3.0, 5.0))
        ));
    }

    #[test]
    fn returns_false_for_none_inputs() {
        assert!(!equals_quaternion(
            None,
            Some(&create_quaternion(0.0, 0.0, 0.0, 1.0))
        ));
        assert!(!equals_quaternion(
            Some(&create_quaternion(0.0, 0.0, 0.0, 1.0)),
            None
        ));
    }
}

mod get_quaternion_angle_between {
    use super::*;

    #[test]
    fn returns_zero_for_two_identical_quaternions() {
        let a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        assert_approx_tight(get_quaternion_angle_between(&a, &a), 0.0);
    }

    #[test]
    fn returns_the_angle_between_two_axis_angle_quaternions() {
        let mut a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut a, &create_vector3(0.0, 1.0, 0.0), 0.0);
        set_quaternion_from_axis_angle(&mut b, &create_vector3(0.0, 1.0, 0.0), PI / 2.0);
        assert_approx(get_quaternion_angle_between(&a, &b), PI / 2.0);
    }
}

mod get_quaternion_axis_angle {
    use super::*;

    #[test]
    fn returns_angle_zero_and_axis_1_0_0_for_the_identity_quaternion() {
        let mut axis = create_vector3(0.0, 0.0, 0.0);
        let angle = get_quaternion_axis_angle(&mut axis, &create_quaternion(0.0, 0.0, 0.0, 1.0));
        assert_eq!(angle, 0.0);
        assert_eq!(axis.x, 1.0);
        assert_eq!(axis.y, 0.0);
        assert_eq!(axis.z, 0.0);
    }

    #[test]
    fn round_trips_with_set_quaternion_from_axis_angle() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let in_axis = create_vector3(0.0, 1.0, 0.0);
        let in_angle = PI / 3.0;
        set_quaternion_from_axis_angle(&mut q, &in_axis, in_angle);
        let mut out_axis = create_vector3(0.0, 0.0, 0.0);
        let out_angle = get_quaternion_axis_angle(&mut out_axis, &q);
        assert_approx(out_angle, in_angle);
        assert_approx(out_axis.x, 0.0);
        assert_approx(out_axis.y, 1.0);
        assert_approx(out_axis.z, 0.0);
    }

    #[test]
    fn extracts_a_diagonal_axis_correctly() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let inv_sqrt3 = 1.0_f32 / 3.0_f32.sqrt();
        let in_axis = create_vector3(inv_sqrt3, inv_sqrt3, inv_sqrt3);
        set_quaternion_from_axis_angle(&mut q, &in_axis, 1.5);
        let mut out_axis = create_vector3(0.0, 0.0, 0.0);
        let out_angle = get_quaternion_axis_angle(&mut out_axis, &q);
        assert_approx(out_angle, 1.5);
        assert_approx(out_axis.x, in_axis.x);
        assert_approx(out_axis.y, in_axis.y);
        assert_approx(out_axis.z, in_axis.z);
    }
}

mod get_quaternion_dot {
    use super::*;

    #[test]
    fn returns_one_for_identical_unit_quaternions() {
        let q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        assert_approx_tight(get_quaternion_dot(&q, &q), 1.0);
    }

    #[test]
    fn computes_the_four_component_dot_product() {
        let a = create_quaternion(1.0, 2.0, 3.0, 4.0);
        let b = create_quaternion(5.0, 6.0, 7.0, 8.0);
        assert_eq!(
            get_quaternion_dot(&a, &b),
            1.0 * 5.0 + 2.0 * 6.0 + 3.0 * 7.0 + 4.0 * 8.0
        );
    }
}

mod get_quaternion_euler {
    use super::*;

    #[test]
    fn identity_quaternion_decodes_to_zero_for_xyz_order() {
        let q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut out, &q, EulerOrder::XYZ);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn pure_x_rotation_round_trips_xyz_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.8, 0.0, 0.0, EulerOrder::XYZ);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut out, &q, EulerOrder::XYZ);
        assert_approx(out.x, 0.8);
        assert_approx(out.y, 0.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn pure_y_rotation_round_trips_xyz_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.0, 0.6, 0.0, EulerOrder::XYZ);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut out, &q, EulerOrder::XYZ);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 0.6);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn combined_rotation_round_trips_for_xyz_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.3, 0.5, 0.7, EulerOrder::XYZ);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &q, EulerOrder::XYZ);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, EulerOrder::XYZ);
        let dot = get_quaternion_dot(&q, &back);
        assert_approx_tight(dot.abs(), 1.0);
    }

    #[test]
    fn combined_rotation_round_trips_for_xzy_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.3, 0.5, 0.7, EulerOrder::XZY);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &q, EulerOrder::XZY);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, EulerOrder::XZY);
        let dot = get_quaternion_dot(&q, &back);
        assert_approx_tight(dot.abs(), 1.0);
    }

    #[test]
    fn combined_rotation_round_trips_for_yxz_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.3, 0.5, 0.7, EulerOrder::YXZ);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &q, EulerOrder::YXZ);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, EulerOrder::YXZ);
        let dot = get_quaternion_dot(&q, &back);
        assert_approx_tight(dot.abs(), 1.0);
    }

    #[test]
    fn combined_rotation_round_trips_for_yzx_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.3, 0.5, 0.7, EulerOrder::YZX);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &q, EulerOrder::YZX);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, EulerOrder::YZX);
        let dot = get_quaternion_dot(&q, &back);
        assert_approx_tight(dot.abs(), 1.0);
    }

    #[test]
    fn combined_rotation_round_trips_for_zxy_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.3, 0.5, 0.7, EulerOrder::ZXY);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &q, EulerOrder::ZXY);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, EulerOrder::ZXY);
        let dot = get_quaternion_dot(&q, &back);
        assert_approx_tight(dot.abs(), 1.0);
    }

    #[test]
    fn combined_rotation_round_trips_for_zyx_order() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, 0.3, 0.5, 0.7, EulerOrder::ZYX);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &q, EulerOrder::ZYX);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, EulerOrder::ZYX);
        let dot = get_quaternion_dot(&q, &back);
        assert_approx_tight(dot.abs(), 1.0);
    }

    fn run_fuzz_test(order: EulerOrder, order_char: u8) {
        let mut seed: i32 = 0x9e3779b9_u32 as i32 ^ (order_char as i32);
        let mut next = || -> f32 {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            return ((seed as u32) as f64 / 0xFFFFFFFF_u64 as f64) as f32 * 2.0 - 1.0;
        };
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        for _i in 0..200 {
            initialize_quaternion(&mut q, next(), next(), next(), next());
            let q_copy = clone_quaternion(&q);
            normalize_quaternion(&mut q, &q_copy);
            get_quaternion_euler(&mut euler, &q, order);
            set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, order);
            let dot_abs = get_quaternion_dot(&q, &back).abs();
            assert_approx(dot_abs, 1.0);
        }
    }

    #[test]
    fn round_trips_a_fuzzed_set_of_unit_quaternions_for_xyz_order() {
        run_fuzz_test(EulerOrder::XYZ, b'X');
    }

    #[test]
    fn round_trips_a_fuzzed_set_of_unit_quaternions_for_xzy_order() {
        run_fuzz_test(EulerOrder::XZY, b'X');
    }

    #[test]
    fn round_trips_a_fuzzed_set_of_unit_quaternions_for_yxz_order() {
        run_fuzz_test(EulerOrder::YXZ, b'Y');
    }

    #[test]
    fn round_trips_a_fuzzed_set_of_unit_quaternions_for_yzx_order() {
        run_fuzz_test(EulerOrder::YZX, b'Y');
    }

    #[test]
    fn round_trips_a_fuzzed_set_of_unit_quaternions_for_zxy_order() {
        run_fuzz_test(EulerOrder::ZXY, b'Z');
    }

    #[test]
    fn round_trips_a_fuzzed_set_of_unit_quaternions_for_zyx_order() {
        run_fuzz_test(EulerOrder::ZYX, b'Z');
    }

    fn run_gimbal_test(order: EulerOrder) {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, PI / 2.0, PI / 2.0, PI / 2.0, order);
        let mut euler = create_vector3(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &q, order);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, order);
        let dot_abs = get_quaternion_dot(&q, &back).abs();
        assert_approx_tight(dot_abs, 1.0);
    }

    #[test]
    fn round_trips_at_the_gimbal_singularity_for_xyz_order() {
        run_gimbal_test(EulerOrder::XYZ);
    }

    #[test]
    fn round_trips_at_the_gimbal_singularity_for_xzy_order() {
        run_gimbal_test(EulerOrder::XZY);
    }

    #[test]
    fn round_trips_at_the_gimbal_singularity_for_yxz_order() {
        run_gimbal_test(EulerOrder::YXZ);
    }

    #[test]
    fn round_trips_at_the_gimbal_singularity_for_yzx_order() {
        run_gimbal_test(EulerOrder::YZX);
    }

    #[test]
    fn round_trips_at_the_gimbal_singularity_for_zxy_order() {
        run_gimbal_test(EulerOrder::ZXY);
    }

    #[test]
    fn round_trips_at_the_gimbal_singularity_for_zyx_order() {
        run_gimbal_test(EulerOrder::ZYX);
    }
}

mod initialize_quaternion {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_quaternion() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        initialize_quaternion(&mut q, 3.0, 7.0, 11.0, 13.0);
        assert_eq!(q.x, 3.0);
        assert_eq!(q.y, 7.0);
        assert_eq!(q.z, 11.0);
        assert_eq!(q.w, 13.0);
    }
}

mod inverse_quaternion {
    use super::*;

    #[test]
    fn q_times_inverse_q_is_identity_for_a_unit_quaternion() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 1.0, 0.0), PI / 3.0);
        let mut inv = create_quaternion(0.0, 0.0, 0.0, 1.0);
        inverse_quaternion(&mut inv, &q);
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        multiply_quaternion(&mut out, &q, &inv);
        assert_quaternion_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(1.0, 0.0, 0.0), PI / 4.0);
        let mut expected = create_quaternion(0.0, 0.0, 0.0, 1.0);
        inverse_quaternion(&mut expected, &q);
        let q_clone = clone_quaternion(&q);
        inverse_quaternion(&mut q, &q_clone);
        assert_quaternion_close(&q, expected.x, expected.y, expected.z, expected.w);
    }

    #[test]
    fn writes_the_identity_rotation_for_a_zero_length_quaternion() {
        let mut out = create_quaternion(9.0, 9.0, 9.0, 9.0);
        inverse_quaternion(&mut out, &create_quaternion(0.0, 0.0, 0.0, 0.0));
        assert_quaternion_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn divides_a_non_unit_quaternion_by_its_squared_length() {
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        inverse_quaternion(&mut out, &create_quaternion(0.0, 2.0, 0.0, 0.0));
        assert_quaternion_close(&out, 0.0, -0.5, 0.0, 0.0);
    }
}

mod multiply_quaternion {
    use super::*;

    #[test]
    fn multiplying_by_identity_returns_the_original() {
        let a = create_quaternion(0.5, 0.5, 0.5, 0.5);
        let id = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        multiply_quaternion(&mut out, &a, &id);
        assert_quaternion_close(&out, 0.5, 0.5, 0.5, 0.5);
    }

    #[test]
    fn composes_two_axis_rotations_into_a_180_degree_turn_about_z() {
        let z = create_vector3(0.0, 0.0, 1.0);
        let mut a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut a, &z, PI / 2.0);
        set_quaternion_from_axis_angle(&mut b, &z, PI / 2.0);
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        multiply_quaternion(&mut out, &a, &b);
        assert_quaternion_close(&out, 0.0, 0.0, 1.0, 0.0);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_quaternion(0.5, 0.5, 0.5, 0.5);
        let id = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let a_clone = clone_quaternion(&a);
        multiply_quaternion(&mut a, &a_clone, &id);
        assert_quaternion_close(&a, 0.5, 0.5, 0.5, 0.5);
    }

    #[test]
    fn supports_out_equals_b() {
        let id = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.5, 0.5, 0.5, 0.5);
        let b_clone = clone_quaternion(&b);
        multiply_quaternion(&mut b, &id, &b_clone);
        assert_quaternion_close(&b, 0.5, 0.5, 0.5, 0.5);
    }
}

mod normalize_quaternion {
    use super::*;

    #[test]
    fn produces_a_unit_quaternion_and_returns_the_original_length() {
        let q = create_quaternion(0.0, 0.0, 0.0, 2.0);
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let l = normalize_quaternion(&mut out, &q);
        assert_approx_tight(l, 2.0);
        assert_quaternion_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn maps_a_zero_quaternion_to_identity() {
        let q = create_quaternion(0.0, 0.0, 0.0, 0.0);
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let l = normalize_quaternion(&mut out, &q);
        assert_eq!(l, 0.0);
        assert_quaternion_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn supports_out_equals_source() {
        let mut q = create_quaternion(0.0, 3.0, 0.0, 0.0);
        let q_clone = clone_quaternion(&q);
        normalize_quaternion(&mut q, &q_clone);
        assert_quaternion_close(&q, 0.0, 1.0, 0.0, 0.0);
    }
}

mod rotate_vector3_by_quaternion {
    use super::*;

    #[test]
    fn ninety_degree_rotation_about_z_maps_plus_x_to_plus_y() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 0.0, 1.0), PI / 2.0);
        let v = create_vector3(1.0, 0.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &v, &q);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 1.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn identity_quaternion_leaves_vector_unchanged() {
        let q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let v = create_vector3(3.0, 4.0, 5.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &v, &q);
        assert_approx(out.x, 3.0);
        assert_approx(out.y, 4.0);
        assert_approx(out.z, 5.0);
    }

    #[test]
    fn supports_out_equals_vector() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 0.0, 1.0), PI / 2.0);
        let mut v = create_vector3(1.0, 0.0, 0.0);
        let v_copy = v.clone();
        rotate_vector3_by_quaternion(&mut v, &v_copy, &q);
        assert_approx(v.x, 0.0);
        assert_approx(v.y, 1.0);
    }
}

mod set_quaternion {
    use super::*;

    #[test]
    fn sets_the_components_directly() {
        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion(&mut out, 0.1, 0.2, 0.3, 0.4);
        assert_eq!(out.x, 0.1);
        assert_eq!(out.y, 0.2);
        assert_eq!(out.z, 0.3);
        assert_eq!(out.w, 0.4);
    }
}

mod set_quaternion_from_axis_angle {
    use super::*;

    #[test]
    fn builds_a_half_angle_quaternion() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 1.0, 0.0), PI / 2.0);
        assert_quaternion_close(&q, 0.0, (PI / 4.0).sin(), 0.0, (PI / 4.0).cos());
    }

    #[test]
    fn zero_angle_yields_identity() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(1.0, 0.0, 0.0), 0.0);
        assert_quaternion_close(&q, 0.0, 0.0, 0.0, 1.0);
    }
}

mod set_quaternion_from_euler {
    use super::*;

    #[test]
    fn zero_angles_yield_identity() {
        let mut q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        set_quaternion_from_euler(&mut q, 0.0, 0.0, 0.0, EulerOrder::XYZ);
        assert_quaternion_close(&q, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn ninety_degrees_about_x_only() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut q, PI / 2.0, 0.0, 0.0, EulerOrder::XYZ);
        assert_quaternion_close(&q, (PI / 4.0).sin(), 0.0, 0.0, (PI / 4.0).cos());
    }
}

mod set_quaternion_from_matrix4 {
    use super::*;

    #[test]
    fn round_trips_through_quaternion_to_matrix4() {
        let axis = create_vector3(0.0, 0.0, 1.0);
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &axis, PI / 3.0);
        let m = quaternion_to_matrix4(&q);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_matrix4(&mut back, &m);
        let dot = back.x * q.x + back.y * q.y + back.z * q.z + back.w * q.w;
        assert_approx_tight(dot.abs(), 1.0);
    }

    #[test]
    fn identity_matrix_yields_identity_quaternion() {
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_matrix4(&mut back, &create_matrix4());
        assert_quaternion_close(&back, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn round_trips_a_half_turn_about_x() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(1.0, 0.0, 0.0), PI);
        let m = quaternion_to_matrix4(&q);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_matrix4(&mut back, &m);
        let round_tripped = quaternion_to_matrix4(&back);
        for i in 0..16 {
            assert_approx_tight(round_tripped.m[i], m.m[i]);
        }
    }

    #[test]
    fn round_trips_a_half_turn_about_y() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 1.0, 0.0), PI);
        let m = quaternion_to_matrix4(&q);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_matrix4(&mut back, &m);
        let round_tripped = quaternion_to_matrix4(&back);
        for i in 0..16 {
            assert_approx_tight(round_tripped.m[i], m.m[i]);
        }
    }

    #[test]
    fn round_trips_a_half_turn_about_z() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 0.0, 1.0), PI);
        let m = quaternion_to_matrix4(&q);
        let mut back = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_matrix4(&mut back, &m);
        let round_tripped = quaternion_to_matrix4(&back);
        for i in 0..16 {
            assert_approx_tight(round_tripped.m[i], m.m[i]);
        }
    }

    #[test]
    fn writes_the_same_values_whether_out_is_fresh_or_already_holds_a_rotation() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut q, &create_vector3(0.0, 1.0, 0.0), PI / 3.0);
        let m = quaternion_to_matrix4(&q);
        let mut fresh = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut reused = create_quaternion(9.0, 9.0, 9.0, 9.0);
        set_quaternion_from_matrix4(&mut fresh, &m);
        set_quaternion_from_matrix4(&mut reused, &m);
        assert_quaternion_close(&reused, fresh.x, fresh.y, fresh.z, fresh.w);
    }
}

mod set_quaternion_from_unit_vectors {
    use super::*;

    #[test]
    fn plus_x_to_plus_y_yields_90_degree_rotation_about_z() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let from = create_vector3(1.0, 0.0, 0.0);
        let to = create_vector3(0.0, 1.0, 0.0);
        set_quaternion_from_unit_vectors(&mut q, &from, &to);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &from, &q);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 1.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn same_direction_yields_identity() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let v = create_vector3(0.0, 1.0, 0.0);
        set_quaternion_from_unit_vectors(&mut q, &v, &v);
        assert_quaternion_close(&q, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn antiparallel_vectors_produce_a_180_degree_rotation() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_unit_vectors(
            &mut q,
            &create_vector3(1.0, 0.0, 0.0),
            &create_vector3(-1.0, 0.0, 0.0),
        );
        let mut out = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &create_vector3(1.0, 0.0, 0.0), &q);
        assert_approx(out.x, -1.0);
    }

    #[test]
    fn antiparallel_along_plus_y_produces_a_valid_180_degree_rotation() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_unit_vectors(
            &mut q,
            &create_vector3(0.0, 1.0, 0.0),
            &create_vector3(0.0, -1.0, 0.0),
        );
        let len = (q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w).sqrt();
        assert_approx_tight(len, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &create_vector3(0.0, 1.0, 0.0), &q);
        assert_approx(out.x, 0.0);
        assert_approx(out.y, -1.0);
        assert_approx(out.z, 0.0);
    }
}

mod set_quaternion_identity {
    use super::*;

    #[test]
    fn resets_to_identity() {
        let mut q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        set_quaternion_identity(&mut q);
        assert_quaternion_close(&q, 0.0, 0.0, 0.0, 1.0);
    }
}

mod set_quaternion_look_rotation {
    use super::*;

    #[test]
    fn preserves_a_non_z_aligned_forward_direction_when_up_is_parallel() {
        let raw_forward = create_vector3(2.0, 3.0, 6.0);
        let length = (raw_forward.x * raw_forward.x
            + raw_forward.y * raw_forward.y
            + raw_forward.z * raw_forward.z)
            .sqrt();
        let forward = create_vector3(
            raw_forward.x / length,
            raw_forward.y / length,
            raw_forward.z / length,
        );
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(&mut q, &forward, &forward);
        let mut rotated = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &create_vector3(0.0, 0.0, 1.0), &q);
        assert_approx_tight(rotated.x, forward.x);
        assert_approx_tight(rotated.y, forward.y);
        assert_approx_tight(rotated.z, forward.z);
    }

    #[test]
    fn preserves_a_z_aligned_forward_direction_when_up_is_parallel() {
        let raw_forward = create_vector3(1.0, 2.0, 20.0);
        let length = (raw_forward.x * raw_forward.x
            + raw_forward.y * raw_forward.y
            + raw_forward.z * raw_forward.z)
            .sqrt();
        let forward = create_vector3(
            raw_forward.x / length,
            raw_forward.y / length,
            raw_forward.z / length,
        );
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(&mut q, &forward, &forward);
        let mut rotated = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &create_vector3(0.0, 0.0, 1.0), &q);
        assert_approx_tight(rotated.x, forward.x);
        assert_approx_tight(rotated.y, forward.y);
        assert_approx_tight(rotated.z, forward.z);
    }

    #[test]
    fn zero_forward_yields_identity() {
        let mut q = create_quaternion(1.0, 2.0, 3.0, 4.0);
        set_quaternion_look_rotation(
            &mut q,
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        assert_quaternion_close(&q, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn consistent_result_calling_twice_produces_same_output() {
        let mut q1 = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut q2 = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(
            &mut q1,
            &create_vector3(1.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        set_quaternion_look_rotation(
            &mut q2,
            &create_vector3(1.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        assert_quaternion_close(&q1, q2.x, q2.y, q2.z, q2.w);
    }

    #[test]
    fn plus_z_forward_with_plus_y_up_yields_identity() {
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(
            &mut q,
            &create_vector3(0.0, 0.0, 1.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        assert_quaternion_close(&q, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn rotates_plus_z_onto_an_asymmetric_forward_direction() {
        let forward = create_vector3(2.0 / 7.0, 3.0 / 7.0, 6.0 / 7.0);
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(&mut q, &forward, &create_vector3(0.0, 1.0, 0.0));
        let mut rotated = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &create_vector3(0.0, 0.0, 1.0), &q);
        assert_approx_tight(rotated.x, forward.x);
        assert_approx_tight(rotated.y, forward.y);
        assert_approx_tight(rotated.z, forward.z);
    }

    #[test]
    fn rotates_plus_z_onto_forward_for_neg_z_with_plus_y_up() {
        let forward = create_vector3(0.0, 0.0, -1.0);
        let up = create_vector3(0.0, 1.0, 0.0);
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(&mut q, &forward, &up);
        let mut rotated = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &create_vector3(0.0, 0.0, 1.0), &q);
        assert_approx_tight(rotated.x, forward.x);
        assert_approx_tight(rotated.y, forward.y);
        assert_approx_tight(rotated.z, forward.z);
    }

    #[test]
    fn rotates_plus_z_onto_forward_for_neg_z_with_neg_y_up() {
        let forward = create_vector3(0.0, 0.0, -1.0);
        let up = create_vector3(0.0, -1.0, 0.0);
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(&mut q, &forward, &up);
        let mut rotated = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &create_vector3(0.0, 0.0, 1.0), &q);
        assert_approx_tight(rotated.x, forward.x);
        assert_approx_tight(rotated.y, forward.y);
        assert_approx_tight(rotated.z, forward.z);
    }

    #[test]
    fn rotates_plus_z_onto_forward_for_plus_z_with_neg_y_up() {
        let forward = create_vector3(0.0, 0.0, 1.0);
        let up = create_vector3(0.0, -1.0, 0.0);
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(&mut q, &forward, &up);
        let mut rotated = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &create_vector3(0.0, 0.0, 1.0), &q);
        assert_approx_tight(rotated.x, forward.x);
        assert_approx_tight(rotated.y, forward.y);
        assert_approx_tight(rotated.z, forward.z);
    }

    #[test]
    fn rotates_plus_z_onto_forward_for_neg_x_with_neg_y_up() {
        let forward = create_vector3(-1.0, 0.0, 0.0);
        let up = create_vector3(0.0, -1.0, 0.0);
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_look_rotation(&mut q, &forward, &up);
        let mut rotated = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &create_vector3(0.0, 0.0, 1.0), &q);
        assert_approx_tight(rotated.x, forward.x);
        assert_approx_tight(rotated.y, forward.y);
        assert_approx_tight(rotated.z, forward.z);
    }
}

mod slerp_quaternion {
    use super::*;

    #[test]
    fn returns_a_at_t_zero_and_b_at_t_one() {
        let a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &create_vector3(0.0, 1.0, 0.0), PI / 2.0);

        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        slerp_quaternion(&mut out, &a, &b, 0.0);
        assert_quaternion_close(&out, a.x, a.y, a.z, a.w);
        slerp_quaternion(&mut out, &a, &b, 1.0);
        assert_quaternion_close(&out, b.x, b.y, b.z, b.w);
    }

    #[test]
    fn halfway_interpolates_about_a_tilted_axis() {
        let inv_sqrt14 = 1.0_f32 / 14.0_f32.sqrt();
        let axis = create_vector3(1.0 * inv_sqrt14, 2.0 * inv_sqrt14, 3.0 * inv_sqrt14);
        let a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &axis, PI / 2.0);

        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        slerp_quaternion(&mut out, &a, &b, 0.5);

        let mut expected = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut expected, &axis, PI / 4.0);
        assert_quaternion_close(&out, expected.x, expected.y, expected.z, expected.w);
    }

    #[test]
    fn takes_the_shortest_path_when_inputs_face_opposite_hemispheres() {
        let inv_sqrt14 = 1.0_f32 / 14.0_f32.sqrt();
        let axis = create_vector3(1.0 * inv_sqrt14, 2.0 * inv_sqrt14, 3.0 * inv_sqrt14);
        let a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut far = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut far, &axis, PI / 2.0);
        let negated = create_quaternion(-far.x, -far.y, -far.z, -far.w);

        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        slerp_quaternion(&mut out, &a, &negated, 0.5);

        let mut expected = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut expected, &axis, PI / 4.0);
        assert_quaternion_close(&out, expected.x, expected.y, expected.z, expected.w);
    }

    #[test]
    fn halfway_interpolates_the_angle() {
        let a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &create_vector3(0.0, 1.0, 0.0), PI / 2.0);

        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        slerp_quaternion(&mut out, &a, &b, 0.5);

        let mut expected = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut expected, &create_vector3(0.0, 1.0, 0.0), PI / 4.0);
        assert_quaternion_close(&out, expected.x, expected.y, expected.z, expected.w);
    }

    #[test]
    fn supports_out_equals_a() {
        let mut a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &create_vector3(0.0, 1.0, 0.0), PI / 2.0);
        let a_clone = clone_quaternion(&a);
        slerp_quaternion(&mut a, &a_clone, &b, 1.0);
        assert_quaternion_close(&a, b.x, b.y, b.z, b.w);
    }

    #[test]
    fn supports_out_equals_b() {
        let a = create_quaternion(1.0, 0.0, 0.0, 0.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let b_clone = clone_quaternion(&b);
        slerp_quaternion(&mut b, &a, &b_clone, 0.0);
        assert_quaternion_close(&b, a.x, a.y, a.z, a.w);
    }

    #[test]
    fn takes_the_shorter_arc_when_inputs_have_negative_dot_product() {
        let a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut quarter_turn = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quarter_turn, &create_vector3(0.0, 1.0, 0.0), PI / 2.0);
        let negated = create_quaternion(
            -quarter_turn.x,
            -quarter_turn.y,
            -quarter_turn.z,
            -quarter_turn.w,
        );

        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        slerp_quaternion(&mut out, &a, &negated, 0.5);

        let mut eighth_turn = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut eighth_turn, &create_vector3(0.0, 1.0, 0.0), PI / 4.0);
        assert_approx_tight(get_quaternion_dot(&out, &eighth_turn).abs(), 1.0);
    }

    #[test]
    fn interpolates_nearly_identical_rotations_without_dividing_by_zero() {
        let a = create_quaternion(0.0, 0.0, 0.0, 1.0);
        let mut b = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &create_vector3(0.0, 1.0, 0.0), 1e-7);

        let mut out = create_quaternion(0.0, 0.0, 0.0, 1.0);
        slerp_quaternion(&mut out, &a, &b, 0.5);

        assert!(out.x.is_finite());
        assert!(out.y.is_finite());
        assert!(out.z.is_finite());
        assert!(out.w.is_finite());
        assert_approx_tight(get_quaternion_dot(&out, &out), 1.0);
    }
}
