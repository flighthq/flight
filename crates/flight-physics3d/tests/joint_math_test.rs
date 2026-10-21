use super::*;
use crate::common::*;

fn unit_body() -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    data.mass = 1.0;
    data.inertia_xx = 1.0;
    data.inertia_yy = 1.0;
    data.inertia_zz = 1.0;
    {
        let mut body = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body, &data);
        refresh_rigid_body_3d_world_inertia(&mut body);
    }
    body
}

fn test_joint() -> flight_entity::Ref<Physics3DBallAndSocketJoint> {
    physics_3d_ball_and_socket_joint(&joint_options(0, 1))
}

fn set_axis_angle(body: &RigidBody3DRef, x: f32, y: f32, z: f32, angle: f32) {
    let sine = (angle * 0.5).sin();
    let mut body = body.write().unwrap();
    body.orientation_x = x * sine;
    body.orientation_y = y * sine;
    body.orientation_z = z * sine;
    body.orientation_w = (angle * 0.5).cos();
    refresh_rigid_body_3d_world_inertia(&mut body);
}

fn normalized(x: f32, y: f32, z: f32) -> [f32; 3] {
    let length = (x * x + y * y + z * z).sqrt();
    [x / length, y / length, z / length]
}

fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn multiply(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}

fn assert_close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 1e-5,
        "actual={actual}, expected={expected}"
    );
}

mod apply_physics_3d_joint_angular_impulse {
    use super::*;

    #[test]
    fn spins_b_forward_and_a_backward_by_the_same_amount() {
        let a = unit_body();
        let b = unit_body();
        apply_physics_3d_joint_angular_impulse(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            2.0,
            0.0,
            0.0,
        );

        assert_close(a.read().unwrap().angular_velocity_x, -2.0);
        assert_close(b.read().unwrap().angular_velocity_x, 2.0);
    }

    #[test]
    fn leaves_linear_velocity_untouched() {
        let a = unit_body();
        let b = unit_body();
        apply_physics_3d_joint_angular_impulse(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            1.0,
            2.0,
            3.0,
        );

        assert_eq!(a.read().unwrap().velocity_x, 0.0);
        assert_eq!(b.read().unwrap().velocity_z, 0.0);
    }

    #[test]
    fn applies_nothing_to_a_body_with_no_rotational_freedom() {
        let a = unit_body();
        let b = rigid_body(Physics3DBodyType::Static);
        apply_physics_3d_joint_angular_impulse(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            1.0,
            0.0,
            0.0,
        );

        assert_eq!(b.read().unwrap().angular_velocity_x, 0.0);
        assert_close(a.read().unwrap().angular_velocity_x, -1.0);
    }
}

mod apply_physics_3d_joint_impulse {
    use super::*;

    #[test]
    fn pushes_b_along_the_impulse_and_a_against_it() {
        let a = unit_body();
        let b = unit_body();
        apply_physics_3d_joint_impulse(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            3.0,
            0.0,
            0.0,
        );

        assert_close(a.read().unwrap().velocity_x, -3.0);
        assert_close(b.read().unwrap().velocity_x, 3.0);
    }

    #[test]
    fn turns_a_body_whose_lever_arm_is_offset_from_its_center_of_mass() {
        let a = unit_body();
        let b = unit_body();
        apply_physics_3d_joint_impulse(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
        );

        assert_close(a.read().unwrap().angular_velocity_z, 1.0);
        assert_close(a.read().unwrap().velocity_x, -1.0);
        assert_eq!(b.read().unwrap().angular_velocity_z, 0.0);
    }
}

mod apply_physics_3d_joint_row_impulse {
    use super::*;

    #[test]
    fn pushes_b_along_the_row_direction_and_a_against_it() {
        let a = unit_body();
        let b = unit_body();
        apply_physics_3d_joint_row_impulse(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            2.0,
        );

        assert_close(a.read().unwrap().velocity_x, -2.0);
        assert_close(b.read().unwrap().velocity_x, 2.0);
    }

    #[test]
    fn cancels_the_row_velocity_when_scaled_by_the_row_mass() {
        let a = unit_body();
        let b = unit_body();
        {
            let mut a = a.write().unwrap();
            a.velocity_y = -0.4;
            a.angular_velocity_z = 0.9;
        }
        {
            let mut b = b.write().unwrap();
            b.velocity_x = 1.7;
            b.angular_velocity_y = -1.3;
        }
        let direction = normalized(0.3, 0.5, -0.8);
        let arm_a = [1.1, -0.2, 0.6];
        let arm_b = [-0.4, 0.9, 0.3];
        let mass = get_physics_3d_joint_row_mass(
            &a.read().unwrap(),
            &b.read().unwrap(),
            direction[0],
            direction[1],
            direction[2],
            arm_a[0],
            arm_a[1],
            arm_a[2],
            arm_b[0],
            arm_b[1],
            arm_b[2],
        );
        let velocity = get_physics_3d_joint_row_velocity(
            &a.read().unwrap(),
            &b.read().unwrap(),
            direction[0],
            direction[1],
            direction[2],
            arm_a[0],
            arm_a[1],
            arm_a[2],
            arm_b[0],
            arm_b[1],
            arm_b[2],
        );

        apply_physics_3d_joint_row_impulse(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            direction[0],
            direction[1],
            direction[2],
            arm_a[0],
            arm_a[1],
            arm_a[2],
            arm_b[0],
            arm_b[1],
            arm_b[2],
            -velocity * mass,
        );

        assert!(velocity.abs() > 1e-3);
        let after = get_physics_3d_joint_row_velocity(
            &a.read().unwrap(),
            &b.read().unwrap(),
            direction[0],
            direction[1],
            direction[2],
            arm_a[0],
            arm_a[1],
            arm_a[2],
            arm_b[0],
            arm_b[1],
            arm_b[2],
        );
        assert_close(after, 0.0);
    }
}

mod get_physics_3d_joint_row_mass {
    use super::*;

    #[test]
    fn reduces_to_the_pair_mass_for_a_linear_row_through_both_centers() {
        let a = unit_body();
        let b = unit_body();
        let mass = get_physics_3d_joint_row_mass(
            &a.read().unwrap(),
            &b.read().unwrap(),
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
        );
        assert_close(mass, 0.5);
    }

    #[test]
    fn drops_the_translational_term_for_a_purely_angular_row() {
        let a = unit_body();
        let b = unit_body();
        let mass = get_physics_3d_joint_row_mass(
            &a.read().unwrap(),
            &b.read().unwrap(),
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
        );
        assert_close(mass, 0.5);
    }

    #[test]
    fn returns_zero_when_neither_body_can_respond() {
        let a = rigid_body(Physics3DBodyType::Static);
        let b = rigid_body(Physics3DBodyType::Static);
        let mass = get_physics_3d_joint_row_mass(
            &a.read().unwrap(),
            &b.read().unwrap(),
            1.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
        );
        assert_eq!(mass, 0.0);
    }
}

mod get_physics_3d_joint_row_velocity {
    use super::*;

    #[test]
    fn agrees_with_the_anchor_velocity_for_a_point_row() {
        let a = unit_body();
        let b = unit_body();
        a.write().unwrap().angular_velocity_z = 0.7;
        {
            let mut b = b.write().unwrap();
            b.velocity_y = -1.2;
            b.angular_velocity_x = 0.5;
        }
        let joint = test_joint();
        {
            let mut joint = joint.write().unwrap();
            joint.joint.r_ax = 0.4;
            joint.joint.r_ay = 1.1;
            joint.joint.r_bz = -0.6;
        }
        let mut anchor_velocity = [0.0; 3];
        write_physics_3d_joint_anchor_velocity(
            &mut anchor_velocity,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &*joint.read().unwrap(),
        );
        let direction = normalized(0.2, -0.9, 0.4);
        let fields = &joint.read().unwrap().joint;
        let arm_a = cross([fields.r_ax, fields.r_ay, fields.r_az], direction);
        let arm_b = cross([fields.r_bx, fields.r_by, fields.r_bz], direction);
        let velocity = get_physics_3d_joint_row_velocity(
            &a.read().unwrap(),
            &b.read().unwrap(),
            direction[0],
            direction[1],
            direction[2],
            arm_a[0],
            arm_a[1],
            arm_a[2],
            arm_b[0],
            arm_b[1],
            arm_b[2],
        );
        let projected = anchor_velocity[0] * direction[0]
            + anchor_velocity[1] * direction[1]
            + anchor_velocity[2] * direction[2];
        assert_close(velocity, projected);
    }
}

mod swap_physics_3d_joint_frames {
    use super::*;

    #[test]
    fn exchanges_the_two_local_rotations() {
        let mut frames = Physics3DJointFrames {
            local_rotation_ax: 1.0,
            local_rotation_ay: 2.0,
            local_rotation_az: 3.0,
            local_rotation_aw: 4.0,
            local_rotation_bx: 5.0,
            local_rotation_by: 6.0,
            local_rotation_bz: 7.0,
            local_rotation_bw: 8.0,
        };

        swap_physics_3d_joint_frames(&mut frames);

        assert_eq!(
            (
                frames.local_rotation_ax,
                frames.local_rotation_ay,
                frames.local_rotation_az,
                frames.local_rotation_aw,
            ),
            (5.0, 6.0, 7.0, 8.0)
        );
        assert_eq!(
            (
                frames.local_rotation_bx,
                frames.local_rotation_by,
                frames.local_rotation_bz,
                frames.local_rotation_bw,
            ),
            (1.0, 2.0, 3.0, 4.0)
        );
    }
}

mod write_physics_3d_joint_anchor_velocity {
    use super::*;

    #[test]
    fn measures_b_relative_to_a() {
        let a = unit_body();
        let b = unit_body();
        b.write().unwrap().velocity_x = 1.0;
        let joint = test_joint();
        let mut out = [0.0; 3];

        write_physics_3d_joint_anchor_velocity(
            &mut out,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &*joint.read().unwrap(),
        );

        assert_eq!(out, [1.0, 0.0, 0.0]);
    }

    #[test]
    fn includes_the_rotational_contribution_at_each_lever_arm() {
        let a = unit_body();
        let b = unit_body();
        b.write().unwrap().angular_velocity_z = 1.0;
        let joint = test_joint();
        joint.write().unwrap().joint.r_bx = 1.0;
        let mut out = [0.0; 3];

        write_physics_3d_joint_anchor_velocity(
            &mut out,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &*joint.read().unwrap(),
        );

        assert_close(out[0], 0.0);
        assert_close(out[1], 1.0);
        assert_close(out[2], 0.0);
    }
}

mod write_physics_3d_joint_anchors {
    use super::*;

    #[test]
    fn copies_the_local_anchor_through_for_an_unrotated_body_at_its_origin() {
        let a = unit_body();
        let b = unit_body();
        let joint = test_joint();
        {
            let mut joint = joint.write().unwrap();
            joint.joint.local_anchor_ax = 1.0;
            joint.joint.local_anchor_ay = 2.0;
            joint.joint.local_anchor_az = 3.0;
        }

        write_physics_3d_joint_anchors(
            &mut *joint.write().unwrap(),
            &a.read().unwrap(),
            &b.read().unwrap(),
        );

        let joint = joint.read().unwrap();
        assert_close(joint.joint.r_ax, 1.0);
        assert_close(joint.joint.r_ay, 2.0);
        assert_close(joint.joint.r_az, 3.0);
    }

    #[test]
    fn rotates_the_local_anchor_by_the_body_orientation() {
        let a = unit_body();
        set_axis_angle(&a, 0.0, 0.0, 1.0, std::f32::consts::FRAC_PI_2);
        let b = unit_body();
        let joint = test_joint();
        joint.write().unwrap().joint.local_anchor_ax = 1.0;

        write_physics_3d_joint_anchors(
            &mut *joint.write().unwrap(),
            &a.read().unwrap(),
            &b.read().unwrap(),
        );

        let joint = joint.read().unwrap();
        assert_close(joint.joint.r_ax, 0.0);
        assert_close(joint.joint.r_ay, 1.0);
        assert_close(joint.joint.r_az, 0.0);
    }

    #[test]
    fn measures_the_arm_from_the_center_of_mass_not_the_body_origin() {
        let a = unit_body();
        a.write().unwrap().center_x = 0.5;
        let b = unit_body();
        let joint = test_joint();
        joint.write().unwrap().joint.local_anchor_ax = 2.0;

        write_physics_3d_joint_anchors(
            &mut *joint.write().unwrap(),
            &a.read().unwrap(),
            &b.read().unwrap(),
        );

        assert_close(joint.read().unwrap().joint.r_ax, 1.5);
    }
}

mod write_physics_3d_joint_angular_mass {
    use super::*;

    #[test]
    fn sums_the_two_world_inverse_inertia_tensors() {
        let a = unit_body();
        let b = unit_body();
        b.write().unwrap().inverse_inertia_world_xy = 0.25;
        let mut out = [0.0; 6];

        write_physics_3d_joint_angular_mass(&mut out, &a.read().unwrap(), &b.read().unwrap());

        assert_eq!(out, [2.0, 2.0, 2.0, 0.25, 0.0, 0.0]);
    }
}

mod write_physics_3d_joint_frame_basis {
    use super::*;

    #[test]
    fn produces_the_identity_basis_for_an_unrotated_body_and_identity_frame() {
        let body = unit_body();
        let mut out = [0.0; 9];

        write_physics_3d_joint_frame_basis(&mut out, &body.read().unwrap(), 0.0, 0.0, 0.0, 1.0);

        assert_eq!(out, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn carries_the_body_orientation_into_the_frame_axes() {
        let body = unit_body();
        set_axis_angle(&body, 0.0, 0.0, 1.0, std::f32::consts::FRAC_PI_2);
        let mut out = [0.0; 9];

        write_physics_3d_joint_frame_basis(&mut out, &body.read().unwrap(), 0.0, 0.0, 0.0, 1.0);

        assert_close(out[0], 0.0);
        assert_close(out[1], 1.0);
        assert_close(out[3], -1.0);
        assert_close(out[4], 0.0);
    }

    #[test]
    fn applies_the_local_rotation_before_the_body_orientation() {
        let body = unit_body();
        set_axis_angle(&body, 0.0, 0.0, 1.0, std::f32::consts::FRAC_PI_2);
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let mut out = [0.0; 9];

        write_physics_3d_joint_frame_basis(&mut out, &body.read().unwrap(), half, 0.0, 0.0, half);

        assert_close(out[3], 0.0);
        assert_close(out[4], 0.0);
        assert_close(out[5], 1.0);
    }
}

mod write_physics_3d_joint_frame_rotation {
    use super::*;

    #[test]
    fn returns_the_body_orientation_when_the_frame_is_identity() {
        let body = unit_body();
        set_axis_angle(&body, 0.0, 1.0, 0.0, 0.7);
        let mut out = [0.0; 4];

        write_physics_3d_joint_frame_rotation(&mut out, &body.read().unwrap(), 0.0, 0.0, 0.0, 1.0);

        let body = body.read().unwrap();
        assert_close(out[0], body.orientation_x);
        assert_close(out[1], body.orientation_y);
        assert_close(out[2], body.orientation_z);
        assert_close(out[3], body.orientation_w);
    }

    #[test]
    fn composes_two_quarter_turns_about_the_same_axis_into_a_half_turn() {
        let body = unit_body();
        set_axis_angle(&body, 0.0, 0.0, 1.0, std::f32::consts::FRAC_PI_2);
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let mut out = [0.0; 4];

        write_physics_3d_joint_frame_rotation(
            &mut out,
            &body.read().unwrap(),
            0.0,
            0.0,
            half,
            half,
        );

        assert_close(out[2], 1.0);
        assert_close(out[3], 0.0);
    }
}

mod write_physics_3d_joint_point_mass {
    use super::*;

    #[test]
    fn is_the_pair_mass_on_the_diagonal_when_both_anchors_are_at_the_centers() {
        let a = unit_body();
        let b = unit_body();
        let mut out = [0.0; 6];

        write_physics_3d_joint_point_mass(
            &mut out,
            &a.read().unwrap(),
            &b.read().unwrap(),
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
        );

        assert_eq!(out, [2.0, 2.0, 2.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn adds_the_rotational_resistance_of_an_offset_lever_arm() {
        let a = unit_body();
        let b = unit_body();
        let mut out = [0.0; 6];

        write_physics_3d_joint_point_mass(
            &mut out,
            &a.read().unwrap(),
            &b.read().unwrap(),
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
        );

        assert_close(out[0], 3.0);
        assert_close(out[1], 3.0);
        assert_close(out[2], 2.0);
        assert_eq!(&out[3..], &[0.0, 0.0, 0.0]);
    }

    #[test]
    fn stays_symmetric_for_a_lever_arm_off_every_axis() {
        let a = unit_body();
        let b = unit_body();
        let mut out = [0.0; 6];

        write_physics_3d_joint_point_mass(
            &mut out,
            &a.read().unwrap(),
            &b.read().unwrap(),
            0.3,
            -0.7,
            1.1,
            0.0,
            0.0,
            0.0,
        );

        assert_close(out[0], 2.0 + 0.7 * 0.7 + 1.1 * 1.1);
        assert_close(out[3], -0.3 * -0.7);
        assert_close(out[4], -0.3 * 1.1);
        assert_close(out[5], 0.7 * 1.1);
    }
}

mod write_physics_3d_joint_relative_rotation {
    use super::*;

    #[test]
    fn is_the_identity_for_coincident_frames() {
        let mut out = [0.0; 4];
        write_physics_3d_joint_relative_rotation(&mut out, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(out, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn expresses_the_relative_rotation_in_frame_a_not_world_space() {
        let quarter = std::f32::consts::FRAC_1_SQRT_2;
        let twist = 0.4_f32;
        let frame_b = multiply(
            [0.0, 0.0, quarter, quarter],
            [(twist * 0.5).sin(), 0.0, 0.0, (twist * 0.5).cos()],
        );
        let mut out = [0.0; 4];

        write_physics_3d_joint_relative_rotation(
            &mut out,
            quarter * 0.0,
            0.0,
            quarter,
            quarter,
            frame_b[0],
            frame_b[1],
            frame_b[2],
            frame_b[3],
        );

        assert_close(out[0], (twist * 0.5).sin());
        assert_close(out[1], 0.0);
        assert_close(out[2], 0.0);
    }

    #[test]
    fn returns_the_representative_with_a_non_negative_scalar_part() {
        let angle = std::f32::consts::TAU - 0.3;
        let half = angle * 0.5;
        let mut out = [0.0; 4];

        write_physics_3d_joint_relative_rotation(
            &mut out,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            half.sin(),
            half.cos(),
        );

        assert!(out[3] >= 0.0);
        assert_close(out[2], -0.15_f32.sin());
    }
}

mod write_physics_3d_joint_rotation_error {
    use super::*;

    #[test]
    fn is_zero_for_coincident_frames() {
        let mut out = [1.0; 3];
        write_physics_3d_joint_rotation_error(&mut out, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(out, [0.0; 3]);
    }

    #[test]
    fn reports_the_true_angle_rather_than_its_small_angle_approximation() {
        let mut out = [0.0; 3];
        let half = std::f32::consts::FRAC_1_SQRT_2;

        write_physics_3d_joint_rotation_error(&mut out, 0.0, 0.0, 0.0, 1.0, 0.0, half, 0.0, half);

        assert_close(out[0], 0.0);
        assert_close(out[1], std::f32::consts::FRAC_PI_2);
        assert_close(out[2], 0.0);
    }

    #[test]
    fn takes_the_shorter_arc_when_frames_are_aligned_the_long_way_round() {
        let mut out = [0.0; 3];
        let angle = std::f32::consts::TAU - 0.3;
        let half = angle * 0.5;

        write_physics_3d_joint_rotation_error(
            &mut out,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            half.sin(),
            half.cos(),
        );

        assert_close(out[2], -0.3);
    }

    #[test]
    fn expresses_the_error_in_world_space_not_in_frame_a() {
        let quarter = std::f32::consts::FRAC_1_SQRT_2;
        let twist = 0.4_f32;
        let frame_b = multiply(
            [0.0, 0.0, quarter, quarter],
            [(twist * 0.5).sin(), 0.0, 0.0, (twist * 0.5).cos()],
        );
        let mut out = [0.0; 3];

        write_physics_3d_joint_rotation_error(
            &mut out, 0.0, 0.0, quarter, quarter, frame_b[0], frame_b[1], frame_b[2], frame_b[3],
        );

        assert_close(out[0], 0.0);
        assert_close(out[1], twist);
        assert_close(out[2], 0.0);
    }
}

mod write_physics_3d_joint_separation {
    use super::*;

    #[test]
    fn measures_from_the_a_anchor_to_the_b_anchor() {
        let a = unit_body();
        let b = unit_body();
        b.write().unwrap().x = 5.0;
        let joint = test_joint();
        {
            let mut joint = joint.write().unwrap();
            joint.joint.local_anchor_ax = 1.0;
            joint.joint.local_anchor_bx = -1.0;
        }
        write_physics_3d_joint_anchors(
            &mut *joint.write().unwrap(),
            &a.read().unwrap(),
            &b.read().unwrap(),
        );
        let mut out = [0.0; 3];

        write_physics_3d_joint_separation(
            &mut out,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &*joint.read().unwrap(),
        );

        assert_close(out[0], 3.0);
    }

    #[test]
    fn does_not_shift_when_a_body_carries_an_offset_center_of_mass() {
        let a = unit_body();
        a.write().unwrap().center_x = 0.5;
        let b = unit_body();
        b.write().unwrap().x = 5.0;
        let joint = test_joint();
        {
            let mut joint = joint.write().unwrap();
            joint.joint.local_anchor_ax = 1.0;
            joint.joint.local_anchor_bx = -1.0;
        }
        write_physics_3d_joint_anchors(
            &mut *joint.write().unwrap(),
            &a.read().unwrap(),
            &b.read().unwrap(),
        );
        let mut out = [0.0; 3];

        write_physics_3d_joint_separation(
            &mut out,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &*joint.read().unwrap(),
        );

        assert_close(out[0], 3.0);
    }
}
